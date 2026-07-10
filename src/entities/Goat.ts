import { Container, Sprite, Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { GOAT, CG, groups, FIXED_DT, type Palette } from "../config";
import {
  add,
  clamp,
  closestOnSegment,
  norm,
  rotate,
  scale,
  sub,
  type Vec2,
} from "../core/math";
import type { Intent } from "../core/intent";
import { neutralIntent } from "../core/intent";
import type { Arena, Prop } from "../core/types";
import { getSkin, type GoatSkin } from "../render/GoatSkin";

const HAND_LOCAL: Vec2 = { x: GOAT.halfLen + GOAT.radius + 0.02, y: 0 };
const FOOT_LOCAL: Vec2 = { x: -(GOAT.halfLen + GOAT.radius), y: 0 };

type GrabTarget = { body: RigidBody; kind: string };

export class Goat {
  body: RigidBody;
  collider: RAPIER.Collider;
  private world: RAPIER.World;
  skin: GoatSkin;
  view: Container;
  private sprite: Sprite;
  private grabGfx: Graphics;

  playerIndex: number;
  palette: Palette;
  alive = true;
  dead = false;

  private intent: Intent = neutralIntent();
  private prevKick = false;
  private pendingKick = false;

  private kicking = 0; // seconds remaining in active window
  private kickCd = 0;
  private kickAmt = 0;
  private grabAmt = 0;
  private kickHits = new Set<unknown>();

  private grabJoint: RAPIER.ImpulseJoint | null = null;
  private grabTarget: GrabTarget | null = null;

  private blink = Math.random() * GOAT.eyeBlinkEvery;

  constructor(
    physics: Arena["physics"],
    palette: Palette,
    playerIndex: number,
    spawn: Vec2,
    angle: number,
  ) {
    this.palette = palette;
    this.playerIndex = playerIndex;
    this.skin = getSkin(palette);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y)
      .setRotation(angle)
      .setLinearDamping(GOAT.linearDamping)
      .setAngularDamping(GOAT.angularDamping)
      .setCcdEnabled(true)
      .setCanSleep(false);
    this.world = physics.world;
    this.body = physics.world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.capsule(GOAT.halfLen, GOAT.radius)
      .setRotation(Math.PI / 2) // lay the capsule horizontal (long axis = local X)
      .setDensity(GOAT.density)
      .setFriction(GOAT.friction)
      .setRestitution(GOAT.restitution)
      .setCollisionGroups(groups(CG.GOAT, CG.TERRAIN | CG.GOAT | CG.PROP));
    this.collider = physics.world.createCollider(colDesc, this.body);

    // ---- view ----
    this.view = new Container();
    this.sprite = new Sprite(this.skin.frame(0, 0));
    this.sprite.anchor.set(this.skin.anchor.x, this.skin.anchor.y);
    this.sprite.scale.set(1 / this.skin.ppu);
    this.view.addChild(this.sprite);
    this.grabGfx = new Graphics();
  }

  attach(world: Container) {
    world.addChild(this.grabGfx);
    world.addChild(this.view);
  }

  private accessories: Container[] = [];
  /** Add a decoration (world units, local to body centre) that tumbles with the goat. */
  addAccessory(node: Container) {
    this.view.addChildAt(node, 0); // behind the sprite by default
    this.accessories.push(node);
  }
  clearAccessories() {
    for (const a of this.accessories) a.destroy({ children: true });
    this.accessories.length = 0;
  }

  // ---- kinematics helpers ------------------------------------------------
  get pos(): Vec2 {
    const t = this.body.translation();
    return { x: t.x, y: t.y };
  }
  get angle(): number {
    return this.body.rotation();
  }
  get vel(): Vec2 {
    const lv = this.body.linvel();
    return { x: lv.x, y: lv.y };
  }
  private headDir(): Vec2 {
    return rotate({ x: 1, y: 0 }, this.angle);
  }
  private localToWorld(local: Vec2): Vec2 {
    return add(this.pos, rotate(local, this.angle));
  }

  setIntent(intent: Intent) {
    this.intent = intent;
    if (intent.kick && !this.prevKick) this.pendingKick = true;
    this.prevKick = intent.kick;
  }

  // ---- one fixed physics step -------------------------------------------
  fixedStep(arena: Arena) {
    if (this.dead) return;
    const dt = FIXED_DT;
    this.kickCd = Math.max(0, this.kickCd - dt);
    this.blink -= dt;
    if (this.blink < 0) this.blink += GOAT.eyeBlinkEvery;

    if (this.alive) {
      this.applyRoll();
      this.updateGrab(arena);
      if (this.pendingKick && this.kickCd <= 0) this.startKick(arena);
    }
    this.pendingKick = false;

    // kick active window
    if (this.kicking > 0) {
      this.kicking -= dt;
      this.sweepKick(arena);
      if (this.kicking <= 0) this.kickHits.clear();
    }

    // limb pose easing
    const kTarget = this.kicking > 0 ? kickCurve(1 - this.kicking / GOAT.kickActiveTime) : 0;
    this.kickAmt += (kTarget - this.kickAmt) * clamp(dt * 22, 0, 1);
    const gTarget = this.alive && (this.intent.grab || this.grabJoint) ? 1 : 0;
    this.grabAmt += (gTarget - this.grabAmt) * clamp(dt * 16, 0, 1);
  }

  private applyRoll() {
    const roll = this.intent.roll;
    if (Math.abs(roll) < 0.02) return;
    const av = this.body.angvel();
    if (Math.sign(roll) !== Math.sign(av) || Math.abs(av) < GOAT.maxRollSpeed) {
      this.body.applyTorqueImpulse(roll * GOAT.rollTorque, true);
    }
    // gentle rolling grip when in contact with the ground
    if (this.groundedDown()) {
      this.body.applyImpulse({ x: roll * GOAT.groundRollAssist * FIXED_DT, y: 0 }, true);
    }
  }

  private startKick(arena: Arena) {
    this.kicking = GOAT.kickActiveTime;
    this.kickCd = GOAT.kickActiveTime + GOAT.kickCooldown;
    this.kickHits.clear();
    const grounded = this.feetGrounded();
    const power = GOAT.kickImpulse * (grounded ? 1 : GOAT.kickAirScale);
    const launch = scale(this.headDir(), power);
    this.body.applyImpulse(launch, true);
    this.body.applyTorqueImpulse(this.intent.roll * GOAT.kickSpin, true);
    const feet = this.localToWorld(FOOT_LOCAL);
    arena.sfx.play(grounded ? "kick" : "kickair", { rate: 0.9 + Math.random() * 0.2 });
    if (grounded) arena.fx.burst("dust", feet, { n: 7 });
  }

  private sweepKick(arena: Arena) {
    const feet = this.localToWorld(FOOT_LOCAL);
    const dir = scale(this.headDir(), -1); // legs sweep toward the tail
    const end = add(feet, scale(dir, GOAT.kickReach));

    for (const other of arena.goats) {
      if (other === this || other.dead) continue;
      if (this.kickHits.has(other)) continue;
      const c = closestOnSegment(other.pos, feet, end);
      if (c.dist < GOAT.kickWidth + GOAT.radius) {
        this.kickHits.add(other);
        const away = norm(sub(other.pos, feet));
        const imp = { x: away.x * GOAT.kickKnockback, y: away.y * GOAT.kickKnockback - GOAT.kickUpBias * GOAT.kickKnockback };
        other.body.applyImpulse(imp, true);
        other.body.applyTorqueImpulse((Math.random() - 0.5) * 0.25, true);
        this.body.applyImpulse(scale(imp, -0.22), true);
        arena.fx.burst("impact", other.pos, { n: 10 });
        arena.fx.shake(6);
        arena.fx.popText(add(other.pos, { x: 0, y: -0.5 }), pick(THWACKS), this.palette.body);
        arena.sfx.play("thud", { rate: 0.85 + Math.random() * 0.3 });
        other.onKicked(this.playerIndex);
      }
    }

    for (const prop of arena.props) {
      if (!prop.kickable || !prop.alive) continue;
      if (this.kickHits.has(prop)) continue;
      const pp = prop.body.translation();
      const c = closestOnSegment({ x: pp.x, y: pp.y }, feet, end);
      if (c.dist < GOAT.kickWidth + prop.radius) {
        this.kickHits.add(prop);
        const away = norm(sub({ x: pp.x, y: pp.y }, feet));
        prop.onKick?.(away, GOAT.kickPopPower, this.playerIndex);
      }
    }
  }

  onKicked(_byPlayer: number) {
    // hook for scoring / last-hitter tracking; overridden by match if needed
    this.lastHitBy = _byPlayer;
    this.lastHitAt = 0;
  }
  lastHitBy = -1;
  lastHitAt = 999;

  // ---- grab --------------------------------------------------------------
  private updateGrab(arena: Arena) {
    const wantGrab = this.intent.grab;
    if (this.grabJoint) {
      const t = this.grabTarget;
      const targetGone = t && t.kind === "goat" && this.findGoatByBody(arena, t.body)?.dead;
      if (!wantGrab || targetGone) this.releaseGrab(arena);
      return;
    }
    if (!wantGrab) return;

    const hand = this.localToWorld(HAND_LOCAL);
    let best: { body: RigidBody; point: Vec2; kind: string; d: number } | null = null;

    // terrain via ray from the body out through the hand
    const dir = this.headDir();
    const hit = arena.physics.castRay(
      this.pos,
      dir,
      GOAT.halfLen + GOAT.radius + GOAT.grabReach,
      groups(0xffff, CG.TERRAIN),
      this.body,
    );
    if (hit) {
      const parent = hit.collider.parent();
      if (parent) best = { body: parent, point: hit.point, kind: "wall", d: hit.toi };
    }

    // props
    for (const prop of arena.props) {
      if (!prop.grabbable || !prop.alive) continue;
      const pp = prop.body.translation();
      const d = Math.hypot(pp.x - hand.x, pp.y - hand.y);
      if (d < GOAT.grabReach + prop.radius && (!best || d < best.d)) {
        const surf = add({ x: pp.x, y: pp.y }, scale(norm(sub(hand, { x: pp.x, y: pp.y })), prop.radius));
        best = { body: prop.body, point: surf, kind: "prop", d };
      }
    }

    // other goats
    for (const other of arena.goats) {
      if (other === this || other.dead) continue;
      const d = Math.hypot(other.pos.x - hand.x, other.pos.y - hand.y);
      if (d < GOAT.grabReach + GOAT.radius && (!best || d < best.d)) {
        const surf = add(other.pos, scale(norm(sub(hand, other.pos)), GOAT.radius));
        best = { body: other.body, point: surf, kind: "goat", d };
      }
    }

    if (best) this.makeGrab(arena, best.body, best.point, best.kind);
  }

  private makeGrab(arena: Arena, target: RigidBody, worldPoint: Vec2, kind: string) {
    const a1 = HAND_LOCAL;
    const tp = target.translation();
    const ta = target.rotation();
    const a2 = rotate(sub(worldPoint, { x: tp.x, y: tp.y }), -ta);
    const jd = RAPIER.JointData.revolute(
      new RAPIER.Vector2(a1.x, a1.y),
      new RAPIER.Vector2(a2.x, a2.y),
    );
    this.grabJoint = arena.physics.world.createImpulseJoint(jd, this.body, target, true);
    this.grabTarget = { body: target, kind };
    arena.sfx.play("grab", { volume: 0.5 });
  }

  /** Called when a grabbed prop/goat is about to be removed from the world. */
  releaseIfGrabbing(body: RigidBody, arena: Arena) {
    if (this.grabTarget && this.grabTarget.body === body) this.releaseGrab(arena);
  }

  private releaseGrab(arena: Arena) {
    if (this.grabJoint) {
      arena.physics.world.removeImpulseJoint(this.grabJoint, true);
      this.grabJoint = null;
      this.grabTarget = null;
      arena.sfx.play("release", { volume: 0.35 });
    }
  }

  private findGoatByBody(arena: Arena, b: RigidBody): Goat | undefined {
    return arena.goats.find((g) => g.body === b);
  }

  // ---- grounding probes --------------------------------------------------
  private groundedDown(): boolean {
    return !!this.rayHit({ x: 0, y: 1 }, GOAT.radius + 0.14);
  }
  private feetGrounded(): boolean {
    const feet = this.localToWorld(FOOT_LOCAL);
    const dir = scale(this.headDir(), -1);
    const ray = new RAPIER.Ray(new RAPIER.Vector2(feet.x, feet.y), new RAPIER.Vector2(dir.x, dir.y));
    return !!this.world.castRay(ray, GOAT.kickReach * 0.7, true, undefined, groups(0xffff, CG.TERRAIN | CG.PROP), undefined, this.body);
  }
  private rayHit(dir: Vec2, dist: number): boolean {
    const ray = new RAPIER.Ray(new RAPIER.Vector2(this.pos.x, this.pos.y), new RAPIER.Vector2(dir.x, dir.y));
    return !!this.world.castRay(ray, dist, true, undefined, groups(0xffff, CG.TERRAIN | CG.PROP), undefined, this.body);
  }

  // ---- lifecycle ---------------------------------------------------------
  eliminate(arena: Arena) {
    if (this.dead) return;
    this.alive = false;
    this.releaseGrab(arena);
  }

  kill(arena: Arena) {
    this.eliminate(arena);
    this.dead = true;
    this.view.visible = false;
    this.grabGfx.clear();
  }

  respawn(spawn: Vec2, angle: number) {
    this.dead = false;
    this.alive = true;
    this.view.visible = true;
    this.kicking = 0;
    this.kickCd = 0;
    this.kickAmt = 0;
    this.grabAmt = 0;
    this.lastHitBy = -1;
    this.body.setTranslation(new RAPIER.Vector2(spawn.x, spawn.y), true);
    this.body.setRotation(angle, true);
    this.body.setLinvel(new RAPIER.Vector2(0, 0), true);
    this.body.setAngvel(0, true);
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  }

  // ---- render sync -------------------------------------------------------
  sync() {
    const p = this.pos;
    this.sprite.texture = this.skin.frame(this.kickAmt, this.grabAmt);
    // rotate the whole view so any accessories (scuba tank etc.) tumble too
    this.view.position.set(p.x, p.y);
    this.view.rotation = this.angle;
    this.sprite.rotation = 0;
    this.sprite.position.set(0, 0);
    this.sprite.alpha = this.alive ? 1 : 0.55;

    // grab rope
    this.grabGfx.clear();
    if (this.grabJoint && this.grabTarget) {
      const hand = this.localToWorld(HAND_LOCAL);
      const tp = this.grabTarget.body.translation();
      this.grabGfx
        .moveTo(hand.x, hand.y)
        .lineTo(tp.x, tp.y)
        .stroke({ width: 0.05, color: 0xffffff, alpha: 0.35 });
    }
  }

  destroy(arena: Arena) {
    this.releaseGrab(arena);
    arena.physics.world.removeRigidBody(this.body);
    this.view.destroy({ children: true });
    this.grabGfx.destroy();
  }
}

// A snapping curve so the leg flicks out fast and recovers.
function kickCurve(phase: number): number {
  return phase < 0.32 ? phase / 0.32 : Math.max(0, 1 - (phase - 0.32) / 0.68);
}

const THWACKS = ["BONK", "THWACK", "OOF", "YEET", "BAAH!", "POW", "NYOOM"];
function pick<T>(arr: T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}
