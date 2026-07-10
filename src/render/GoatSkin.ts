import { Texture } from "pixi.js";
import type { Palette } from "../config";
import { renderGoat, ANCHOR, ART_PPU } from "./GoatArt";
import { clamp } from "../core/math";

const KICK_STEPS = 6; // 0 .. 1
const GRAB_STEPS = 3;

/** A pre-rendered, recoloured goat: a grid of textures indexed by kick/grab. */
export class GoatSkin {
  readonly anchor = ANCHOR;
  readonly ppu = ART_PPU;
  private grid: Texture[][] = [];

  constructor(public palette: Palette) {
    for (let k = 0; k < KICK_STEPS; k++) {
      const row: Texture[] = [];
      for (let g = 0; g < GRAB_STEPS; g++) {
        const kick = k / (KICK_STEPS - 1);
        const grab = g / (GRAB_STEPS - 1);
        const tex = Texture.from(renderGoat(palette, kick, grab));
        tex.source.scaleMode = "linear";
        row.push(tex);
      }
      this.grid.push(row);
    }
  }

  frame(kick01: number, grab01: number): Texture {
    const k = Math.round(clamp(kick01, 0, 1) * (KICK_STEPS - 1));
    const g = Math.round(clamp(grab01, 0, 1) * (GRAB_STEPS - 1));
    return this.grid[k][g];
  }

  destroy() {
    for (const row of this.grid) for (const t of row) t.destroy(true);
  }
}

const cache = new Map<string, GoatSkin>();

export function getSkin(palette: Palette): GoatSkin {
  let s = cache.get(palette.name);
  if (!s) {
    s = new GoatSkin(palette);
    cache.set(palette.name, s);
  }
  return s;
}
