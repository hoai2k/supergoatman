import { Sprite } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { Board, type TerrainTheme } from "./Board";
import { CG, FIXED_DT, groups } from "../config";
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
    // No joint chain (chains at the taut limit make the solver vibrate
    // forever). Instead each plank slides ONLY vertically on an over-damped
    // spring, and fixedStep couples neighbours — a damped wave: dead calm at
    // rest, dips under weight, rebounds like a trampoline, and a stomp
    // travels down the deck to launch whoever is standing further along.
    const left = -7.7;
    const right = 7.5;
    const leftY = -0.5;
    const rightY = -0.45;
    const N = 16;
    const span = right - left;
    const w = span / N;
    const halfW = w / 2 - 0.01;
    const halfH = 0.09;
    const plankTex = tex("plank");

    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const restX = left + w * (i + 0.5);
      const restY = leftY + (rightY - leftY) * u + Math.sin(Math.PI * u) * 0.55; // gentle sag
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(restX, restY)
        .enabledTranslations(false, true)
        .lockRotations();
      const body = arena.physics.world.createRigidBody(desc);
      const col = RAPIER.ColliderDesc.cuboid(halfW, halfH)
        .setDensity(2.2)
        .setFriction(0.95)
        .setRestitution(0.05)
        .setCollisionGroups(groups(CG.PROP, CG.TERRAIN | CG.GOAT));
      arena.physics.world.createCollider(col, body);

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
          onKick: (dir) => body.applyImpulse({ x: 0, y: Math.max(0.9, Math.abs(dir.y) * 1.6) * Math.sign(dir.y || 1) }, true),
        },
      };
      arena.props.push(plank.prop);
      this.planks.push(plank);
    }
  }

  fixedStep() {
    // Damped wave: each plank is pulled to rest, coupled to its neighbours,
    // and over-damped so the deck never oscillates on its own.
    const K = 14; // return-to-rest stiffness
    const KN = 22; // neighbour coupling (carries the trampoline wave)
    const C = 5.2; // damping (≥ critical)
    const n = this.planks.length;
    for (let i = 0; i < n; i++) {
      const p = this.planks[i];
      if (p.broken) continue;
      const t = p.body.translation();
      const v = p.body.linvel();
      const disp = t.y - p.restY;
      const dl = i > 0 && !this.planks[i - 1].broken ? this.planks[i - 1].body.translation().y - this.planks[i - 1].restY : 0;
      const dr = i < n - 1 && !this.planks[i + 1].broken ? this.planks[i + 1].body.translation().y - this.planks[i + 1].restY : 0;
      const fy = -K * disp + KN * ((dl + dr) / 2 - disp) - C * v.y;
      // per-step impulse, NOT addForce: Rapier user forces persist until
      // reset, so calling addForce every tick accumulates without bound
      p.body.applyImpulse({ x: 0, y: fy * FIXED_DT }, true);
    }
  }

  update(_dt: number, _arena: Arena) {
    const n = this.planks.length;
    for (let i = 0; i < n; i++) {
      const p = this.planks[i];
      if (p.broken) continue;
      const t = p.body.translation();
      p.sprite.position.set(t.x, t.y);
      // visual tilt follows the deck's slope through the neighbours
      const yl = i > 0 && !this.planks[i - 1].broken ? this.planks[i - 1].body.translation().y : t.y;
      const yr = i < n - 1 && !this.planks[i + 1].broken ? this.planks[i + 1].body.translation().y : t.y;
      p.sprite.rotation = Math.atan2(yr - yl, 2 * (p.restX - (i > 0 ? this.planks[i - 1].restX : p.restX - 0.95)));
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
