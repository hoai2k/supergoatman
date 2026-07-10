import { Sprite } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { Board, type TerrainTheme } from "./Board";
import { CG, groups } from "../config";
import type { Arena, Prop } from "../core/types";
import { makeRng } from "../core/math";
import { tex } from "../render/assets";

const THEME: TerrainTheme = { top: 0x9a6b3f, topLight: 0xc79a5f, face: 0x74502f, faceDark: 0x4f371f };

interface Plank {
  body: RigidBody;
  prop: Prop;
  sprite: Sprite;
  restX: number;
  restY: number;
  broken: boolean;
}

export class BridgeBoard extends Board {
  readonly name = "Wobble Gorge";
  readonly blurb = "One rope bridge. Four goats. A canyon with excellent acoustics for screaming.";
  readonly tip = "The bridge is a trampoline — STOMP-kick planks to launch whoever's standing on them. The stakes at the edges raise the, well, stakes.";
  theme = THEME;
  gravityScale = 1;

  private planks: Plank[] = [];
  private killY = 7.2;
  private rng = makeRng(2024);
  private breakT = 0;

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#e08a4e"],
      [1, "#3a2a52"],
    ]);
    this.addBackdrop("bridge");

    // cliffs matched to the painting (arena-art px coords)
    this.solidPxRect(arena, 0, 428, 295, 941); // left cliff
    this.solidPxRect(arena, 1362, 432, 1672, 941); // right cliff

    // walls + ceiling
    this.solidRect(arena, this.bounds.minX - 1.2, this.bounds.minY - 2, this.bounds.minX - 0.1, this.bounds.maxY);
    this.solidRect(arena, this.bounds.maxX + 0.1, this.bounds.minY - 2, this.bounds.maxX + 1.2, this.bounds.maxY);
    this.solidRect(arena, this.bounds.minX, this.bounds.minY - 1.4, this.bounds.maxX, this.bounds.minY - 0.3);

    this.buildBridge(arena);

    // sharpened stakes on the cliff tops against the walls
    this.addHazard("stakes", this.bounds.minX + 1.05, -0.58, 1.8, {
      labels: ["STAKED", "SPLINTERED", "FENCED"],
      fx: "dust",
      sfx: "thud",
    });
    this.addHazard("stakes", this.bounds.maxX - 1.05, -0.52, 1.8, {
      flip: true,
      labels: ["STAKED", "SPLINTERED", "FENCED"],
      fx: "dust",
      sfx: "thud",
    });

    this.spawns = [
      { pos: { x: -9.6, y: -1.6 }, angle: 0 },
      { pos: { x: 9.6, y: -1.6 }, angle: 0 },
      { pos: { x: -3.6, y: -1.4 }, angle: 0 },
      { pos: { x: 3.6, y: -1.4 }, angle: 0 },
    ];
  }

  private buildBridge(arena: Arena) {
    const left = -7.7;
    const right = 7.5;
    const leftY = -0.5;
    const rightY = -0.45;
    const N = 16;
    const span = right - left;
    const w = span / N;
    const halfW = w / 2 - 0.02;
    const halfH = 0.09;
    const plankTex = tex("plank");

    const leftAnchor = this.fixedAnchor(arena, left, leftY);
    const rightAnchor = this.fixedAnchor(arena, right, rightY);

    let prev: RigidBody = leftAnchor;
    let prevIsAnchor = true;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const restX = left + w * (i + 0.5);
      const restY = leftY + (rightY - leftY) * u + Math.sin(Math.PI * u) * 0.85; // sag
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(restX, restY)
        .setLinearDamping(0.4)
        .setAngularDamping(0.6);
      const body = arena.physics.world.createRigidBody(desc);
      const col = RAPIER.ColliderDesc.cuboid(halfW, halfH)
        .setDensity(1.1)
        .setFriction(0.95)
        .setRestitution(0.12)
        .setCollisionGroups(groups(CG.PROP, CG.TERRAIN | CG.GOAT));
      arena.physics.world.createCollider(col, body);

      const a1 = prevIsAnchor ? { x: 0, y: 0 } : { x: halfW, y: 0 };
      const jd = RAPIER.JointData.revolute(
        new RAPIER.Vector2(a1.x, a1.y),
        new RAPIER.Vector2(-halfW, 0),
      );
      arena.physics.world.createImpulseJoint(jd, prev, body, true);

      const sprite = new Sprite(plankTex);
      sprite.anchor.set(0.5, 0.52);
      sprite.width = w * 1.06;
      sprite.height = w * 0.5;
      this.root.addChild(sprite);

      const plank: Plank = {
        body,
        sprite,
        restX,
        restY,
        broken: false,
        prop: {
          body,
          radius: halfW,
          kind: "plank",
          grabbable: true,
          kickable: true,
          alive: true,
          onKick: (dir) => body.applyImpulse({ x: dir.x * 0.8, y: dir.y * 1.4 }, true),
        },
      };
      arena.props.push(plank.prop);
      this.planks.push(plank);
      prev = body;
      prevIsAnchor = false;
    }
    const last = this.planks[this.planks.length - 1].body;
    const jd = RAPIER.JointData.revolute(new RAPIER.Vector2(halfW, 0), new RAPIER.Vector2(0, 0));
    arena.physics.world.createImpulseJoint(jd, last, rightAnchor, true);
  }

  fixedStep() {
    // suspension springs pull each plank toward rest -> bouncy trampoline
    for (const p of this.planks) {
      if (p.broken) continue;
      const t = p.body.translation();
      const v = p.body.linvel();
      const fx = (p.restX - t.x) * 7 - v.x * 1.5;
      const fy = (p.restY - t.y) * 9 - v.y * 1.8;
      p.body.addForce({ x: fx, y: fy }, true);
    }
  }

  update(_dt: number, _arena: Arena) {
    for (const p of this.planks) {
      if (p.broken) continue;
      const t = p.body.translation();
      p.sprite.position.set(t.x, t.y);
      p.sprite.rotation = p.body.rotation();
    }
  }

  reset() {
    this.killY = 7.2;
  }

  escalate(dt: number, arena: Arena) {
    this.breakT -= dt;
    if (this.breakT <= 0) {
      this.breakT = 2.4;
      const alive = this.planks.filter((p) => !p.broken);
      if (alive.length > 5) {
        const mid = alive[Math.floor(alive.length / 2) + ((this.rng() * 3) | 0) - 1];
        if (mid) {
          mid.broken = true;
          mid.prop.alive = false;
          mid.sprite.visible = false;
          const t = mid.body.translation();
          for (const g of arena.goats) g.releaseIfGrabbing(mid.body, arena);
          arena.physics.world.removeRigidBody(mid.body);
          const pi = arena.props.indexOf(mid.prop);
          if (pi >= 0) arena.props.splice(pi, 1);
          arena.fx.burst("dust", { x: t.x, y: t.y }, { n: 12 });
          arena.fx.shake(8);
          arena.sfx.play("thud");
        }
      }
    }
  }

  checkHazards(arena: Arena) {
    super.checkHazards(arena);
    for (const goat of arena.goats) {
      if (goat.dead || goat.eliminated || goat.invulnT > 0) continue;
      if (goat.pos.y > this.killY) {
        arena.fx.burst("dust", goat.pos, { n: 10 });
        arena.sfx.play("kickair");
        arena.killGoat(goat, pick(["WILHELM!", "CANYONED", "SEE YA", "LONG WAY DOWN"]));
      }
    }
  }
}

function pick<T>(a: T[]): T {
  return a[(Math.random() * a.length) | 0];
}
