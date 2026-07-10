import { Texture } from "pixi.js";
import type { Palette } from "../config";
import { renderGoat } from "./GoatArt";

const cache = new Map<string, Texture>();

/** One cached, upright goat portrait per palette — for menus & HUD. */
export function goatPreview(pal: Palette): Texture {
  let t = cache.get(pal.name);
  if (!t) {
    t = Texture.from(renderGoat(pal, 0.15, 0.1));
    t.source.scaleMode = "linear";
    cache.set(pal.name, t);
  }
  return t;
}
