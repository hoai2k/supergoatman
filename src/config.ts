/**
 * Central tuning. The "feel" of Super Bunny Man lives in these numbers — the
 * comedy comes from a body you can only *indirectly* steer by rolling it and
 * kicking off things. Keep physics in world units (~metres); PPU converts to px.
 */

export const PPU = 100; // pixels per world unit at camera zoom 1

// ---- Goat body ---------------------------------------------------------
export const GOAT = {
  // Capsule collider (tight to the drawn body). Long axis = local X.
  halfLen: 0.30,
  radius: 0.27,
  density: 1.0,
  friction: 0.9, // grippy so it tumbles/rolls instead of sliding
  restitution: 0.02,
  linearDamping: 0.25,
  angularDamping: 0.55,

  // Rolling: left/right applies angular impulse to tumble the body.
  rollTorque: 0.55,
  maxRollSpeed: 11.0, // rad/s cap
  groundRollAssist: 2.4, // extra linear nudge along ground when rolling & grounded

  // Kick: launches head-first (feet push off). Aimed by body orientation.
  kickImpulse: 5.6, // self launch impulse (grounded)
  kickAirScale: 0.5, // fraction of launch impulse when feet aren't near a surface
  kickSpin: 0.03, // small angular kick for style
  kickReach: 0.72, // how far the legs sweep from the feet end
  kickWidth: 0.34,
  kickKnockback: 6.2, // impulse imparted to victims
  kickUpBias: 0.35, // victims get lofted a bit (juicier)
  kickActiveTime: 0.16, // seconds the leg is "out" and can hit
  kickCooldown: 0.22, // seconds between kicks
  kickPopPower: 1.0,

  // Grab: hands at the head end attach to whatever they touch.
  grabReach: 0.5,
  grabStiffness: 1.0,

  eyeBlinkEvery: 3.4,
};

// Which local direction is "head" (grab side) vs "feet" (kick side).
// Local frame: +X = head/front, -X = tail/feet-ish. Legs hang down (-Y-ish)
// but the launch axis we use is along the body's long axis toward the head.
export const HEAD_LOCAL = { x: 1, y: 0 };
export const FEET_LOCAL = { x: -1, y: 0 };

// ---- World -------------------------------------------------------------
export const GRAVITY = 22.0;

// Fixed simulation timestep (deterministic, stable).
export const FIXED_DT = 1 / 120;
export const MAX_SUBSTEPS = 6;

// ---- Collision groups (membership<<16 | filter) ------------------------
export const CG = {
  TERRAIN: 0x0001,
  GOAT: 0x0002,
  PROP: 0x0004, // balloons, planks, crates, corks...
  HAZARD: 0x0008, // sensor kill-zones
  KICK: 0x0010, // transient kick sensors
  ALL: 0xffff,
};

export function groups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

// ---- Player colours (bright, fun, customizable) ------------------------
export interface Palette {
  name: string;
  body: number; // main coat
  bodyDark: number; // shading
  bodyLight: number; // highlight
  belly: number; // muzzle/belly/hooves accent
}

export const PALETTES: Palette[] = [
  { name: "Bubblegum", body: 0xff5fa2, bodyDark: 0xd63d80, bodyLight: 0xff9ec7, belly: 0xfff2f7 },
  { name: "Tangelo", body: 0xff9433, bodyDark: 0xdb6a12, bodyLight: 0xffc074, belly: 0xfff4e2 },
  { name: "Limeade", body: 0x8fd94b, bodyDark: 0x63ab27, bodyLight: 0xc0f27f, belly: 0xf6ffe8 },
  { name: "Aqua", body: 0x3fd0d9, bodyDark: 0x1f9aa6, bodyLight: 0x8ff0f4, belly: 0xe8ffff },
  { name: "Blueberry", body: 0x5b8bff, bodyDark: 0x3760d6, bodyLight: 0x9db8ff, belly: 0xeef3ff },
  { name: "Grape", body: 0xb07bff, bodyDark: 0x7f4fd6, bodyLight: 0xd4b3ff, belly: 0xf6efff },
  { name: "Coal", body: 0x4a4f5e, bodyDark: 0x2b2f3a, bodyLight: 0x757b8c, belly: 0xe9ecf5 },
  { name: "Snow", body: 0xeef1f7, bodyDark: 0xb9c0d0, bodyLight: 0xffffff, belly: 0xffffff },
];

// ---- Match rules -------------------------------------------------------
export const MATCH = {
  pointsToWin: 5,
  roundIntroTime: 2.0,
  roundOutroTime: 2.6,
  suddenDeathAfter: 45, // seconds before a board starts closing in
};

export const MAX_PLAYERS = 4;
