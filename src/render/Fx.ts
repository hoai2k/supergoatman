import { Container, Graphics, Text } from "pixi.js";
import type { Fx } from "../core/types";
import type { Vec2 } from "../core/math";
import type { Camera } from "../core/Camera";
import { makeRng, randRange } from "../core/math";

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: number;
  grav: number;
  drag: number;
  spin: number;
  rot: number;
  shape: 0 | 1; // circle | square (confetti)
}

interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  color: number;
  life: number;
  max: number;
}

interface Pop {
  t: Text;
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
}

const CONFETTI = [0xff5fa2, 0xffd23f, 0x3fd0d9, 0x8fd94b, 0xb07bff, 0xff9433];

export class FxSystem implements Fx {
  private gfx = new Graphics();
  private parts: P[] = [];
  private rings: Ring[] = [];
  private pops: Pop[] = [];
  private popPool: Text[] = [];
  private rng = makeRng(1337);

  constructor(
    private layer: Container,
    private cam: Camera,
  ) {
    this.layer.addChild(this.gfx);
  }

  shake(amount: number) {
    this.cam.addTrauma(amount);
  }

  ring(pos: Vec2, color: number, radius = 1.2) {
    this.rings.push({ x: pos.x, y: pos.y, r: 0.1, maxR: radius, color, life: 0.5, max: 0.5 });
  }

  burst(kind: string, pos: Vec2, opts: Record<string, number> = {}) {
    const n = opts.n ?? 8;
    for (let i = 0; i < n; i++) this.parts.push(this.make(kind, pos, opts));
  }

  private make(kind: string, pos: Vec2, opts: Record<string, number>): P {
    const r = this.rng;
    const ang = randRange(r, 0, Math.PI * 2);
    const base: P = {
      x: pos.x + randRange(r, -0.1, 0.1),
      y: pos.y + randRange(r, -0.1, 0.1),
      vx: Math.cos(ang),
      vy: Math.sin(ang),
      life: 0.5,
      max: 0.5,
      size: 0.08,
      color: 0xffffff,
      grav: 4,
      drag: 2,
      spin: 0,
      rot: 0,
      shape: 0,
    };
    switch (kind) {
      case "dust": {
        const sp = randRange(r, 0.4, 1.8);
        base.vx *= sp;
        base.vy = -Math.abs(base.vy) * randRange(r, 0.4, 1.2);
        base.grav = 3;
        base.color = 0xcdbfae;
        base.size = randRange(r, 0.05, 0.12);
        base.max = base.life = randRange(r, 0.3, 0.6);
        break;
      }
      case "impact": {
        const sp = randRange(r, 2, 6);
        base.vx *= sp;
        base.vy *= sp;
        base.grav = 6;
        base.drag = 3;
        base.color = i(r, [0xffffff, 0xffe9a8, 0xffc74d]);
        base.size = randRange(r, 0.05, 0.14);
        base.max = base.life = randRange(r, 0.25, 0.5);
        break;
      }
      case "pop": {
        const sp = randRange(r, 2, 7);
        base.vx *= sp;
        base.vy *= sp;
        base.grav = 8;
        base.color = i(r, CONFETTI);
        base.size = randRange(r, 0.06, 0.14);
        base.shape = 1;
        base.spin = randRange(r, -12, 12);
        base.max = base.life = randRange(r, 0.5, 1.1);
        break;
      }
      case "splash": {
        const sp = randRange(r, 1.5, 5);
        base.vx *= sp;
        base.vy = -Math.abs(base.vy) * randRange(r, 2, 5);
        base.grav = 12;
        base.color = i(r, [0x8fe6ff, 0xcaf4ff, 0x5bd0ff]);
        base.size = randRange(r, 0.05, 0.12);
        base.max = base.life = randRange(r, 0.4, 0.8);
        break;
      }
      case "bubble": {
        base.vx *= randRange(r, 0.2, 0.8);
        base.vy = -randRange(r, 0.6, 1.6);
        base.grav = -1.5; // rise
        base.drag = 1;
        base.color = 0xd6f6ff;
        base.size = randRange(r, 0.03, 0.09);
        base.max = base.life = randRange(r, 0.8, 1.8);
        break;
      }
      case "ember": {
        const sp = randRange(r, 1, 5);
        base.vx *= sp;
        base.vy = -Math.abs(base.vy) * randRange(r, 2, 6);
        base.grav = 7;
        base.color = i(r, [0xffd24a, 0xff7a1a, 0xff3b1a]);
        base.size = randRange(r, 0.04, 0.11);
        base.max = base.life = randRange(r, 0.4, 1.0);
        break;
      }
      case "star": {
        const sp = randRange(r, 3, 8);
        base.vx *= sp;
        base.vy *= sp;
        base.grav = 0;
        base.drag = 4;
        base.color = 0xffffff;
        base.size = randRange(r, 0.06, 0.13);
        base.max = base.life = randRange(r, 0.2, 0.4);
        break;
      }
    }
    return base;
  }

