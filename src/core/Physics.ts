import { RAPIER } from "./rapier";
import { FIXED_DT, MAX_SUBSTEPS } from "../config";
import type { Vec2 } from "./math";

export interface RayHit {
  point: Vec2;
  normal: Vec2;
  toi: number;
  collider: RAPIER.Collider;
}

/** Thin wrapper around a Rapier world with a fixed-timestep accumulator. */
export class Physics {
  world: RAPIER.World;
  private acc = 0;

  constructor(gravity: Vec2) {
    this.world = new RAPIER.World(new RAPIER.Vector2(gravity.x, gravity.y));
    this.world.timestep = FIXED_DT;
  }

  setGravity(g: Vec2) {
    this.world.gravity = new RAPIER.Vector2(g.x, g.y);
  }

  /** Advance the sim in fixed steps. Returns the interpolation alpha (0..1). */
  step(dt: number, onStep?: () => void): number {
    this.acc += Math.min(dt, 0.1); // clamp huge frames (tab refocus)
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
      onStep?.();
      this.world.step();
      this.acc -= FIXED_DT;
      steps++;
    }
    if (steps === MAX_SUBSTEPS) this.acc = 0; // avoid spiral of death
    return this.acc / FIXED_DT;
  }

  /** Cast a ray; returns the closest hit or null. */
  castRay(
    origin: Vec2,
    dir: Vec2,
    maxToi: number,
    groups: number,
    exclude?: RAPIER.RigidBody,
  ): RayHit | null {
    const ray = new RAPIER.Ray(new RAPIER.Vector2(origin.x, origin.y), new RAPIER.Vector2(dir.x, dir.y));
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxToi,
      true,
      undefined,
      groups,
      undefined,
      exclude,
    );
    if (!hit) return null;
    const p = ray.pointAt(hit.timeOfImpact);
    return {
      point: { x: p.x, y: p.y },
      normal: { x: hit.normal.x, y: hit.normal.y },
      toi: hit.timeOfImpact,
      collider: hit.collider,
    };
  }

  removeBody(body: RAPIER.RigidBody) {
    this.world.removeRigidBody(body);
  }

  destroy() {
    this.world.free();
  }
}
