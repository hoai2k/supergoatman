import { Container, Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import { Board, type TerrainTheme } from "./Board";
import { CG, groups } from "../config";
import type { Arena, Prop } from "../core/types";
import { makeRng, randRange, type Vec2 } from "../core/math";

const THEME: TerrainTheme = { top: 0xf4f0ff, topLight: 0xffffff, face: 0xd8d4ea, faceDark: 0xb0aacb };

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
  readonly blurb = "A birthday party at 30,000 hooves. The floor is a rumour.";
  readonly tip = "GRAB a balloon to ride it up, KICK balloons to pop them. Mind the ceremonial skewers on the sides — they are not decorative. OK, they are, but they also skewer.";
  theme = THEME;
  gravityScale = 1;

  private balloons: Balloon[] = [];
  private layer = new Container();
  private baseKillY = 7.6;
  private killY = this.baseKillY;
  private rng = makeRng(99);

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#3f55d6"],
      [1, "#8fb8f2"],
    ]);
    this.addBackdrop("balloon");
    this.root.addChild(this.layer);

    // cloud platforms painted into the backdrop (arena-art px coords)
    this.solidPxRect(arena, 60, 428, 425, 520); // left cloud
    this.solidPxRect(arena, 1245, 428, 1610, 520); // right cloud
    this.solidPxRect(arena, 300, 535, 1290, 660); // big centre cloud

    // walls + ceiling
    this.solidRect(arena, this.bounds.minX - 1.2, this.bounds.minY - 2, this.bounds.minX - 0.1, this.bounds.maxY);
    this.solidRect(arena, this.bounds.maxX + 0.1, this.bounds.minY - 2, this.bounds.maxX + 1.2, this.bounds.maxY);
    this.solidRect(arena, this.bounds.minX, this.bounds.minY - 1.4, this.bounds.maxX, this.bounds.minY - 0.3);

    // festival spears line the side walls (two tiers each side)
    for (const baseY of [0.4, 3.4]) {
      this.addHazard("spears", this.bounds.minX + 1.05, baseY, 1.9, {
        labels: ["SKEWERED", "KEBAB'D", "PINCUSHION"],
        fx: "star",
        sfx: "thud",
      });
      this.addHazard("spears", this.bounds.maxX - 1.05, baseY, 1.9, {
        flip: true,
        labels: ["SKEWERED", "KEBAB'D", "PINCUSHION"],
        fx: "star",
        sfx: "thud",
      });
    }

    this.spawns = [
      { pos: { x: -8.4, y: -1.4 }, angle: 0 },
      { pos: { x: 8.4, y: -1.4 }, angle: 0 },
      { pos: { x: -2.6, y: 0.1 }, angle: 0 },
      { pos: { x: 2.6, y: 0.1 }, angle: 0 },
    ];

    for (let i = 0; i < 12; i++) this.spawnBalloon(arena, true);
  }

  private spawnBalloon(arena: Arena, scatter = false) {
    const x = randRange(this.rng, this.bounds.minX + 2, this.bounds.maxX - 2);
    const y = scatter ? randRange(this.rng, -5.5, 3.5) : 6.2;
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
      buoy: randRange(this.rng, 10.6, 11.6), // one balloon ≈ gentle rise with a goat attached
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

  fixedStep() {
    for (const b of this.balloons) {
      if (!b.prop.alive) continue;
      b.phase += 0.02;
      const bob = Math.sin(b.phase) * 1.4;
      b.prop.body.addForce({ x: Math.sin(b.phase * 0.7) * 0.6, y: -(b.buoy + bob) }, true);
    }
  }

  update(_dt: number, arena: Arena) {
    for (const b of [...this.balloons]) {
      const p = b.prop.body.translation();
      if (p.y < this.bounds.minY + 0.3) {
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
    g.moveTo(0, r).bezierCurveTo(0.1, r + 0.3, -0.1, r + 0.55, 0.04, r + 0.8).stroke({ width: 0.03, color: 0xffffff, alpha: 0.7 });
    g.ellipse(0, 0, r * 0.92, r * 1.1).fill({ color: b.color });
    g.ellipse(-r * 0.3, -r * 0.4, r * 0.28, r * 0.4).fill({ color: 0xffffff, alpha: 0.4 });
    g.moveTo(-0.07, r).lineTo(0.07, r).lineTo(0, r + 0.12).fill({ color: b.color });
  }

  reset(arena: Arena) {
    this.killY = this.baseKillY;
    while (this.balloons.length < 12) this.spawnBalloon(arena);
  }

  escalate(dt: number) {
    this.killY = Math.max(2.5, this.killY - dt * 0.4);
  }

  checkHazards(arena: Arena) {
    super.checkHazards(arena);
    for (const goat of arena.goats) {
      if (goat.dead || goat.eliminated || goat.invulnT > 0) continue;
      if (goat.pos.y > this.killY) {
        arena.fx.burst("impact", goat.pos, { n: 12 });
        arena.killGoat(goat, pick(["GRAVITY WINS", "TIMBER!", "GOODBYE", "SPLAT (eventually)"]));
      }
    }
  }
}

function pick<T>(a: T[]): T {
  return a[(Math.random() * a.length) | 0];
}
