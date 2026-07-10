import { Container, Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { Board, type TerrainTheme } from "./Board";
import { CG, groups } from "../config";
import type { Arena, Prop } from "../core/types";
import { makeRng, randRange } from "../core/math";

const THEME: TerrainTheme = { top: 0x9a6b3f, topLight: 0xc79a5f, face: 0x74502f, faceDark: 0x4f371f };

interface Plank {
  body: RigidBody;
  prop: Prop;
  gfx: Graphics;
  restX: number;
  restY: number;
  broken: boolean;
}

export class BridgeBoard extends Board {
  readonly name = "Wobble Gorge";
  readonly blurb = "A rope bridge with commitment issues, strung over a bottomless canyon.";
  readonly tip = "The bridge is a trampoline. STOMP-kick the planks near a rival to fling them skyward — or just off the edge.";
  theme = THEME;
  gravityScale = 1;
  bounds = { minX: -16, maxX: 16, minY: -12, maxY: 11 };

  private planks: Plank[] = [];
  private layer = new Container();
  private ropeGfx = new Graphics();
  private killY = 8.5;
  private rng = makeRng(2024);
  private breakT = 0;

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#3a2a52"],
      [0.4, "#8a4a5e"],
      [0.75, "#e08a4e"],
      [1, "#ffd08a"],
    ]);
    const far = this.bg.addLayer(0.2);
    const mesa = new Graphics();
    paintMesas(mesa, this.rng, 0x5a3550);
    far.addChild(mesa);
    const mid = this.bg.addLayer(0.45);
    const mesa2 = new Graphics();
    paintMesas(mesa2, this.rng, 0x74404a);
    mid.addChild(mesa2);

    // cliffs
    this.solidBox(arena, -11, 4, 10, 9);
    this.solidBox(arena, 11, 4, 10, 9);
    // little back walls so you can't just roll off backwards forever
    this.solidBox(arena, -16.5, 0, 1, 20);
    this.solidBox(arena, 16.5, 0, 1, 20);

    this.root.addChild(this.layer);
    this.root.addChild(this.ropeGfx);

    this.buildBridge(arena);

    this.spawns = [
      { pos: { x: -8, y: -1.4 }, angle: -Math.PI / 2 },
      { pos: { x: 8, y: -1.4 }, angle: -Math.PI / 2 },
      { pos: { x: -3, y: -1.4 }, angle: -Math.PI / 2 },
      { pos: { x: 3, y: -1.4 }, angle: -Math.PI / 2 },
    ];
  }

  private buildBridge(arena: Arena) {
    const N = 16;
    const left = -6;
    const right = 6;
    const span = right - left;
    const w = span / N;
    const halfW = w / 2 - 0.02;
    const halfH = 0.09;

    const leftAnchor = this.fixedAnchor(arena, left, 0);
    const rightAnchor = this.fixedAnchor(arena, right, 0);

    let prev: RigidBody = leftAnchor;
    let prevIsAnchor = true;
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const restX = left + w * (i + 0.5);
      const restY = Math.sin(Math.PI * u) * 0.7; // gentle sag
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

      // join to previous
      const a1 = prevIsAnchor ? { x: 0, y: 0 } : { x: halfW, y: 0 };
      const a2 = { x: -halfW, y: 0 };
      const jd = RAPIER.JointData.revolute(new RAPIER.Vector2(a1.x, a1.y), new RAPIER.Vector2(a2.x, a2.y));
      arena.physics.world.createImpulseJoint(jd, prev, body, true);

      const g = new Graphics();
      g.roundRect(-halfW, -0.11, halfW * 2, 0.22, 0.05).fill({ color: THEME.top });
      g.roundRect(-halfW, -0.11, halfW * 2, 0.07, 0.04).fill({ color: THEME.topLight });
      this.layer.addChild(g);

      const plank: Plank = {
        body,
        gfx: g,
        restX,
        restY,
        broken: false,
        prop: { body, radius: halfW, kind: "plank", grabbable: true, kickable: true, alive: true, onKick: (dir) => body.applyImpulse({ x: dir.x * 0.8, y: dir.y * 1.4 }, true) },
      };
      arena.props.push(plank.prop);
      this.planks.push(plank);
      prev = body;
      prevIsAnchor = false;
    }
    // final joint to right anchor
    const last = this.planks[this.planks.length - 1].body;
    const jd = RAPIER.JointData.revolute(new RAPIER.Vector2(halfW, 0), new RAPIER.Vector2(0, 0));
    arena.physics.world.createImpulseJoint(jd, last, rightAnchor, true);
  }

  fixedStep() {
    // suspension springs pull each plank back to rest -> bouncy trampoline
    for (const p of this.planks) {
      if (p.broken) continue;
      const t = p.body.translation();
      const v = p.body.linvel();
      const fx = (p.restX - t.x) * 7 - v.x * 1.5;
      const fy = (p.restY - t.y) * 9 - v.y * 1.8;
      p.body.addForce({ x: fx, y: fy }, true);
    }
  }

  update(_dt: number, arena: Arena) {
    void arena;
    // reposition persistent plank slats + redraw the ropes
    this.ropeGfx.clear();
    const pts: { x: number; y: number }[] = [];
    for (const p of this.planks) {
      if (p.broken) continue;
      const t = p.body.translation();
      p.gfx.position.set(t.x, t.y);
      p.gfx.rotation = p.body.rotation();
      pts.push({ x: t.x, y: t.y });
    }
    // rope lines along the top of the bridge
    if (pts.length) {
      this.ropeGfx.moveTo(-6, 0);
      for (const pt of pts) this.ropeGfx.lineTo(pt.x, pt.y - 0.16);
      this.ropeGfx.lineTo(6, 0);
      this.ropeGfx.stroke({ width: 0.05, color: 0x3a2a1a, alpha: 0.8 });
      this.ropeGfx.moveTo(-6, 0);
      for (const pt of pts) this.ropeGfx.lineTo(pt.x, pt.y + 0.16);
      this.ropeGfx.lineTo(6, 0);
      this.ropeGfx.stroke({ width: 0.05, color: 0x3a2a1a, alpha: 0.6 });
    }
  }

  reset() {
    this.killY = 8.5;
  }

  escalate(dt: number, arena: Arena) {
    this.breakT -= dt;
    if (this.breakT <= 0) {
      this.breakT = 2.2;
      const alive = this.planks.filter((p) => !p.broken);
      if (alive.length > 4) {
        // snap a plank near the middle for maximum drama
        const mid = alive[Math.floor(alive.length / 2) + ((this.rng() * 3) | 0) - 1];
        if (mid) {
          mid.broken = true;
          mid.prop.alive = false;
          mid.gfx.visible = false;
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
    for (const goat of arena.goats) {
      if (goat.dead) continue;
      if (goat.pos.y > this.killY) {
        arena.fx.burst("dust", goat.pos, { n: 10 });
        arena.fx.popText(goat.pos, pick(["WILHELM!", "SO LONG", "CANYONED", "SEE YA"]), goat.palette.body);
        arena.fx.shake(9);
        arena.sfx.play("kickair");
        goat.kill(arena);
      }
    }
  }
}

function paintMesas(g: Graphics, rng: () => number, color: number) {
  let x = -18;
  while (x < 18) {
    const w = randRange(rng, 3, 6);
    const h = randRange(rng, 2, 5);
    g.rect(x, 8 - h, w, h + 4).fill({ color });
    g.rect(x, 8 - h, w, 0.4).fill({ color: 0xffffff, alpha: 0.08 });
    x += w + randRange(rng, 0.5, 2);
  }
}

function pick<T>(a: T[]): T {
  return a[(Math.random() * a.length) | 0];
}