  popText(pos: Vec2, text: string, color = 0xffffff) {
    let t = this.popPool.pop();
    if (!t) {
      t = new Text({ text: "", style: { fontFamily: "Baloo2, system-ui, sans-serif", fontSize: 64, fontWeight: "900", fill: 0xffffff, stroke: { color: 0x241826, width: 8, join: "round" } } });
      t.anchor.set(0.5);
      t.resolution = 2;
    }
    t.text = text;
    t.style.fill = color;
    t.scale.set(0.011);
    t.alpha = 1;
    t.visible = true;
    this.layer.addChild(t);
    this.pops.push({ t, x: pos.x, y: pos.y, vy: -1.6, life: 0.9, max: 0.9 });
  }

  update(dt: number) {
    // particles
    for (let k = this.parts.length - 1; k >= 0; k--) {
      const p = this.parts[k];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(k, 1);
        continue;
      }
      p.vy += p.grav * dt;
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
    // rings
    for (let k = this.rings.length - 1; k >= 0; k--) {
      const rg = this.rings[k];
      rg.life -= dt;
      if (rg.life <= 0) {
        this.rings.splice(k, 1);
        continue;
      }
      const t = 1 - rg.life / rg.max;
      rg.r = rg.maxR * (1 - Math.pow(1 - t, 2));
    }
    // pops
    for (let k = this.pops.length - 1; k >= 0; k--) {
      const pop = this.pops[k];
      pop.life -= dt;
      if (pop.life <= 0) {
        pop.t.visible = false;
        this.layer.removeChild(pop.t);
        this.popPool.push(pop.t);
        this.pops.splice(k, 1);
        continue;
      }
      pop.y += pop.vy * dt;
      pop.vy *= Math.max(0, 1 - 2 * dt);
      const tt = pop.life / pop.max;
      pop.t.alpha = Math.min(1, tt * 2.5);
      // counter the camera zoom so labels read the same size on screen
      // whether the party-cam is wide or fully punched in
      const zoomK = 0.85 / Math.max(0.25, this.cam.zoom);
      const s = 0.011 * (1 + (1 - tt) * 0.4) * zoomK;
      pop.t.scale.set(s);
      pop.t.position.set(pop.x, pop.y);
    }
    this.draw();
  }

  private draw() {
    const g = this.gfx;
    g.clear();
    for (const p of this.parts) {
      const a = Math.min(1, p.life / p.max);
      if (p.shape === 1) {
        g.rect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2).fill({ color: p.color, alpha: a });
      } else {
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: a });
      }
    }
    for (const rg of this.rings) {
      const a = rg.life / rg.max;
      g.circle(rg.x, rg.y, rg.r).stroke({ width: 0.06, color: rg.color, alpha: a * 0.8 });
    }
  }
}

function i(r: () => number, arr: number[]): number {
  return arr[(r() * arr.length) | 0];
}
