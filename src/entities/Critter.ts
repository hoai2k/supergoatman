import { Sprite, type Container } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { CG, FIXED_DT, groups } from "../config";
import type { Arena, Prop } from "../core/types";
import { animalTexture } from "../render/assets";

/**
 * Plush wildlife. Two flavours:
 *  - KinematicWalker: an immovable commuter (moose, cow, donkey) that shoves
 *    goats out of its way. The donkey additionally kicks like a mule.
 *  - DynamicCritter: a light physical animal (sheep, penguin, crab, shrimp)
 *    that waddles/hops around and can be punted with kicks and headbutts.
 */

// ---------------------------------------------------------------------------

export class KinematicWalker {
  body: RigidBody;
  sprite: Sprite;
  dir = 1;
  private phase = Math.random() * 6;
  private kickCd = 0;

  constructor(
    arena: Arena,
    layer: Container,
    public name: string,
    public heightU: number,
    private x0: number,
    private x1: number,
    private footY: number,
    private speed: number,
    public muleKick = false,
  ) {
    const tex = animalTexture(name);
    const w = (tex.frame.width / tex.frame.height) * heightU;
    const startX = x0 + Math.random() * (x1 - x0);
    const desc = RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(startX, footY - heightU / 2);
    this.body = arena.physics.world.createRigidBody(desc);
    const col = RAPIER.ColliderDesc.cuboid(w * 0.32, heightU * 0.38)
      .setCollisionGroups(groups(CG.PROP, CG.GOAT))
      .setFriction(0.6);
    arena.physics.world.createCollider(col, this.body);

    this.sprite = new Sprite(tex);
    this.sprite.anchor.set(0.5, 0.56);
    this.sprite.height = heightU;
    this.sprite.width = w;
    layer.addChild(this.sprite);
  }

  fixedStep(arena: Arena) {
    this.phase += FIXED_DT;
    this.kickCd = Math.max(0, this.kickCd - FIXED_DT);
    const t = this.body.translation();
    if (t.x < this.x0 && this.dir < 0) this.dir = 1;
    if (t.x > this.x1 && this.dir > 0) this.dir = -1;
    const targetY = this.footY - this.heightU / 2 + Math.sin(this.phase * 7) * 0.02;
    this.body.setLinvel(new RAPIER.Vector2(this.dir * this.speed, (targetY - t.y) * 6), true);

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
    this.sprite.rotation = Math.sin(this.phase * 7) * 0.03;
  }

  destroy(arena: Arena) {
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
    this.prop = {
      body: this.body,
      radius: heightU * 0.4,
      kind: name,
      grabbable: true,
      kickable: true,
      alive: true,
      onKick: (dir, power) => {
        critter.body.applyImpulse({ x: dir.x * 2.0 * power, y: dir.y * 2.0 * power - 0.8 }, true);
        critter.body.applyTorqueImpulse((Math.random() - 0.5) * 0.3, true);
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
    const t = this.body.translation();
    const v = this.body.linvel();

    if (t.x < this.x0) this.dir = 1;
    if (t.x > this.x1) this.dir = -1;

    if (this.brain === "hopper") {
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
