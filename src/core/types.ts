import type { Vec2 } from "./math";
import type { RigidBody } from "./rapier";
import type { Physics } from "./Physics";
import type { Goat } from "../entities/Goat";

/** Anything (other than a goat) that goats can boot around or hang from. */
export interface Prop {
  body: RigidBody;
  radius: number;
  kind: string;
  grabbable: boolean;
  kickable: boolean;
  alive: boolean;
  /** Called when a goat's kick sweep touches this prop. */
  onKick?(dir: Vec2, power: number, byPlayer: number): void;
}

export interface Fx {
  burst(kind: string, pos: Vec2, opts?: Record<string, number>): void;
  shake(amount: number): void;
  popText(pos: Vec2, text: string, color?: number): void;
  ring(pos: Vec2, color: number, radius?: number): void;
}

export interface Sfx {
  play(name: string, opts?: { volume?: number; rate?: number; pan?: number }): void;
}

/** Everything an entity needs to reach out and touch the rest of the world. */
export interface Arena {
  physics: Physics;
  goats: Goat[];
  props: Prop[];
  fx: Fx;
  sfx: Sfx;
  worldToScreenPan?: number;
}
