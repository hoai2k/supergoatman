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
  phase: number;
  home: Vec2; // hover spot (usually just above a cloud platform)
  rising: boolean;
}

const COLORS = [0xff5d5d, 0xffd23f, 0x4fc3ff, 0x8fd94b, 0xb07bff, 0xff8fc7, 0xff9433];

export class BalloonBoard extends Board {
  readonly name = "Cloud Nine";
  readonly blurb = "A birthday party at 30,000 hooves. The floor is a rumour.";
  readonly tip = "GRAB a balloon and it carries you up, up, up — let go before the sky pops it. KICK balloons to pop them under a rival.";
  theme = THEME;
  gravityScale = 1;

  private balloons: Balloon[] = [];
  private layer = new Container();
  private baseKillY = 7.6;
  private killY = this.baseKillY;
  private popCeilY = -5.4; // balloons that float this high burst
  private rng = makeRng(99);

  // hover spots: slightly above the painted cloud platforms + a few sky lanes
  private homes: Vec2[] = [
    { x: -9.6, y: -1.9 },
    { x: -7.2, y: -1.9 },
    { x: 6.9, y: -1.9 },
    { x: 9.5, y: -1.9 },
    { x: -5.6, y: -0.5 },
    { x: -2.4, y: -0.4 },
    { x: 0.4, y: -0.5 },
    { x: 3.2, y: -0.4 },
    { x: 5.8, y: -0.5 },
    { x: -4.2, y: -3.4 },
    { x: 1.6, y: -3.8 },
    { x: 4.6, y: -3.2 },
  ];

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#3f55d6"],
      [1, "#8fb8f2"],
    ]);
    this.addBackdrop("balloon");
    this.root.addChild(this.layer);

    // cloud platforms painted into the backdrop (arena-art px coords);
    // surveyed layout (?edit=bb export 2026-07-11) — the side clouds float
    // free of the walls now, and clouds are clouds: rise up through them.
    this.solidPxRect(arena, 289, 542, 1385, 586, { oneWay: true }); // big centre cloud
    this.solidPxRect(arena, 75, 420, 426, 459, { oneWay: true }); // left cloud
    this.solidPxRect(arena, 1251, 420, 1596, 468, { oneWay: true }); // right cloud

    // walls + ceiling
    this.addArenaShell(arena);

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
      { pos: { x: -7.2, y: -1.4 }, angle: 0 },
      { pos: { x: 7.2, y: -1.4 }, angle: 0 },
      { pos: { x: -2.6, y: 0.1 }, angle: 0 },
      { pos: { x: 2.6, y: 0.1 }, angle: 0 },
    ];

    for (let i = 0; i < this.homes.length; i++) this.spawnBalloon(arena, i, true);
  }

  private spawnBalloon(arena: Arena, homeIdx: number, scatter = false) {
    const home = this.homes[homeIdx % this.homes.length];
    const x = scatter ? home.x + randRange(this.rng, -0.4, 0.4) : randRange(this.rng, -9, 9);
    const y = scatter ? home.y + randRange(this.rng, -0.3, 0.3) : 6.4; // fresh ones drift up from below
    // kinematic: balloons ignore terrain (they slip through platforms) and are
    // steered by hand — goats interact via grab joints and kick-pops.
    const desc = RAPIER.RigidBodyDesc.kinematicVelocityBased().setTranslation(x, y);
    const body = arena.physics.world.createRigidBody(desc);
    const r = randRange(this.rng, 0.36, 0.44);
    const col = RAPIER.ColliderDesc.ball(r).setCollisionGroups(groups(CG.PROP, 0));
    arena.physics.world.createCollider(col, body);

    const color = COLORS[(this.rng() * COLORS.length) | 0];
    const gfx = new Graphics();
    this.layer.addChild(gfx);
    const balloon: Balloon = {
      color,
      gfx,
      phase: randRange(this.rng, 0, 6.28),
      home: { x: home.x, y: home.y },
      rising: false,
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
    this.spawnBalloon(arena, (this.rng() * this.homes.length) | 0);
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
      b.phase += 1 / 120;
      const t = b.prop.body.translation();
      const held = arena.goats.some((g) => g.grabbedBody() === b.prop.body);

      let vx: number;
      let vy: number;
      if (held) {
        // a grabbed balloon hauls its passenger skyward
        b.rising = true;
        vx = Math.sin(b.phase * 0.9) * 0.18;
        vy = -1.15;
      } else if (b.rising) {
        // released mid-flight: keep gently rising to the sky and burst there
        vx = Math.sin(b.phase * 0.9) * 0.15;
        vy = -0.55;
      } else {
        // laze toward the hover spot; drift through platforms on the way
        const dx = b.home.x - t.x;
        const dy = (b.home.y + Math.sin(b.phase * 1.1) * 0.14) - t.y;
        vx = Math.max(-0.45, Math.min(0.45, dx * 0.5)) + Math.sin(b.phase * 0.7) * 0.05;
        vy = Math.max(-0.5, Math.min(0.5, dy * 0.7));
      }
      b.prop.body.setLinvel(new RAPIER.Vector2(vx, vy), true);
    }
  }

  update(_dt: number, arena: Arena) {
    for (const b of [...this.balloons]) {
      const p = b.prop.body.translation();
      if (p.y < this.popCeilY) this.pop(arena, b); // the sky always wins
    }
    for (const b of this.balloons) this.drawBalloon(b);
  }

  private drawBalloon(b: Balloon) {
    const t = b.prop.body.translation();
    const g = b.gfx;
    g.clear();
    g.position.set(t.x, t.y);
    g.rotation = Math.sin(b.phase * 1.3) * 0.07;
    const r = b.prop.radius;
    g.moveTo(0, r).bezierCurveTo(0.1, r + 0.3, -0.1, r + 0.55, 0.04, r + 0.8).stroke({ width: 0.03, color: 0xffffff, alpha: 0.7 });
    g.ellipse(0, 0, r * 0.92, r * 1.1).fill({ color: b.color });
    g.ellipse(-r * 0.3, -r * 0.4, r * 0.28, r * 0.4).fill({ color: 0xffffff, alpha: 0.4 });
    g.moveTo(-0.07, r).lineTo(0.07, r).lineTo(0, r + 0.12).fill({ color: b.color });
  }

  reset(arena: Arena) {
    this.killY = this.baseKillY;
    while (this.balloons.length < this.homes.length) {
      this.spawnBalloon(arena, this.balloons.length, true);
    }
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
