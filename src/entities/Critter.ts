import { Sprite, type Container } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { CG, FIXED_DT, groups } from "../config";
import type { Arena, Prop } from "../core/types";
import { animalTexture } from "../render/assets";
import type { Vec2 } from "../core/math";

/**
 * Plush wildlife. Two flavours:
 *  - Walker: a heavyweight commuter (moose, cow, donkey) with a route and
 *    opinions. Fully physical: it shoves goats aside, but a solid kick sends
 *    it rolling — it staggers, rights itself, and resumes the commute. The
 *    donkey additionally kicks like a mule.
 *  - DynamicCritter: a light physical animal (sheep, penguin, crab, shrimp)
 *    that waddles/hops around and can be punted with kicks and headbutts.
 *
 * Both take knockback scaled by their heft: crabs fly, cows budge.
 */

/** Punt impulse scaled by body mass — big animals shrug, small ones soar. */
function heftImpulse(mass: number, power: number): number {
  return power * (0.5 + 0.9 * Math.min(mass, 1.6));
}

const WALKER_QUIPS: Record<string, string[]> = {
  moose: ["MOOSE GOOSED", "TIMBER!", "CANADA FORGIVES YOU"],
  cow: ["MOO?!", "COW TIPPED", "MILK SPILLED"],
  donkey: ["HEE-HAW!", "RETURN TO SENDER", "KICKED THE KICKER"],
  crab: ["CRAB'D", "SIDEWAYS!", "SHELL SHOCKED"],
};

// ---------------------------------------------------------------------------

export class Walker {
  body: RigidBody;
  sprite: Sprite;
  prop: Prop;
  dir = 1;
  private phase = Math.random() * 6;
  private kickCd = 0;
  private staggerT = 0;
  private blockT = 0;
  private rightT = 0;
  private mass: number;
  private inertia: number;
  private halfH: number;
  private home: Vec2;

