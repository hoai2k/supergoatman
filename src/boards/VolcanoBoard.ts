import { Graphics } from "pixi.js";
import { Board, type TerrainTheme } from "./Board";
import type { Arena } from "../core/types";
import { randRange, makeRng } from "../core/math";

const THEME: TerrainTheme = { top: 0x6b5b53, topLight: 0x8a7368, face: 0x413732, faceDark: 0x2a221f };

export class VolcanoBoard extends Board {
  readonly name = "Cinder Cone";
  readonly blurb = "A crumbly rock shelf over a very warm lake. Try not to become fondue.";
  readonly tip = "Point your hooves at a rival and KICK to launch them off the ledge. Aim your whole body — that's the trick.";
  theme = THEME;
  gravityScale = 1;

  bounds = { minX: -12, maxX: 12, minY: -9, maxY: 7 };

  private lavaY = 4.0;
  private baseLavaY = 4.0;
  private lava = new Graphics();
  private glow = new Graphics();
  private t = 0;
  private rng = makeRng(7);

  build(arena: Arena) {
    // background
    this.bg.setGradient([
      [0, "#2a0f18"],
      [0.45, "#5a1a1e"],
      [0.8, "#93341f"],
      [1, "#d8631f"],
    ]);
    const far = this.bg.addLayer(0.25);
    const farG = new Graphics();
    far.addChild(farG);
    paintVolcano(farG);
    const mid = this.bg.addLayer(0.5);
    const midG = new Graphics();
    mid.addChild(midG);
    paintRidge(midG, 0x30161a, 5);

    // lava + glow live behind the platforms
    this.root.addChild(this.glow);
    this.root.addChild(this.lava);

    // platforms
    this.solidBox(arena, -4, 0.6, 6.4, 1.2);
    this.solidBox(arena, 4, 0.6, 6.4, 1.2);
    this.solidBox(arena, 0, -3.2, 2.6, 0.7);
    this.solidBox(arena, -7.2, -2.6, 3.0, 0.7);
    this.solidBox(arena, 7.2, -2.6, 3.0, 0.7);
    // little unstable stepping stones near the gap
    this.solidBox(arena, -1.4, -1.1, 1.1, 0.5);
    this.solidBox(arena, 1.4, -1.1, 1.1, 0.5);

    this.spawns = [
      { pos: { x: -4, y: -1.2 }, angle: -Math.PI / 2 },
      { pos: { x: 4, y: -1.2 }, angle: -Math.PI / 2 },
      { pos: { x: -7.2, y: -3.6 }, angle: -Math.PI / 2 },
      { pos: { x: 7.2, y: -3.6 }, angle: -Math.PI / 2 },
    ];
  }

  reset() {
    this.lavaY = this.baseLavaY;
  }

  escalate(dt: number) {
    this.lavaY = Math.max(-0.4, this.lavaY - dt * 0.22); // creeps up in sudden death
  }

  update(dt: number, arena: Arena) {
    this.t += dt;
    // occasional embers spitting from the lava
    if (this.rng() < dt * 6) {
      const x = randRange(this.rng, this.bounds.minX, this.bounds.maxX);
      arena.fx.burst("ember", { x, y: this.lavaY - 0.1 }, { n: 3 });
    }
    this.drawLava();
  }

  private drawLava() {
    const { minX, maxX, maxY } = this.bounds;
    const g = this.lava;
    g.clear();
    // wavy top surface
    const steps = 48;
    g.moveTo(minX, maxY + 2);
    g.lineTo(minX, this.lavaY);
    for (let i = 0; i <= steps; i++) {
      const x = minX + ((maxX - minX) * i) / steps;
      const y = this.lavaY + Math.sin(x * 1.3 + this.t * 2.2) * 0.12 + Math.sin(x * 4 - this.t * 3) * 0.05;
      g.lineTo(x, y);
    }
    g.lineTo(maxX, maxY + 2);
    g.closePath();
    g.fill({ color: 0xff5a1a });
    // hotter core
    g.rect(minX, this.lavaY + 0.35, maxX - minX, maxY - this.lavaY + 2).fill({ color: 0xd63410, alpha: 0.5 });
    // bright crest line
    for (let i = 0; i <= steps; i++) {
      const x = minX + ((maxX - minX) * i) / steps;
      const y = this.lavaY + Math.sin(x * 1.3 + this.t * 2.2) * 0.12;
      g.circle(x, y, 0.05).fill({ color: 0xffd76a, alpha: 0.8 });
    }

    // glow halo
    this.glow.clear();
    this.glow.rect(minX, this.lavaY - 1.6, maxX - minX, 1.6).fill({ color: 0xff7a2a, alpha: 0.16 });
  }

  checkHazards(arena: Arena) {
    for (const goat of arena.goats) {
      if (goat.dead) continue;
      const p = goat.pos;
      if (p.y > this.lavaY - 0.1 || p.x < this.bounds.minX - 1 || p.x > this.bounds.maxX + 1) {
        arena.fx.burst("ember", p, { n: 16 });
        arena.fx.burst("splash", p, { n: 6 });
        arena.fx.ring(p, 0xffa53a, 1.6);
        arena.fx.popText(p, pick(["FONDUE!", "MEDIUM RARE", "TOASTY", "SIZZLE"]), 0xffb347);
        arena.fx.shake(14);
        arena.sfx.play("sizzle");
        goat.kill(arena);
      }
    }
  }
}

function paintVolcano(g: Graphics) {
  // a big dark cone with a glowing crater
  g.moveTo(-9, 4);
  g.lineTo(-2.4, -5.2);
  g.lineTo(-0.8, -5.2);
  g.lineTo(2.2, 4);
  g.fill({ color: 0x1f0e12 });
  g.moveTo(3, 4);
  g.lineTo(8, -3.6);
  g.lineTo(9.5, -3.6);
  g.lineTo(12, 4);
  g.fill({ color: 0x24121a });
  // crater glow
  g.ellipse(-1.6, -5.1, 1.1, 0.4).fill({ color: 0xff7a2a, alpha: 0.8 });
  g.ellipse(-1.6, -5.3, 0.6, 0.25).fill({ color: 0xffd158, alpha: 0.9 });
  // lava dribble
  g.moveTo(-1.8, -4.9);
  g.bezierCurveTo(-1.5, -2, -1.9, 1, -1.4, 3.8);
  g.stroke({ width: 0.18, color: 0xff6a24, alpha: 0.7 });
}

function paintRidge(g: Graphics, color: number, peaks: number) {
  g.moveTo(-13, 6);
  let x = -13;
  for (let i = 0; i < peaks; i++) {
    const w = 26 / peaks;
    g.lineTo(x + w * 0.5, 1 + Math.sin(i * 2.3) * 1.2);
    g.lineTo(x + w, 4);
    x += w;
  }
  g.lineTo(13, 6);
  g.closePath();
  g.fill({ color });
}

function pick<T>(a: T[]): T {
  return a[(Math.random() * a.length) | 0];
}
