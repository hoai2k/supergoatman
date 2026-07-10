import { Container, Graphics } from "pixi.js";
import { Board, type TerrainTheme } from "./Board";
import type { Arena } from "../core/types";
import type { Goat } from "../entities/Goat";
import { makeRng, randRange } from "../core/math";

const THEME: TerrainTheme = { top: 0x2f7f7a, topLight: 0x54b3a6, face: 0x1d5b5e, faceDark: 0x123f45 };

export class UnderwaterBoard extends Board {
  readonly name = "The Deep End";
  readonly blurb = "Neutral buoyancy, sharp scenery, and absolutely no lifeguard on duty.";
  readonly tip = "You can't walk — KICK to swim (each kick is a stroke, then you glide). Boot rivals into the spikes above or below.";
  theme = THEME;
  gravityScale = 0.05; // near-weightless; you sink v-e-r-y slowly
  bounds = { minX: -13, maxX: 13, minY: -8.5, maxY: 7.5 };

  private floorKill = 4.4;
  private ceilKill = -5.4;
  private t = 0;
  private rng = makeRng(555);
  private bubbleT = 0;
  private urchins = new Graphics();

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#0a3a5c"],
      [0.5, "#0e5a80"],
      [1, "#1f86a8"],
    ]);
    const far = this.bg.addLayer(0.25);
    const g = new Graphics();
    // godrays
    for (let i = 0; i < 6; i++) {
      const x = randRange(this.rng, -14, 14);
      g.moveTo(x, -9).lineTo(x + 1.2, -9).lineTo(x + 3.5, 8).lineTo(x + 2, 8).fill({ color: 0xbfeaff, alpha: 0.06 });
    }
    far.addChild(g);
    const mid = this.bg.addLayer(0.5);
    const seaweed = new Graphics();
    for (let i = 0; i < 14; i++) paintKelp(seaweed, randRange(this.rng, -13, 13), 6, randRange(this.rng, 1.5, 3.5));
    mid.addChild(seaweed);

    // enclosing solid walls (safe), lethal floor + ceiling
    this.solidBox(arena, -12.5, 0, 1.2, 20);
    this.solidBox(arena, 12.5, 0, 1.2, 20);
    this.solidBox(arena, 0, 5.6, 26, 1.6); // floor base (spikes drawn on top)
    this.solidBox(arena, 0, -6.4, 26, 1.6); // ceiling base
    // a couple of coral columns for cover
    this.solidBox(arena, -4.5, 3.2, 1.2, 3.2, { theme: { top: 0xff8fae, topLight: 0xffc2d4, face: 0xe06a92, faceDark: 0xb04c72 } });
    this.solidBox(arena, 5.0, 3.5, 1.2, 2.6, { theme: { top: 0xffb14e, topLight: 0xffd08a, face: 0xe08a2c, faceDark: 0xb06a1c } });

    this.root.addChild(this.urchins);
    this.drawSpikes();

    this.spawns = [
      { pos: { x: -6, y: 0 }, angle: 0 },
      { pos: { x: 6, y: 0 }, angle: Math.PI },
      { pos: { x: -2.5, y: -2 }, angle: 0 },
      { pos: { x: 2.5, y: 2 }, angle: Math.PI },
    ];
  }

  onGoatSpawn(goat: Goat) {
    const tank = new Container();
    const g = new Graphics();
    // tank on the goat's back (local -x, poking up)
    g.roundRect(-0.16, -0.26, 0.32, 0.52, 0.14).fill({ color: 0xf1c40f });
    g.roundRect(-0.16, -0.26, 0.14, 0.52, 0.1).fill({ color: 0xf5d64b });
    g.circle(0, -0.26, 0.09).fill({ color: 0xbfc4cc }); // valve
    g.moveTo(0.05, -0.24).bezierCurveTo(0.35, -0.2, 0.4, 0.0, 0.55, 0.05).stroke({ width: 0.05, color: 0x2a2a2a, alpha: 0.8 }); // hose
    g.rotation = 0.25;
    g.position.set(-0.38, -0.12);
    tank.addChild(g);
    goat.addAccessory(tank);
  }

  fixedStep(arena: Arena) {
    // water drag: kicks become swim strokes that quickly bleed off
    for (const goat of arena.goats) {
      if (goat.dead) continue;
      const lv = goat.body.linvel();
      goat.body.setLinvel({ x: lv.x * 0.972 + Math.sin(this.t * 0.4) * 0.004, y: lv.y * 0.972 }, false);
      goat.body.setAngvel(goat.body.angvel() * 0.95, false);
    }
  }

  update(dt: number, arena: Arena) {
    this.t += dt;
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) {
      this.bubbleT = 0.25;
      arena.fx.burst("bubble", { x: randRange(this.rng, -12, 12), y: 4 }, { n: 1 });
      for (const goat of arena.goats) {
        if (!goat.dead && this.rng() < 0.5) arena.fx.burst("bubble", { x: goat.pos.x + 0.4, y: goat.pos.y - 0.2 }, { n: 1 });
      }
    }
  }

  private drawSpikes() {
    const g = this.urchins;
    g.clear();
    // floor spikes
    for (let x = -11.5; x <= 11.5; x += 0.7) {
      g.moveTo(x, 4.8).lineTo(x + 0.35, 4.0).lineTo(x + 0.7, 4.8).fill({ color: 0x0c2e33 });
      g.circle(x + 0.35, 4.85, 0.14).fill({ color: 0x3a2b52 });
    }
    // ceiling spikes
    for (let x = -11.5; x <= 11.5; x += 0.7) {
      g.moveTo(x, -5.6).lineTo(x + 0.35, -4.8).lineTo(x + 0.7, -5.6).fill({ color: 0x0c2e33 });
    }
  }

  checkHazards(arena: Arena) {
    for (const goat of arena.goats) {
      if (goat.dead) continue;
      const y = goat.pos.y;
      if (y > this.floorKill || y < this.ceilKill) {
        arena.fx.burst("splash", goat.pos, { n: 14 });
        arena.fx.burst("bubble", goat.pos, { n: 10 });
        arena.fx.popText(goat.pos, pick(["SHISH KEBAB", "POKED", "OUCH-A-RONI", "DEFLATED"]), goat.palette.body);
        arena.fx.shake(11);
        arena.sfx.play("splash");
        goat.kill(arena);
      }
    }
  }
}

function paintKelp(g: Graphics, x: number, baseY: number, h: number) {
  g.moveTo(x, baseY);
  g.bezierCurveTo(x + 0.6, baseY - h * 0.4, x - 0.6, baseY - h * 0.7, x + 0.2, baseY - h);
  g.stroke({ width: 0.22, color: 0x1c6b4a, alpha: 0.7 });
}

function pick<T>(a: T[]): T {
  return a[(Math.random() * a.length) | 0];
}
