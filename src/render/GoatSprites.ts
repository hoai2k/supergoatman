import { Rectangle, Texture } from "pixi.js";
import type { Palette } from "../config";
import { goatSourceImage } from "./assets";
import {
  CELL,
  KICK_ANCHOR,
  NEUTRAL_ANCHOR,
  RAGDOLL_PARTS,
  type PartDef,
} from "./goatgeom";

/**
 * Player skins are made by recolouring the painted plush-goat sheet:
 * every "pink" pixel gets its hue rotated toward the palette colour while
 * lightness (all the soft 3D shading) is preserved. Hooves, horns, muzzle,
 * and eyes are left untouched.
 */

const BASE_HUE = 335; // the sheet's plush pink

export interface Frame {
  tex: Texture;
  anchor: { x: number; y: number }; // fraction of the frame
}

export interface PartFrame {
  def: PartDef;
  tex: Texture;
}

export class GoatSkin {
  neutral: Frame;
  kick: Frame;
  parts: PartFrame[];

  constructor(public palette: Palette) {
    const canvas = recolorSheet(palette);
    const source = Texture.from(canvas).source;
    source.scaleMode = "linear";

    this.neutral = {
      tex: new Texture({ source, frame: new Rectangle(0, 0, CELL, CELL) }),
      anchor: { x: NEUTRAL_ANCHOR.x / CELL, y: NEUTRAL_ANCHOR.y / CELL },
    };
    this.kick = {
      tex: new Texture({ source, frame: new Rectangle(CELL, 0, CELL, CELL) }),
      anchor: { x: KICK_ANCHOR.x / CELL, y: KICK_ANCHOR.y / CELL },
    };
    this.parts = RAGDOLL_PARTS.map((def) => ({
      def,
      tex: new Texture({
        source,
        frame: new Rectangle(def.rect.x, def.rect.y, def.rect.w, def.rect.h),
      }),
    }));
  }

  frame(kick01: number): Frame {
    return kick01 > 0.45 ? this.kick : this.neutral;
  }
}

// ---- recolouring ----------------------------------------------------------

function recolorSheet(pal: Palette): HTMLCanvasElement {
  const img = goatSourceImage();
  const cv = document.createElement("canvas");
  cv.width = CELL * 2;
  cv.height = CELL; // top row only: neutral + kick
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img as CanvasImageSource, 0, 0);

  const { h: targetH, s: targetS, l: targetL } = hexToHsl(pal.body);
  const desat = targetS < 0.45; // Coal / Snow style palettes
  const hueShift = targetH - BASE_HUE;
  const lightMul = desat ? (targetL > 0.6 ? 1.18 : 0.6) : 1.0;

  const data = ctx.getImageData(0, 0, cv.width, cv.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    // classify plush-pink pixels (broad hue window, some saturation)
    const isBody = s > 0.13 && (h >= 290 || h <= 20);
    if (!isBody) continue;
    let nh = (((h + hueShift) % 360) + 360) % 360;
    let ns = s;
    let nl = l;
    if (desat) {
      ns = s * 0.1;
      nl = Math.min(1, l * lightMul);
      nh = targetH;
    }
    const [r, g, b] = hslToRgb(nh, ns, nl);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
  ctx.putImageData(data, 0, 0);
  return cv;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const dd = max - min;
  const s = l > 0.5 ? dd / (2 - max - min) : dd / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / dd + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / dd + 2) / 6;
  else h = ((r - g) / dd + 4) / 6;
  return [h * 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    Math.round(f(h + 1 / 3) * 255),
    Math.round(f(h) * 255),
    Math.round(f(h - 1 / 3) * 255),
  ];
}

function hexToHsl(n: number): { h: number; s: number; l: number } {
  const [h, s, l] = rgbToHsl((n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff);
  return { h, s, l };
}

// ---- cache ----------------------------------------------------------------

const cache = new Map<string, GoatSkin>();

export function getSkin(palette: Palette): GoatSkin {
  let s = cache.get(palette.name);
  if (!s) {
    s = new GoatSkin(palette);
    cache.set(palette.name, s);
  }
  return s;
}
