import { Graphics, Text, TextStyle, type TextStyleFontWeight } from "pixi.js";

export const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const COL = {
  ink: 0x241826,
  cream: 0xfff6e9,
  panel: 0x2a2140,
  panel2: 0x372b52,
  accent: 0xffd23f,
  good: 0x8fd94b,
  bad: 0xff5d5d,
  dim: 0x9a90b0,
};

export function mkText(
  str: string,
  opts: {
    size?: number;
    weight?: TextStyleFontWeight;
    fill?: number;
    stroke?: number;
    strokeW?: number;
    anchor?: number;
    anchorX?: number;
    anchorY?: number;
    align?: "left" | "center" | "right";
    letterSpacing?: number;
  } = {},
): Text {
  const style = new TextStyle({
    fontFamily: FONT,
    fontSize: opts.size ?? 28,
    fontWeight: opts.weight ?? "800",
    fill: opts.fill ?? COL.cream,
    align: opts.align ?? "center",
    letterSpacing: opts.letterSpacing ?? 0,
  });
  if (opts.stroke !== undefined) {
    style.stroke = { color: opts.stroke, width: opts.strokeW ?? 6, join: "round" };
  }
  const t = new Text({ text: str, style });
  t.anchor.set(opts.anchorX ?? opts.anchor ?? 0.5, opts.anchorY ?? opts.anchor ?? 0.5);
  t.resolution = 2;
  return t;
}

export function panel(
  w: number,
  h: number,
  opts: { fill?: number; alpha?: number; radius?: number; stroke?: number; strokeW?: number; strokeAlpha?: number } = {},
): Graphics {
  const g = new Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, opts.radius ?? 18).fill({ color: opts.fill ?? COL.panel, alpha: opts.alpha ?? 1 });
  if (opts.stroke !== undefined) {
    g.roundRect(-w / 2, -h / 2, w, h, opts.radius ?? 18).stroke({ color: opts.stroke, width: opts.strokeW ?? 3, alpha: opts.strokeAlpha ?? 1 });
  }
  return g;
}

/** A small controller-button glyph, e.g. Ⓐ / Ⓧ, for on-screen hints. */
export function buttonGlyph(letter: string, color: number, r = 16): Graphics {
  const g = new Graphics();
  g.circle(0, 0, r).fill({ color });
  g.circle(0, 0, r).stroke({ color: 0x000000, width: 2, alpha: 0.25 });
  const t = mkText(letter, { size: r * 1.2, weight: "900", fill: 0x241826 });
  g.addChild(t);
  return g;
}

// ease helpers for menu pops
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
