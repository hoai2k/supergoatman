import { Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import { HEAD_RADIUS } from "./goatgeom";
import type { Match } from "../core/Match";

/**
 * Live physics overlay (?debug=bb or #dbgcol): draws the ACTUAL collider
 * shapes straight out of the Rapier world every frame — terrain cuboids,
 * goat hulls, critters, chains, blocks — plus lethal zones and the goats'
 * head/hand hitboxes. What you see is exactly what the solver sees.
 */
export class DebugDraw {
  gfx = new Graphics();

  constructor(private match: Match) {
    this.gfx.zIndex = 9999;
    match.world.addChild(this.gfx);
  }

  update() {
    const g = this.gfx;
    g.clear();

    this.match.physics.world.forEachCollider((c) => {
      const body = c.parent();
      const type = body ? body.bodyType() : RAPIER.RigidBodyType.Fixed;
      const color = this.match.physics.oneWay.has(c.handle)
        ? 0xffee33 // one-way (jump-through) platform decks
        : type === RAPIER.RigidBodyType.Fixed
          ? 0x33ff88 // static terrain
          : type === RAPIER.RigidBodyType.Dynamic
            ? 0xffaa33 // dynamic (goats, critters, ragdolls, planks)
            : 0x33ddff; // kinematic (balloons, spinner)
      const t = c.translation();
      const rot = c.rotation();
      const shape = c.shape;

      if (shape instanceof RAPIER.Cuboid) {
        const hx = shape.halfExtents.x;
        const hy = shape.halfExtents.y;
        const pts: number[] = [];
        for (const [lx, ly] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]] as const) {
          const wx = t.x + lx * Math.cos(rot) - ly * Math.sin(rot);
          const wy = t.y + lx * Math.sin(rot) + ly * Math.cos(rot);
          pts.push(wx, wy);
        }
        g.poly(pts).stroke({ width: 0.035, color, alpha: 0.9 });
      } else if (shape instanceof RAPIER.Ball) {
        g.circle(t.x, t.y, shape.radius).stroke({ width: 0.035, color, alpha: 0.9 });
      } else if (shape instanceof RAPIER.Capsule) {
        const hh = shape.halfHeight;
        const r = shape.radius;
        // capsule axis is local +Y
        const ax = -Math.sin(rot) * hh;
        const ay = Math.cos(rot) * hh;
        g.circle(t.x + ax, t.y + ay, r).stroke({ width: 0.03, color, alpha: 0.9 });
        g.circle(t.x - ax, t.y - ay, r).stroke({ width: 0.03, color, alpha: 0.9 });
        g.moveTo(t.x + ax, t.y + ay).lineTo(t.x - ax, t.y - ay).stroke({ width: 0.03, color, alpha: 0.9 });
      } else if (shape instanceof RAPIER.ConvexPolygon) {
        const v = shape.vertices;
        const pts: number[] = [];
        for (let i = 0; i < v.length; i += 2) {
          const lx = v[i];
          const ly = v[i + 1];
          const wx = t.x + lx * Math.cos(rot) - ly * Math.sin(rot);
          const wy = t.y + lx * Math.sin(rot) + ly * Math.cos(rot);
          pts.push(wx, wy);
        }
        g.poly(pts).stroke({ width: 0.035, color, alpha: 0.95 });
      }
    });

    // lethal zones (live — includes sudden-death creep)
    for (const z of this.match.board.hazardZones) {
      g.rect(z.minX, z.minY, z.maxX - z.minX, z.maxY - z.minY).fill({ color: 0xff3355, alpha: 0.14 });
      g.rect(z.minX, z.minY, z.maxX - z.minX, z.maxY - z.minY).stroke({ width: 0.04, color: 0xff3355, alpha: 0.95 });
    }

    // goat head hitboxes (kick-to-head kill zone) + hand anchors
    for (const goat of this.match.goats) {
      if (goat.dead || goat.eliminated) continue;
      const h = goat.headWorld();
      g.circle(h.x, h.y, HEAD_RADIUS).stroke({ width: 0.03, color: 0xff4bd8, alpha: 0.95 });
    }

    // arena bounds
    const b = this.match.board.bounds;
    g.rect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY).stroke({ width: 0.03, color: 0xffffff, alpha: 0.3 });
  }

  destroy() {
    this.gfx.destroy();
  }
}
