import { Graphics } from "pixi.js";
import { Board, type TerrainTheme } from "./Board";
import type { Arena } from "../core/types";
import { makeRng, randRange } from "../core/math";

const THEME: TerrainTheme = { top: 0x6b5b53, topLight: 0x8a7368, face: 0x413732, faceDark: 0x2a221f };

export class VolcanoBoard extends Board {
  readonly name = "Cinder Cone";
  readonly blurb = "Basalt islands in a lake of soup that eats goats.";
  readonly tip = "Aim your hooves and KICK rivals into the lava — or into the molten glass at the edges. A boot to the head also settles arguments.";
  theme = THEME;
  gravityScale = 1;

  private baseLavaY = 4.05;
  private lavaY = this.baseLavaY;
  private lavaOverlay = new Graphics();
  private t = 0;
  private rng = makeRng(7);

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#2a1040"],
      [1, "#4a1830"],
    ]);
    this.addBackdrop("volcano");
    this.root.addChild(this.lavaOverlay);

    // colliders matched to the painted rock pillars (arena-art px coords)
    this.solidPxRect(arena, 0, 528, 385, 800); // left shelf
    this.solidPxRect(arena, 600, 487, 1035, 800); // centre pillar
    this.solidPxRect(arena, 1285, 522, 1672, 800); // right shelf
    this.solidPxRect(arena, 452, 578, 568, 652); // floating stone L
    this.solidPxRect(arena, 1080, 573, 1198, 647); // floating stone R

    // walls + ceiling so nobody leaves the painting
    this.addArenaShell(arena);

    // molten obsidian shards guard the far edges
    this.addHazard("lavaShards", this.bounds.minX + 1.15, 0.86, 2.0, {
      labels: ["VITRIFIED", "SHARDED", "WELL DONE"],
      fx: "ember",
      sfx: "sizzle",
    });
    this.addHazard("lavaShards", this.bounds.maxX - 1.15, 0.78, 2.0, {
      flip: true,
      labels: ["VITRIFIED", "SHARDED", "WELL DONE"],
      fx: "ember",
      sfx: "sizzle",
    });

    this.spawns = [
      { pos: { x: -7.4, y: -0.2 }, angle: 0 },
      { pos: { x: 7.6, y: -0.3 }, angle: 0 },
      { pos: { x: -1.7, y: -0.8 }, angle: 0 },
      { pos: { x: 2.0, y: -0.8 }, angle: 0 },
    ];
  }

  reset() {
    this.lavaY = this.baseLavaY;
  }

  escalate(dt: number) {
    this.lavaY = Math.max(0.2, this.lavaY - dt * 0.16);
  }

  update(dt: number, arena: Arena) {
    this.t += dt;
    if (this.rng() < dt * 5) {
      const x = randRange(this.rng, this.bounds.minX, this.bounds.maxX);
      arena.fx.burst("ember", { x, y: this.lavaY + 0.3 }, { n: 2 });
    }
    // rising-lava overlay becomes visible during sudden death
    this.lavaOverlay.clear();
    if (this.lavaY < this.baseLavaY - 0.05) {
      const { minX, maxX, maxY } = this.bounds;
      this.lavaOverlay
        .rect(minX, this.lavaY, maxX - minX, maxY - this.lavaY + 1)
        .fill({ color: 0xff5a1a, alpha: 0.82 });
      for (let x = minX; x < maxX; x += 0.5) {
        const y = this.lavaY + Math.sin(x * 1.3 + this.t * 2.4) * 0.09;
        this.lavaOverlay.circle(x, y, 0.07).fill({ color: 0xffd76a, alpha: 0.85 });
      }
    }
  }

  checkHazards(arena: Arena) {
    super.checkHazards(arena);
    for (const goat of arena.goats) {
      if (goat.dead || goat.eliminated || goat.invulnT > 0) continue;
      if (goat.pos.y > this.lavaY + 0.15) {
        arena.fx.burst("ember", goat.pos, { n: 16 });
        arena.fx.burst("splash", goat.pos, { n: 6 });
        arena.sfx.play("sizzle");
        arena.killGoat(goat, pick(["FONDUE!", "MEDIUM RARE", "TOASTY", "SOUP"]), { x: 0, y: -2.5 });
      }
    }
  }
}

function pick<T>(a: T[]): T {
  return a[(Math.random() * a.length) | 0];
}