  constructor(
    arena: Arena,
    layer: Container,
    public name: string,
    public heightU: number,
    private x0: number,
    private x1: number,
    footY: number,
    private speed: number,
    public muleKick = false,
  ) {
    const tex = animalTexture(name);
    const w = (tex.frame.width / tex.frame.height) * heightU;
    const startX = x0 + Math.random() * (x1 - x0);
    this.home = { x: startX, y: footY - heightU / 2 };
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startX, footY - heightU / 2)
      .setLinearDamping(0.6)
      .setAngularDamping(2.0)
      .setCcdEnabled(true);
    this.body = arena.physics.world.createRigidBody(desc);
    const hw = w * 0.32;
    this.halfH = heightU * 0.38;
    // slick hooves (Min combine): the walk controller would otherwise lose
    // to static friction and the beast would jog on the spot forever —
    // damping, not friction, brings a punted animal to rest
    const col = RAPIER.ColliderDesc.cuboid(hw, this.halfH)
      .setDensity(0.9)
      .setFriction(0.12)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0.1)
      .setCollisionGroups(groups(CG.PROP, CG.TERRAIN | CG.GOAT | CG.PROP));
    arena.physics.world.createCollider(col, this.body);
    this.mass = this.body.mass();
    this.inertia = (this.mass * (hw * hw + this.halfH * this.halfH)) / 3;

    this.sprite = new Sprite(tex);
    this.sprite.anchor.set(0.5, 0.56);
    this.sprite.height = heightU;
    this.sprite.width = w;
    layer.addChild(this.sprite);

    const walker = this;
    this.prop = {
      body: this.body,
      radius: Math.max(w, heightU) * 0.42,
      kind: name,
      grabbable: true,
      kickable: true,
      alive: true,
      onKick: (dir, power) => walker.punt(arena, dir, power),
    };
    arena.props.push(this.prop);
  }

  private punt(arena: Arena, dir: Vec2, power: number) {
    // bigger beast, smaller launch — but everyone tips over and rolls
    const imp = heftImpulse(this.mass, power) * 1.55;
    this.body.applyImpulse({ x: dir.x * imp, y: dir.y * imp - 0.35 * imp }, true);
    this.body.applyTorqueImpulse((dir.x >= 0 ? 1 : -1) * 1.2 * this.inertia * (2 + power), true);
    this.staggerT = 1.1 + Math.random() * 0.7;
    const t = this.body.translation();
    arena.fx.popText({ x: t.x, y: t.y - this.heightU * 0.7 }, pick(WALKER_QUIPS[this.name] ?? ["OOF"]), 0xffffff);
    arena.fx.burst("dust", { x: t.x, y: t.y + this.halfH * 0.6 }, { n: 6 });
    arena.sfx.play("thud", { rate: this.mass > 1 ? 0.7 : 1.1, volume: 0.6 });
  }

  fixedStep(arena: Arena) {
    this.phase += FIXED_DT;
    this.kickCd = Math.max(0, this.kickCd - FIXED_DT);
    this.staggerT = Math.max(0, this.staggerT - FIXED_DT);
    const t = this.body.translation();

    // wandered off the world somehow: quietly reappear at the trailhead
    if (t.y > 8.5) {
      this.body.setTranslation(new RAPIER.Vector2(this.home.x, this.home.y), true);
      this.body.setLinvel(new RAPIER.Vector2(0, 0), true);
      this.body.setAngvel(0, true);
      this.body.setRotation(0, true);
      return;
    }

    const rot = this.body.rotation();
    const err = Math.atan2(Math.sin(rot), Math.cos(rot)); // nearest-upright error
    const av = this.body.angvel();
    const v = this.body.linvel();

    if (this.staggerT > 0) return; // mid-tumble: just be a ragdoll for a beat

    if (Math.abs(err) > 0.3) {
      // knocked over: struggle back to its feet
      this.rightT += FIXED_DT;
      this.body.applyTorqueImpulse((-err * 60 - av * 9) * this.inertia * FIXED_DT, true);
      if (this.rightT > 1.2) {
        // friction-locked on a corner: an undignified little hop fixes it
        this.rightT = 0;
        this.body.applyImpulse({ x: 0, y: -this.mass * 1.6 }, true);
        this.body.applyTorqueImpulse(-Math.sign(err) * this.inertia * 4, true);
      }
      return;
    }
    this.rightT = 0;

    // upright: gentle keel + walk the route (only with hooves on something)
    this.body.applyTorqueImpulse((-err * 10 - av * 3) * this.inertia * FIXED_DT, true);
    const ray = new RAPIER.Ray(new RAPIER.Vector2(t.x, t.y), new RAPIER.Vector2(0, 1));
    const grounded = !!arena.physics.world.castRay(
      ray,
      this.halfH + 0.25,
      true,
      undefined,
      groups(0xffff, CG.TERRAIN),
      undefined,
      this.body,
    );
    if (grounded) {
      if (t.x < this.x0 && this.dir < 0) this.dir = 1;
      if (t.x > this.x1 && this.dir > 0) this.dir = -1;
      // something solid in the road (table leg, another commuter, a wall of
      // goats): shoving forever is undignified — turn around instead
      if (Math.abs(v.x) < this.speed * 0.25) {
        this.blockT += FIXED_DT;
        if (this.blockT > 0.7) {
          this.dir = -this.dir;
          this.blockT = 0;
        }
      } else this.blockT = 0;
      const target = this.dir * this.speed;
      this.body.applyImpulse({ x: (target - v.x) * this.mass * 0.12, y: 0 }, true);
    }

    // the mule protects its personal space, explosively
    if (this.muleKick && this.kickCd <= 0) {
      const behindX = t.x - this.dir * 0.75;
      for (const g of arena.goats) {
        if (g.dead || g.eliminated || g.invulnT > 0) continue;
        const dx = g.pos.x - behindX;
        const dy = g.pos.y - t.y;
        if (Math.abs(dx) < 0.6 && Math.abs(dy) < 0.8 && Math.sign(g.pos.x - t.x) === -this.dir) {
          this.kickCd = 1.6;
          g.body.applyImpulse({ x: -this.dir * 2.6, y: -1.3 }, true);
          g.body.applyTorqueImpulse(-this.dir * 0.2, true);
          arena.fx.burst("dust", { x: behindX, y: t.y + 0.3 }, { n: 8 });
          arena.fx.popText({ x: g.pos.x, y: g.pos.y - 0.6 }, "MULE'D!", 0xd9b38c);
          arena.fx.shake(5);
          arena.sfx.play("thud", { rate: 0.8 });
          break;
        }
      }
    }
  }

  sync() {
    const t = this.body.translation();
    this.sprite.position.set(t.x, t.y);
    const s = Math.abs(this.sprite.scale.x);
    this.sprite.scale.x = this.dir < 0 ? -s : s;
    this.sprite.rotation = this.body.rotation() + Math.sin(this.phase * 7) * 0.03;
  }

  destroy(arena: Arena) {
    this.prop.alive = false;
    const pi = arena.props.indexOf(this.prop);
    if (pi >= 0) arena.props.splice(pi, 1);
    arena.physics.world.removeRigidBody(this.body);
    this.sprite.destroy();
  }
}

// ---------------------------------------------------------------------------

export type DynBrain = "waddler" | "hopper" | "sheep";

export class DynamicCritter {
  body: RigidBody;
  sprite: Sprite;
  prop: Prop;
  dir = Math.random() < 0.5 ? -1 : 1;
  private phase = Math.random() * 6;
  private hopT = 1 + Math.random() * 2.5;
  private staggerT = 0;
  private home: { x: number; y: number };

