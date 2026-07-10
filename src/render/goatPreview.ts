import type { Texture } from "pixi.js";
import type { Palette } from "../config";
import { getSkin } from "./GoatSprites";
import { NEUTRAL_ANCHOR, CELL } from "./goatgeom";

/** Upright goat portrait (neutral pose) per palette — for menus & HUD. */
export function goatPreview(pal: Palette): Texture {
  return getSkin(pal).neutral.tex;
}

/** Anchor fraction matching goatPreview textures. */
export const PREVIEW_ANCHOR = { x: NEUTRAL_ANCHOR.x / CELL, y: NEUTRAL_ANCHOR.y / CELL };
