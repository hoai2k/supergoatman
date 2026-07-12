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

  /**
   * One-way ("brawler") platforms: solid when landed on from above, thin
   * air when jumped through from below.
   *
   * The filter hook runs INSIDE world.step(), where the World is mutably
   * borrowed by wasm — touching it there throws "recursive use of an
   * object". So everything the hook needs is snapshotted into plain JS maps
   * right before each step, and the hook reads only those.
   */
  oneWay = new Set<number>();
  private oneWayTop = new Map<number, number>(); // platform handle -> top plane y
  private bottoms = new Map<number, number>(); // dynamic collider -> lowest point y
  /** Per (deck, body) solid/pass memory — the hysteresis half of the filter. */
  private pairSolid = new Map<string, boolean>();
  /** Cached hull vertices per collider (shape.vertices round-trips wasm). */
  private vertCache = new Map<number, Float32Array>();

  /** Register a (static, axis-aligned cuboid) collider as a one-way deck. */
  addOneWay(collider: RAPIER.Collider) {
    collider.setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS);
    this.oneWay.add(collider.handle);
    const cub = collider.shape as RAPIER.Cuboid;
    this.oneWayTop.set(collider.handle, collider.translation().y - cub.halfExtents.y); // y grows down
  }

  /** Re-cache a one-way deck's top plane after its collider was edited. */
  refreshOneWay(collider: RAPIER.Collider) {
    if (!this.oneWay.has(collider.handle)) return;
    const cub = collider.shape as RAPIER.Cuboid;
    this.oneWayTop.set(collider.handle, collider.translation().y - cub.halfExtents.y);
  }

  /** Forget a one-way deck (its collider is being removed). */
  dropOneWay(handle: number) {
    this.oneWay.delete(handle);
    this.oneWayTop.delete(handle);
  }

  /**
   * Is this point within `pad` of any one-way deck's box? While passing
   * through a deck a goat has phantom footing: a kick launches at full
   * strength, so you can boost yourself up onto the platform mid-flight.
   */
  overlapsOneWay(p: Vec2, pad: number): boolean {
    for (const h of this.oneWay) {
      const c = this.world.getCollider(h);
      if (!c) continue;
      const cub = c.shape as RAPIER.Cuboid;
      const t = c.translation();
      if (Math.abs(p.x - t.x) < cub.halfExtents.x + pad && Math.abs(p.y - t.y) < cub.halfExtents.y + pad) {
        return true;
      }
    }
    return false;
  }

  private hooks: RAPIER.PhysicsHooks = {
    filterContactPair: (c1, c2) => {
      let top = this.oneWayTop.get(c1);
      let other = c2;
      if (top === undefined) {
        top = this.oneWayTop.get(c2);
        other = c1;
      }
      if (top === undefined) return RAPIER.SolverFlags.COMPUTE_IMPULSE;
      const bottom = this.bottoms.get(other);
      if (bottom === undefined) return RAPIER.SolverFlags.COMPUTE_IMPULSE;
      // hysteresis: contact ARMS when the body's lowest point is at/above the
      // top plane (0.15 slack), but once standing it stays solid until the
      // body is 0.45 past the plane. Without the wide release, a goat
      // rotating or dangling from a grab on the deck flickers past the arm
      // threshold and falls straight through the floor.
      const key = `${c1}|${c2}`;
      const wasSolid = this.pairSolid.get(key) ?? false;
      const solid = bottom <= top + (wasSolid ? 0.45 : 0.15);
      this.pairSolid.set(key, solid);
      return solid ? RAPIER.SolverFlags.COMPUTE_IMPULSE : null;
    },
    filterIntersectionPair: () => true,
  };

  /** Pre-step snapshot of every dynamic body's lowest point. */
  private snapshotBottoms() {
    this.bottoms.clear();
    this.world.forEachCollider((c) => {
      const body = c.parent();
      if (!body || body.bodyType() !== RAPIER.RigidBodyType.Dynamic) return;
      this.bottoms.set(c.handle, c.translation().y + this.extentDown(c));
    });
  }

  /** Distance from body centre to its lowest point at its CURRENT rotation. */
  private extentDown(c: RAPIER.Collider): number {
    const s = c.shape;
    const rot = c.rotation();
    if (s instanceof RAPIER.Ball) return s.radius;
    if (s instanceof RAPIER.Capsule) return s.halfHeight * Math.abs(Math.cos(rot)) + s.radius;
    if (s instanceof RAPIER.Cuboid)
      return s.halfExtents.x * Math.abs(Math.sin(rot)) + s.halfExtents.y * Math.abs(Math.cos(rot));
    if (s instanceof RAPIER.ConvexPolygon) {
      let v = this.vertCache.get(c.handle);
      if (!v) {
        v = s.vertices;
        this.vertCache.set(c.handle, v);
      }
      const sin = Math.sin(rot);
      const cos = Math.cos(rot);
      let m = 0;
      for (let i = 0; i < v.length; i += 2) m = Math.max(m, v[i] * sin + v[i + 1] * cos);
      return m;
    }
    return 0.5;
  }

  // hooks only reach the solver via the stepWithEvents path, so an event
  // queue must ride along even though nobody reads it (auto-drained)
  private eventQueue: RAPIER.EventQueue;

  constructor(gravity: Vec2) {
    this.world = new RAPIER.World(new RAPIER.Vector2(gravity.x, gravity.y));
    this.world.timestep = FIXED_DT;
    this.eventQueue = new RAPIER.EventQueue(true);
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
      if (this.oneWay.size) this.snapshotBottoms();
      this.world.step(this.eventQueue, this.hooks);
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
    this.eventQueue.free();
    this.world.free();
  }
}
