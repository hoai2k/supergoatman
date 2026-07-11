import { Texture } from "pixi.js";

let cached: Texture | null = null;

/** Soft radial glow texture (white core, transparent rim) for additive FX. */
export function glowTexture(): Texture {
  if (cached) return cached;
  const size = 128;
  const cv = document.createElement("canvas");
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.35, "rgba(255,244,190,0.55)");
  g.addColorStop(0.7, "rgba(255,232,150,0.18)");
  g.addColorStop(1, "rgba(255,232,150,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cached = Texture.from(cv);
  cached.source.scaleMode = "linear";
  return cached;
}
