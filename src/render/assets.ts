import { Assets, Rectangle, Texture } from "pixi.js";

/**
 * Central loader for the painted art. URLs go through Vite's asset pipeline
 * (hashed + bundled) so this works in dev and on GitHub Pages.
 */

const URLS = {
  goat: new URL("../../assets/goat-sprites-alpha.png", import.meta.url).href,
  hazards: new URL("../../assets/hazard-atlas.png", import.meta.url).href,
  plank: new URL("../../assets/bridge-plank.png", import.meta.url).href,
  arena_balloon: new URL("../../assets/arenas/balloons.png", import.meta.url).href,
  arena_volcano: new URL("../../assets/arenas/volcano.png", import.meta.url).href,
  arena_underwater: new URL("../../assets/arenas/reef.png", import.meta.url).href,
  arena_bridge: new URL("../../assets/arenas/bridge.png", import.meta.url).href,
};

const loaded = new Map<string, Texture>();

export async function loadAssets(): Promise<void> {
  const entries = Object.entries(URLS);
  await Promise.all(
    entries.map(async ([key, url]) => {
      const tex = (await Assets.load(url)) as Texture;
      tex.source.scaleMode = "linear";
      loaded.set(key, tex);
    }),
  );
}

export function tex(key: keyof typeof URLS): Texture {
  const t = loaded.get(key);
  if (!t) throw new Error(`asset not loaded: ${key}`);
  return t;
}

export function arenaTexture(boardId: string): Texture {
  return tex(`arena_${boardId}` as keyof typeof URLS);
}

/** Raw <img>/ImageBitmap pixels of the goat sheet, for recolouring. */
export function goatSourceImage(): TexImageSource {
  return tex("goat").source.resource as TexImageSource;
}

// ---- hazard atlas (1254x1254, 2x2 quadrants of 627) -----------------------
export type HazardKind = "spears" | "urchins" | "stakes" | "lavaShards";
const HAZARD_QUAD: Record<HazardKind, [number, number]> = {
  spears: [0, 0],
  urchins: [1, 0],
  stakes: [0, 1],
  lavaShards: [1, 1],
};

const hazardCache = new Map<HazardKind, Texture>();

export function hazardTexture(kind: HazardKind): Texture {
  let t = hazardCache.get(kind);
  if (!t) {
    const base = tex("hazards");
    const [qx, qy] = HAZARD_QUAD[kind];
    t = new Texture({
      source: base.source,
      frame: new Rectangle(qx * 627, qy * 627, 627, 627),
    });
    hazardCache.set(kind, t);
  }
  return t;
}
