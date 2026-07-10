import type { Goat } from "../entities/Goat";
import type { Arena } from "../core/types";
import type { Intent } from "../core/intent";
import { angleDelta, clamp, dist, type Vec2 } from "../core/math";

interface Tuning {
  react: number; // seconds between decisions
  aimNoise: number;
  engage: number; // distance to start aiming kicks
  aggression: number; // 0..1 kick frequency
  grabChance: number;
  panic: number; // how early it tries to recover
}

const LEVELS: Tuning[] = [
  { react: 0.34, aimNoise: 0.55, engage: 2.4, aggression: 0.45, grabChance: 0.05, panic: 3.0 },
  { react: 0.22, aimNoise: 0.32, engage: 2.9, aggression: 0.7, grabChance: 0.12, panic: 4.0 },
  { react: 0.13, aimNoise: 0.16, engage: 3.4, aggression: 0.92, grabChance: 0.2, panic: 5.2 },
];

/** A scrappy, slightly chaotic goat brain. Reads the world, tumbles, kicks. */
export class GoatAI {
  private t: Tuning;
  private decisionT = 0;
  private targetIdx = -1;
  private kickHold = 0;
  private grabHold = 0;
  private noise = 0;
  private wander = 0;

  constructor(level: number) {
    this.t = LEVELS[clamp(level, 0, LEVELS.length - 1) | 0];
  }

  think(goat: Goat, arena: Arena, dt: number): Intent {
    this.decisionT -= dt;
    this.kickHold = Math.max(0, this.kickHold - dt);
    this.grabHold = Math.max(0, this.grabHold - dt);

    if (this.decisionT <= 0) {
      this.decisionT = this.t.react * (0.7 + Math.random() * 0.6);
      this.decide(goat, arena);
    }

    const me = goat.pos;
    const angle = goat.angle;
    const vel = goat.vel;

    const intent: Intent = { roll: 0, aimX: 0, aimY: 0, kick: false, grab: false };

    const target = this.targetIdx >= 0 ? arena.goats[this.targetIdx] : undefined;
    const safeTarget = target && !target.dead ? target : this.nearest(goat, arena);

    // Recovery: if falling fast, orient head up and kick to arrest the fall.
    if (vel.y > 5.5) {
      const desired = -Math.PI / 2; // head up
      const err = angleDelta(angle, desired) + this.noise * 0.4;
      intent.roll = clamp(err * 1.4, -1, 1);
      if (Math.abs(err) < 0.7) intent.kick = true;
      return intent;
    }

    // stay away from the deadly arena edges
    const b = arena.bounds;
    if (me.x < b.minX + 2.6) {
      intent.roll = 1;
      if (me.x < b.minX + 1.9 && vel.x < 0.4) intent.kick = this.kickHold > 0;
      return intent;
    }
    if (me.x > b.maxX - 2.6) {
      intent.roll = -1;
      if (me.x > b.maxX - 1.9 && vel.x > -0.4) intent.kick = this.kickHold > 0;
      return intent;
    }

    if (!safeTarget) {
      // wander
      this.wander += dt;
      intent.roll = Math.sin(this.wander * 0.7) * 0.5;
      return intent;
    }

    const to = { x: safeTarget.pos.x - me.x, y: safeTarget.pos.y - me.y };
    const d = Math.hypot(to.x, to.y);

    if (d > this.t.engage) {
      // approach: tumble toward the opponent's horizontal side
      intent.roll = clamp(Math.sign(to.x) * (0.7 + Math.random() * 0.3) + this.noise * 0.3, -1, 1);
      // opportunistic hop-kick to close big gaps
      if (Math.abs(to.x) > 3 && this.kickHold > 0) intent.kick = true;
    } else {
      // in range: rotate so the FEET (-head) point at the opponent, then kick
      const desiredHead = Math.atan2(-to.y, -to.x); // head away => feet toward
      const err = angleDelta(angle, desiredHead) + this.noise * this.t.aimNoise;
      intent.roll = clamp(err * 1.6, -1, 1);
      if (Math.abs(err) < 0.55 && this.kickHold > 0) intent.kick = true;
      if (this.grabHold > 0 && d < 1.4) intent.grab = true;
    }

    return intent;
  }

  private decide(goat: Goat, arena: Arena) {
    this.noise = (Math.random() * 2 - 1);
    const nearest = this.nearest(goat, arena);
    this.targetIdx = nearest ? arena.goats.indexOf(nearest) : -1;
    if (Math.random() < this.t.aggression) this.kickHold = 0.18;
    if (Math.random() < this.t.grabChance) this.grabHold = 0.5;
  }

  private nearest(goat: Goat, arena: Arena): Goat | undefined {
    let best: Goat | undefined;
    let bd = Infinity;
    for (const g of arena.goats) {
      if (g === goat || g.dead || g.eliminated) continue;
      const d = dist(goat.pos, g.pos);
      if (d < bd) {
        bd = d;
        best = g;
      }
    }
    return best;
  }
}

// (kept for potential future targeting of props)
export type Targetable = { pos: Vec2 };