  constructor(
    arena: Arena,
    layer: Container,
    public name: string,
    public heightU: number,
    private brain: DynBrain,
    x: number,
    y: number,
    private x0: number,
    private x1: number,
    private waterY: number | null = null, // hoppers splash back into water below this line
  ) {
    this.home = { x, y };
    const tex = animalTexture(name);
    const w = (tex.frame.width / tex.frame.height) * heightU;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinearDamping(brain === "hopper" ? 0.4 : 0.8)
      .setAngularDamping(2.2)
      .setCcdEnabled(true);
    this.body = arena.physics.world.createRigidBody(desc);
    const col = RAPIER.ColliderDesc.ball(heightU * 0.34)
      .setDensity(0.5)
      .setFriction(0.8)
      .setRestitution(brain === "sheep" ? 0.62 : 0.25)
      .setCollisionGroups(groups(CG.PROP, CG.TERRAIN | CG.GOAT | CG.PROP));
    arena.physics.world.createCollider(col, this.body);

    this.sprite = new Sprite(tex);
    this.sprite.anchor.set(0.5, 0.5);
    this.sprite.height = heightU;
    this.sprite.width = w;
    layer.addChild(this.sprite);

    const critter = this;
    const mass = this.body.mass();
    this.prop = {
      body: this.body,
      radius: heightU * 0.4,
      kind: name,
      grabbable: true,
      kickable: true,
      alive: true,
      onKick: (dir, power) => {
        const imp = heftImpulse(mass, power);
        critter.body.applyImpulse({ x: dir.x * imp, y: dir.y * imp - 0.4 * imp }, true);
        critter.body.applyTorqueImpulse((Math.random() - 0.5) * 0.3, true);
        critter.staggerT = 0.9 + Math.random() * 0.5;
        arena.fx.popText(
          { x: critter.body.translation().x, y: critter.body.translation().y - 0.5 },
          pick(name === "sheep" ? ["BAA!", "WOOL'D"] : name === "penguin" ? ["NOOT!", "CURLING!"] : ["PUNT!", "SCUTTLE!"]),
          0xffffff,
        );
        arena.sfx.play("pop", { rate: 1.4, volume: 0.5 });
      },
    };
    arena.props.push(this.prop);
  }

  fixedStep(arena: Arena) {
    this.phase += FIXED_DT;
    this.staggerT = Math.max(0, this.staggerT - FIXED_DT);
    const t = this.body.translation();
    const v = this.body.linvel();

    if (t.x < this.x0) this.dir = 1;
    if (t.x > this.x1) this.dir = -1;

    if (this.staggerT > 0) {
      // freshly punted: tumble free, no walking, just gently un-spin
      const rot = this.body.rotation();
      this.body.applyTorqueImpulse(-rot * 0.002 - this.body.angvel() * 0.0008, true);
    } else if (this.brain === "hopper") {
      // shrimp: lurk in the water, then LEAP
      this.hopT -= FIXED_DT;
      const inWater = this.waterY !== null && t.y > this.waterY;
      if (inWater) {
        this.body.setLinvel(new RAPIER.Vector2(v.x * 0.9, v.y * 0.9), false);
        if (this.hopT <= 0) {
          this.hopT = 1.6 + Math.random() * 2.4;
          const kx = (Math.random() - 0.5) * 1.6 + this.dir * 0.5;
          this.body.applyImpulse({ x: kx * 0.35, y: -1.35 }, true);
          this.body.applyTorqueImpulse((Math.random() - 0.5) * 0.2, true);
          arena.fx.burst("splash", { x: t.x, y: this.waterY! }, { n: 6 });
          arena.sfx.play("splash", { volume: 0.3, rate: 1.5 });
        }
      }
    } else {
      // waddlers & sheep: small steps when resting on something
      const settled = Math.abs(v.y) < 0.4;
      if (settled && Math.abs(v.x) < 1.2 && Math.random() < 0.04) {
        this.body.applyImpulse({ x: this.dir * 0.16, y: -0.12 }, true);
      }
      // stay upright-ish
      const rot = this.body.rotation();
      this.body.applyTorqueImpulse(-rot * 0.004 - this.body.angvel() * 0.001, true);
    }

    // fell out of the world: trot back home
    if (t.y > 8.5) {
      this.body.setTranslation(new RAPIER.Vector2(this.home.x, this.home.y), true);
      this.body.setLinvel(new RAPIER.Vector2(0, 0), true);
    }
  }

  sync() {
    const t = this.body.translation();
    this.sprite.position.set(t.x, t.y);
    this.sprite.rotation = this.body.rotation();
    const s = Math.abs(this.sprite.scale.x);
    this.sprite.scale.x = this.dir < 0 ? -s : s;
  }

  destroy(arena: Arena) {
    this.prop.alive = false;
    const pi = arena.props.indexOf(this.prop);
    if (pi >= 0) arena.props.splice(pi, 1);
    arena.physics.world.removeRigidBody(this.body);
    this.sprite.destroy();
  }
}

function pick<T>(a: T[]): T {
  return a[(Math.random() * a.length) | 0];
}
