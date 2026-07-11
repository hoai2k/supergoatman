/**
 * Measured geometry of assets/goat-sprites-alpha.png (1254x1254, 2x2 grid of
 * 627px cells; top-left = neutral pose, top-right = kick pose).
 * Derived offline from the alpha channel — see tools in the repo history.
 */

export const SHEET = 1254;
export const CELL = 627;

/** Art pixels per world unit (627px cell -> 1.254 units). */
export const GOAT_PX_PER_UNIT = 500;
export const PX2U = 1 / GOAT_PX_PER_UNIT;

// Content bounding boxes within each cell (alpha > 40).
export const NEUTRAL_BBOX = { x0: 114, y0: 137, x1: 536, y1: 490 };
export const KICK_BBOX = { x0: 23, y0: 143, x1: 516, y1: 480 };

// Mass centroid of the neutral pose (cell px) — the sprite/physics anchor.
export const NEUTRAL_ANCHOR = { x: 342.2, y: 339.4 };

// Horn cluster centres (cell px). The kick frame is anchored so the horns sit
// at the SAME local offset as in the neutral frame: the head stays stable
// while the legs stretch out.
export const HORN_NEUTRAL = { x: 431.8, y: 183.5 };
export const HORN_KICK = { x: 418.7, y: 188.7 };
export const KICK_ANCHOR = {
  x: HORN_KICK.x - (HORN_NEUTRAL.x - NEUTRAL_ANCHOR.x),
  y: HORN_KICK.y - (HORN_NEUTRAL.y - NEUTRAL_ANCHOR.y),
};

// Convex hull of the neutral pose (cell px, CCW) — becomes the physics hull.
export const HULL_PX: [number, number][] = [
  [120, 432],
  [192, 288],
  [204, 276],
  [408, 156],
  [432, 144],
  [444, 144],
  [468, 156],
  [516, 204],
  [528, 252],
  [528, 276],
  [480, 468],
  [444, 480],
  [168, 480],
  [132, 468],
  [120, 456],
];

/** Hull in local world units, relative to the anchor. */
export const HULL_LOCAL: number[] = HULL_PX.flatMap(([x, y]) => [
  (x - NEUTRAL_ANCHOR.x) * PX2U,
  (y - NEUTRAL_ANCHOR.y) * PX2U,
]);

// Key body locations in local world units (from the neutral pose).
export const HEAD_LOCAL = { x: 0.24, y: -0.19 }; // face/skull centre
export const HEAD_RADIUS = 0.2;
export const HAND_LOCAL = { x: 0.28, y: 0.22 }; // the front paws themselves
export const FEET_LOCAL = { x: -0.38, y: 0.16 }; // rear hooves
export const BODY_RADIUS = 0.42; // rough bounding radius for hazard tests

// ---- ragdoll partition of the neutral cell -------------------------------
export interface PartDef {
  name: string;
  rect: { x: number; y: number; w: number; h: number }; // crop in cell px
  radius: number; // collider radius (world units)
}

export const RAGDOLL_PARTS: PartDef[] = [
  { name: "torso", rect: { x: 108, y: 235, w: 320, h: 215 }, radius: 0.19 },
  { name: "head", rect: { x: 345, y: 128, w: 200, h: 220 }, radius: 0.16 },
  { name: "backLeg", rect: { x: 105, y: 350, w: 200, h: 150 }, radius: 0.11 },
  { name: "frontLeg", rect: { x: 315, y: 350, w: 230, h: 150 }, radius: 0.11 },
];

// Joint anchor points between parts (cell px): [partA, partB, px, py]
export const RAGDOLL_JOINTS: [string, string, number, number][] = [
  ["torso", "head", 380, 295],
  ["torso", "backLeg", 205, 400],
  ["torso", "frontLeg", 420, 400],
];

export function cellPxToLocal(px: number, py: number): { x: number; y: number } {
  return { x: (px - NEUTRAL_ANCHOR.x) * PX2U, y: (py - NEUTRAL_ANCHOR.y) * PX2U };
}
