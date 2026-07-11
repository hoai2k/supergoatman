import { Container, Sprite } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { GOAT, CG, groups, FIXED_DT, LIVES, type Palette } from "../config";
import {
  add,
  angleDelta,
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
import type { Arena } from "../core/types";
import { getSkin, type GoatSkin } from "../render/GoatSprites";
import { glowTexture } from "../render/glow";
import {
  BODY_RADIUS,
  FEET_LOCAL,
  HAND_LOCAL,
  HEAD_LOCAL,
  HEAD_RADIUS,
  HULL_LOCAL,
  PX2U,
} from "../render/goatgeom";

type GrabTarget = { body: RigidBody; kind: string; neckHold: boolean };

export class Goat {
  body: RigidBody;
  collider: RAPIER.Collider;
  private world: RAPIER.World;
  skin: GoatSkin;
  view: Container;
  private sprite: Sprite;
  private grabGlow: Sprite;
  private glowPhase = 0;

  playerIndex: number;
  palette: Palette;

  lives = LIVES;
  alive = true; // controllable right now
  dead = false; // ragdolling / waiting to respawn
  eliminated = false; // out of lives for good
  respawnT = 0;
  invulnT = 0;

  private intent: Intent = neutralIntent();
  private prevKick = false;
  private pendingKick = false;

  private kicking = 0;
  private kickCd = 0;
  private kickAmt = 0;
  private kickHits = new Set<unknown>();

  private grabJoint: RAPIER.ImpulseJoint | null = null;
  private grabTarget: GrabTarget | null = null;
  private twistAccum = 0;
  private lastRelAngle = 0;

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

    // Convex hull matched to the neutral sprite's silhouette — tight to the art.
    const hullDesc = RAPIER.ColliderDesc.convexHull(new Float32Array(HULL_LOCAL));
    const colDesc = (
      hullDesc ??
      RAPIER.ColliderDesc.capsule(GOAT.halfLen, GOAT.radius).setRotation(Math.PI / 2)
    )
      .setDensity(GOAT.density)
      .setFriction(GOAT.friction)
      .setRestitution(GOAT.restitution)
      .setCollisionGroups(groups(CG.GOAT, CG.TERRAIN | CG.GOAT | CG.PROP));
    this.collider = physics.world.createCollider(colDesc, this.body);

    this.view = new Container();
    this.sprite = new Sprite(this.skin.neutral.tex);
    this.sprite.anchor.set(this.skin.neutral.anchor.x, this.skin.neutral.anchor.y);
    this.sprite.scale.set(PX2U);
    this.view.addChild(this.sprite);

    // soft glow around the hands while the grab button is held
    this.grabGlow = new Sprite(glowTexture());
    this.grabGlow.anchor.set(0.5);
    this.grabGlow.position.set(HAND_LOCAL.x - 0.04, HAND_LOCAL.y + 0.12);
    this.grabGlow.blendMode = "add";
    this.grabGlow.visible = false;
    this.view.addChild(this.grabGlow);
  }

  attach(world: Container) {
    world.addChild(this.view);
  }

  private accessories: Container[] = [];
  addAccessory(node: Container) {
    this.view.addChildAt(node, 0);
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
  get radius(): number {
    return BODY_RADIUS;
  }
  headWorld(): Vec2 {
    return this.localToWorld(HEAD_LOCAL);
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
    if (this.dead || this.eliminated) return;
    const dt = FIXED_DT;
    this.kickCd = Math.max(0, this.kickCd - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);

    if (this.alive) {
      this.applyRoll();
      this.updateGrab(arena);
      if (this.pendingKick && this.kickCd <= 0) this.startKick(arena);
    }
    this.pendingKick = false;

    if (this.kicking > 0) {
      this.kicking -= dt;
      this.sweepKick(arena);
      if (this.kicking <= 0) this.kickHits.clear();
    }

    // hard caps keep the brawl readable — nobody pinballs across the arena
    const lv = this.body.linvel();
    const sp = Math.hypot(lv.x, lv.y);
    if (sp > GOAT.maxSpeed) {
      const k = GOAT.maxSpeed / sp;
      this.body.setLinvel({ x: lv.x * k, y: lv.y * k }, false);
    }
    const av = this.body.angvel();
    if (Math.abs(av) > GOAT.maxSpin) this.body.setAngvel(Math.sign(av) * GOAT.maxSpin, false);

    const kTarget = this.kicking > 0 ? kickCurve(1 - this.kicking / GOAT.kickActiveTime) : 0;
    this.kickAmt += (kTarget - this.kickAmt) * clamp(dt * 22, 0, 1);
    this.glowPhase += dt;
  }

  private applyRoll() {
    const roll = this.intent.roll;
    if (Math.abs(roll) < 0.02) return;
    const av = this.body.angvel();
    if (Math.sign(roll) !== Math.sign(av) || Math.abs(av) < GOAT.maxRollSpeed) {
      this.body.applyTorqueImpulse(roll * GOAT.rollTorque, true);
    }
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
    this.body.applyImpulse(scale(this.headDir(), power), true);
    this.body.applyTorqueImpulse(this.intent.roll * GOAT.kickSpin, true);
    const feet = this.localToWorld(FEET_LOCAL);
    arena.sfx.play(grounded ? "kick" : "kickair", { rate: 0.9 + Math.random() * 0.2 });
    if (grounded) arena.fx.burst("dust", feet, { n: 7 });
  }

  private sweepKick(arena: Arena) {
    const feet = this.localToWorld(FEET_LOCAL);
    const dir = scale(this.headDir(), -1); // legs extend toward the tail
    const end = add(feet, scale(dir, GOAT.kickReach));

    for (const other of arena.goats) {
      if (other === this || other.dead || other.eliminated) continue;
      if (this.kickHits.has(other)) continue;
      const c = closestOnSegment(other.pos, feet, end);
      if (c.dist < GOAT.kickWidth + BODY_RADIUS) {
        this.kickHits.add(other);
        const away = norm(sub(other.pos, feet));
        const imp = {
          x: away.x * GOAT.kickKnockback,
          y: away.y * GOAT.kickKnockback - GOAT.kickUpBias * GOAT.kickKnockback,
        };

        // A hoof square to the skull is lethal (very Super Bunny Man).
        const headHit = closestOnSegment(other.headWorld(), feet, end);
        if (headHit.dist < HEAD_RADIUS + GOAT.kickWidth * 0.55 && other.invulnT <= 0) {
          arena.killGoat(other, "BOOTED", { x: imp.x * 0.35, y: imp.y * 0.35 - 1.2 }, this.playerIndex);
          this.body.applyImpulse(scale(imp, -0.18), true);
          continue;
        }

        other.body.applyImpulse(imp, true);
        other.body.applyTorqueImpulse((Math.random() - 0.5) * 0.25, true);
        this.body.applyImpulse(scale(imp, -0.22), true);
        arena.fx.burst("impact", other.pos, { n: 10 });
        arena.fx.shake(6);
        arena.fx.popText(add(other.pos, { x: 0, y: -0.5 }), pick(THWACKS), this.palette.body);
        arena.sfx.play("thud", { rate: 0.85 + Math.random() * 0.3 });
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

  // ---- grab (+ the neck-twist murder technique) ---------------------------
  private updateGrab(arena: Arena) {
    const wantGrab = this.intent.grab;
    if (this.grabJoint) {
      const t = this.grabTarget!;
      const victim = t.kind === "goat" ? this.findGoatByBody(arena, t.body) : undefined;
      if (!wantGrab || (t.kind === "goat" && (!victim || victim.dead))) {
        this.releaseGrab(arena);
        return;
      }
      // holding a goat by the scruff and wrenching it all the way around
      if (victim && t.neckHold) {
        const rel = angleDelta(this.angle, victim.angle);
        const d = Math.abs(angleDelta(this.lastRelAngle, rel));
        this.lastRelAngle = rel;
        this.twistAccum = Math.max(0, this.twistAccum + d - FIXED_DT * 1.2);
        if (this.twistAccum > 2.6 && victim.invulnT <= 0) {
          const fling = norm(sub(victim.pos, this.pos));
          arena.killGoat(victim, "NECKED", { x: fling.x * 2, y: fling.y * 2 - 1 }, this.playerIndex);
          this.releaseGrab(arena);
        }
      }
      return;
    }
    if (!wantGrab) return;

    const hand = this.localToWorld(HAND_LOCAL);
    let best: { body: RigidBody; point: Vec2; kind: string; d: number; neckHold: boolean } | null =
      null;

    // Hands stick to the closest static surface in ANY direction — ledges,
    // walls, the ground under your paws — like Super Bunny Man's grab.
    const proj = this.world.projectPoint(
      new RAPIER.Vector2(hand.x, hand.y),
      true,
      undefined,
      groups(0xffff, CG.TERRAIN),
      undefined,
      this.body,
    );
    if (proj) {
      const d = Math.hypot(proj.point.x - hand.x, proj.point.y - hand.y);
      if (d <= GOAT.grabReach) {
        const parent = proj.collider.parent();
        if (parent) {
          best = {
            body: parent,
            point: { x: proj.point.x, y: proj.point.y },
            kind: "wall",
            d,
            neckHold: false,
          };
        }
      }
    }

    for (const prop of arena.props) {
      if (!prop.grabbable || !prop.alive) continue;
      const pp = prop.body.translation();
      const d = Math.hypot(pp.x - hand.x, pp.y - hand.y);
      if (d < GOAT.grabReach + prop.radius && (!best || d < best.d)) {
        const surf = add({ x: pp.x, y: pp.y }, scale(norm(sub(hand, { x: pp.x, y: pp.y })), prop.radius));
        best = { body: prop.body, point: surf, kind: "prop", d, neckHold: false };
      }
    }

    for (const other of arena.goats) {
      if (other === this || other.dead || other.eliminated) continue;
      const d = Math.hypot(other.pos.x - hand.x, other.pos.y - hand.y);
      if (d < GOAT.grabReach + BODY_RADIUS && (!best || d < best.d)) {
        const surf = add(other.pos, scale(norm(sub(hand, other.pos)), BODY_RADIUS * 0.8));
        // a grip close to the head counts as holding the back of the neck
        const hw = other.headWorld();
        const neck = Math.hypot(surf.x - hw.x, surf.y - hw.y) < HEAD_RADIUS + 0.16;
        best = { body: other.body, point: surf, kind: "goat", d, neckHold: neck };
      }
    }

    if (best) this.makeGrab(arena, best);
  }

  private makeGrab(
    arena: Arena,
    target: { body: RigidBody; point: Vec2; kind: string; neckHold: boolean },
  ) {
    const a1 = HAND_LOCAL;
    const tp = target.body.translation();
    const ta = target.body.rotation();
    const a2 = rotate(sub(target.point, { x: tp.x, y: tp.y }), -ta);
    const jd = RAPIER.JointData.revolute(
      new RAPIER.Vector2(a1.x, a1.y),
      new RAPIER.Vector2(a2.x, a2.y),
    );
    this.grabJoint = arena.physics.world.createImpulseJoint(jd, this.body, target.body, true);
    this.grabTarget = { body: target.body, kind: target.kind, neckHold: target.neckHold };
    arena.fx.ring(target.point, 0xffe896, 0.45);
    this.twistAccum = 0;
    if (target.kind === "goat") {
      const victim = this.findGoatByBody(arena, target.body);
      this.lastRelAngle = victim ? angleDelta(this.angle, victim.angle) : 0;
    }
    arena.sfx.play("grab", { volume: 0.5 });
  }

  releaseIfGrabbing(body: RigidBody, arena: Arena) {
    if (this.grabTarget && this.grabTarget.body === body) this.releaseGrab(arena);
  }

  /** The body this goat is currently holding, if any. */
  grabbedBody(): RigidBody | null {
    return this.grabTarget?.body ?? null;
  }

  private releaseGrab(arena: Arena) {
    if (this.grabJoint) {
      arena.physics.world.removeImpulseJoint(this.grabJoint, true);
      this.grabJoint = null;
      this.grabTarget = null;
      this.twistAccum = 0;
      arena.sfx.play("release", { volume: 0.35 });
    }
  }

  private findGoatByBody(arena: Arena, b: RigidBody): Goat | undefined {
    return arena.goats.find((g) => g.body === b);
  }

  // ---- grounding probes ----------------------------------------------------
  private groundedDown(): boolean {
    return this.rayHit({ x: 0, y: 1 }, BODY_RADIUS + 0.16);
  }
  private feetGrounded(): boolean {
    const feet = this.localToWorld(FEET_LOCAL);
    const dir = scale(this.headDir(), -1);
    const ray = new RAPIER.Ray(new RAPIER.Vector2(feet.x, feet.y), new RAPIER.Vector2(dir.x, dir.y));
    return !!this.world.castRay(ray, GOAT.kickReach * 0.7, true, undefined, groups(0xffff, CG.TERRAIN | CG.PROP), undefined, this.body);
  }
  private rayHit(dir: Vec2, dist: number): boolean {
    const ray = new RAPIER.Ray(new RAPIER.Vector2(this.pos.x, this.pos.y), new RAPIER.Vector2(dir.x, dir.y));
    return !!this.world.castRay(ray, dist, true, undefined, groups(0xffff, CG.TERRAIN | CG.PROP), undefined, this.body);
  }

  // ---- lifecycle -----------------------------------------------------------
  /** Called by Arena.killGoat once a death is confirmed (lives already deducted). */
  enterDeadState(arena: Arena) {
    this.alive = false;
    this.dead = true;
    this.releaseGrab(arena);
    for (const g of arena.goats) g.releaseIfGrabbing(this.body, arena);
    this.view.visible = false;
    this.kicking = 0;
    this.kickAmt = 0;
    this.body.setEnabled(false);
    this.respawnT = 2.0;
    if (this.lives <= 0) this.eliminated = true;
  }

  respawn(spawn: Vec2, angle: number) {
    this.dead = false;
    this.alive = true;
    this.view.visible = true;
    this.invulnT = 1.6;
    this.body.setEnabled(true);
    this.body.setTranslation(new RAPIER.Vector2(spawn.x, spawn.y), true);
    this.body.setRotation(angle, true);
    this.body.setLinvel(new RAPIER.Vector2(0, 0), true);
    this.body.setAngvel(0, true);
  }

  // ---- render sync -----------------------------------------------------------
  sync() {
    if (this.dead || this.eliminated) return;
    const frame = this.skin.frame(this.kickAmt);
    if (this.sprite.texture !== frame.tex) {
      this.sprite.texture = frame.tex;
      this.sprite.anchor.set(frame.anchor.x, frame.anchor.y);
    }
    const p = this.pos;
    this.view.position.set(p.x, p.y);
    this.view.rotation = this.angle;
    this.sprite.alpha = this.invulnT > 0 ? 0.5 + 0.35 * Math.sin(this.invulnT * 26) : 1;

    // hand glow: pulses while reaching, locks bright once latched on
    const reaching = this.alive && this.intent.grab;
    const latched = this.grabJoint !== null;
    this.grabGlow.visible = reaching || latched;
    if (this.grabGlow.visible) {
      const pulse = Math.sin(this.glowPhase * 11);
      this.grabGlow.alpha = latched ? 0.95 : 0.55 + 0.22 * pulse;
      const r = (latched ? 0.34 : 0.28 + 0.03 * pulse) * 2; // world diameter
      this.grabGlow.width = r;
      this.grabGlow.height = r;
    }
  }

  destroy(arena: Arena) {
    this.releaseGrab(arena);
    arena.physics.world.removeRigidBody(this.body);
    this.view.destroy({ children: true });
  }
}

function kickCurve(phase: number): number {
  return phase < 0.32 ? phase / 0.32 : Math.max(0, 1 - (phase - 0.32) / 0.68);
}

const THWACKS = ["BONK", "THWACK", "OOF", "YEET", "BAAH!", "POW", "NYOOM"];
function pick<T>(arr: T[]): T {
  return arr[(Math.random() * arr.length) | 0];
}
