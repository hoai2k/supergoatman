import { Container, Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import { Board, type TerrainTheme } from "./Board";
import { CG, groups } from "../config";
import type { Arena, Prop } from "../core/types";
import { makeRng, randRange, type Vec2 } from "../core/math";

const THEME: TerrainTheme = { top: 0xf4e2b8, topLight: 0xfff6dd, face: 0xcaa96f, faceDark: 0x9c7c48, grass: false };

interface Balloon {
  prop: Prop;
  gfx: Graphics;
  color: number;
  buoy: number;
  phase: number;
}

const COLORS = [0xff5d5d, 0xffd23f, 0x4fc3ff, 0x8fd94b, 0xb07bff, 0xff8fc7, 0xff9433];

export class BalloonBoard extends Board {
  readonly name = "Cloud Nine";
  readonly blurb = "Stay airborne, pop your friends, and let gravity sort out the rest.";
  readonly tip = "GRAB a balloon to ride it up. KICK a balloon (yours or theirs) to pop it. Nobody floats forever.";
  theme = THEME;
  gravityScale = 1;
  bounds = { minX: -14, maxX: 14, minY: -14, maxY: 10 };

  private balloons: Balloon[] = [];
  private layer = new Container();
  private killY = 8.5;
  private baseKillY = 8.5;
  private rng = makeRng(99);
  private clouds: Graphics[] = [];

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#5fb7ef"],
      [0.55, "#9fd8f5"],
      [1, "#e7f7ff"],
    ]);
    const far = this.bg.addLayer(0.2);
    for (let i = 0; i < 6; i++) {
      const c = new Graphics();
      cloud(c, randRange(this.rng, 40, 70) / 60);
      c.position.set(randRange(this.rng, -16, 16), randRange(this.rng, -9, 4));
      far.addChild(c);
      this.clouds.push(c);
    }
    const mid = this.bg.addLayer(0.5);
    for (let i = 0; i < 5; i++) {
      const c = new Graphics();
      cloud(c, randRange(this.rng, 30, 50) / 60);
      c.position.set(randRange(this.rng, -14, 14), randRange(this.rng, -6, 6));
      mid.addChild(c);
    }

    this.root.addChild(this.layer);

    // sparse starting ledges — no camping, the void is always hungry
    this.solidBox(arena, -8.5, 2.2, 3.0, 0.7);
    this.solidBox(arena, 8.5, 2.2, 3.0, 0.7);
    this.solidBox(arena, -2.8, -0.5, 2.2, 0.6);
    this.solidBox(arena, 2.8, -0.5, 2.2, 0.6);

    this.spawns = [
      { pos: { x: -8.5, y: 1.2 }, angle: -Math.PI / 2 },
      { pos: { x: 8.5, y: 1.2 }, angle: -Math.PI / 2 },
      { pos: { x: -2.8, y: -1.4 }, angle: -Math.PI / 2 },
      { pos: { x: 2.8, y: -1.4 }, angle: -Math.PI / 2 },
    ];

    for (let i = 0; i < 14; i++) this.spawnBalloon(arena, true);
  }

  private spawnBalloon(arena: Arena, scatter = false) {
    const x = randRange(this.rng, this.bounds.minX + 2, this.bounds.maxX - 2);
    const y = scatter ? randRange(this.rng, -8, 6) : this.killY - 0.5;
    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinearDamping(1.15)
      .setAngularDamping(1.6);
    const body = arena.physics.world.createRigidBody(desc);
    const r = randRange(this.rng, 0.34, 0.44);
    const col = RAPIER.ColliderDesc.ball(r)
      .setDensity(0.1)
      .setFriction(0.5)
      .setRestitution(0.35)
      .setCollisionGroups(groups(CG.PROP, CG.TERRAIN | CG.GOAT | CG.PROP));
    arena.physics.world.createCollider(col, body);

    const color = COLORS[(this.rng() * COLORS.length) | 0];
    const gfx = new Graphics();
    this.layer.addChild(gfx);
    const balloon: Balloon = {
      color,
      gfx,
      buoy: randRange(this.rng, 13.5, 15.0), // ~neutral for a goat holding one; two lift fast
      phase: randRange(this.rng, 0, 6.28),
      prop: {
        body,
        radius: r,
        kind: "balloon",
        grabbable: true,
        kickable: true,
        alive: true,
        onKick: () => this.pop(arena, balloon),
      },
    };
    arena.props.push(balloon.prop);
    this.balloons.push(balloon);
    return balloon;
  }

  private pop(arena: Arena, b: Balloon) {
    if (!b.prop.alive) return;
    const p = b.prop.body.translation();
    const pos: Vec2 = { x: p.x, y: p.y };
    for (const g of arena.goats) g.releaseIfGrabbing(b.prop.body, arena);
    arena.fx.burst("pop", pos, { n: 18 });
    arena.fx.ring(pos, b.color, 1.0);
    arena.sfx.play("pop", { rate: 0.8 + Math.random() * 0.5 });
    this.despawn(arena, b);
    // keep the sky stocked
    this.spawnBalloon(arena);
  }

  private despawn(arena: Arena, b: Balloon) {
    b.prop.alive = false;
    for (const g of arena.goats) g.releaseIfGrabbing(b.prop.body, arena);
    arena.physics.world.removeRigidBody(b.prop.body);
    const pi = arena.props.indexOf(b.prop);
    if (pi >= 0) arena.props.splice(pi, 1);
    b.gfx.destroy();
    const bi = this.balloons.indexOf(b);
    if (bi >= 0) this.balloons.splice(bi, 1);
  }

  fixedStep(arena: Arena) {
    for (const b of this.balloons) {
      if (!b.prop.alive) continue;
      b.phase += 0.02;
      const bob = Math.sin(b.phase) * 1.4;
      b.prop.body.addForce({ x: Math.sin(b.phase * 0.7) * 0.6, y: -(b.buoy + bob) }, true);
    }
  }

  update(_dt: number, arena: Arena) {
    // recycle balloons that escaped the top of the arena
    for (const b of [...this.balloons]) {
      const p = b.prop.body.translation();
      if (p.y < this.bounds.minY - 1) {
        this.despawn(arena, b);
        this.spawnBalloon(arena);
      }
    }
    for (const b of this.balloons) this.drawBalloon(b);
  }

  private drawBalloon(b: Balloon) {
    const t = b.prop.body.translation();
    const rot = b.prop.body.rotation();
    const g = b.gfx;
    g.clear();
    g.position.set(t.x, t.y);
    g.rotation = rot;
    const r = b.prop.radius;
    // string
    g.moveTo(0, r).bezierCurveTo(0.1, r + 0.3, -0.1, r + 0.55, 0.04, r + 0.8).stroke({ width: 0.03, color: 0xffffff, alpha: 0.7 });
    // body
    g.ellipse(0, 0, r * 0.92, r * 1.1).fill({ color: b.color });
    g.ellipse(-r * 0.3, -r * 0.4, r * 0.28, r * 0.4).fill({ color: 0xffffff, alpha: 0.4 });
    // knot
    g.moveTo(-0.07, r).lineTo(0.07, r).lineTo(0, r + 0.12).fill({ color: b.color });
  }

  reset(arena: Arena) {
    this.killY = this.baseKillY;
    // top up to a full sky
    while (this.balloons.length < 14) this.spawnBalloon(arena);
  }

  escalate(dt: number) {
    this.killY = Math.max(2.5, this.killY - dt * 0.5); // the floor of doom rises
  }

  checkHazards(arena: Arena) {
    for (const goat of arena.goats) {
      if (goat.dead) continue;
      if (goat.pos.y > this.killY) {
        arena.fx.burst("impact", goat.pos, { n: 12 });
        arena.fx.popText(goat.pos, pick(["SPLAT", "GRAVITY WINS", "TIMBER!", "BYE"]), goat.palette.body);
        arena.fx.shake(10);
        arena.sfx.play("thud");
        goat.kill(arena);
      }
    }
  }
}

function cloud(g: Graphics, s: number) {
  g.ellipse(0, 0, 1.6 * s, 0.7 * s).fill({ color: 0xffffff, alpha: 0.9 });
  g.ellipse(-1.0 * s, 0.15 * s, 0.9 * s, 0.5 * s).fill({ color: 0xffffff, alpha: 0.9 });
  g.ellipse(1.1 * s, 0.1 * s, 1.0 * s, 0.55 * s).fill({ color: 0xffffff, alpha: 0.9 });
  g.ellipse(0.2 * s, -0.4 * s, 0.8 * s, 0.5 * s).fill({ color: 0xffffff, alpha: 0.9 });
}

function pick<T>(a: T[]): T {
  return a[(Math.random() * a.length) | 0];
}
