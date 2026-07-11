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
  arena_castle: new URL("../../assets/arenas/castle.png", import.meta.url).href,
  arena_tidepools: new URL("../../assets/arenas/tidepools.png", import.meta.url).href,
  arena_tundra: new URL("../../assets/arenas/tundra.png", import.meta.url).href,
  arena_farm: new URL("../../assets/arenas/farm.png", import.meta.url).href,
  arena_geometry: new URL("../../assets/arenas/geometry.png", import.meta.url).href,
  arena_voxel: new URL("../../assets/arenas/voxel.png", import.meta.url).href,
  arena_dungeon: new URL("../../assets/arenas/dungeon.png", import.meta.url).href,
  animals: new URL("../../assets/animal-atlas.png", import.meta.url).href,
};

// measured content rects in animal-atlas.png (4px padding)
const ANIMAL_RECTS: Record<string, [number, number, number, number]> = {
  shrimp: [92, 125, 248, 322],
  crab: [414, 251, 314, 211],
  moose: [763, 79, 351, 383],
  penguin: [1212, 168, 221, 293],
  sheep: [71, 609, 299, 271],
  cow: [413, 569, 374, 316],
  donkey: [806, 519, 326, 366],
};

const animalCache = new Map<string, Texture>();

export function animalTexture(name: keyof typeof ANIMAL_RECTS | string): Texture {
  let t = animalCache.get(name as string);
  if (!t) {
    const [x, y, w, h] = ANIMAL_RECTS[name as string];
    t = new Texture({ source: tex("animals").source, frame: new Rectangle(x, y, w, h) });
    animalCache.set(name as string, t);
  }
  return t;
}

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
