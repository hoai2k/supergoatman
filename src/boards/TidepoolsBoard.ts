import { Container } from "pixi.js";
import { Board, type TerrainTheme } from "./Board";
import type { Arena } from "../core/types";
import { DynamicCritter } from "../entities/Critter";
import { makeRng, randRange } from "../core/math";

const THEME: TerrainTheme = { top: 0xe0a878, topLight: 0xf2caa0, face: 0x3fd0d9, faceDark: 0x1f9aa6 };

export class TidepoolsBoard extends Board {
  readonly name = "Pinch Point";
  readonly blurb = "Charming rock pools. The residents are armed and the walls have opinions.";
  readonly tip = "The pools slow you down — fight from the rocks. Shrimp erupt without warning, crabs hold grudges, and both cliffs are pure urchin.";
  theme = THEME;
  gravityScale = 1;

  private critters: DynamicCritter[] = [];
  private layer = new Container();
  private waterY = 3.0; // world y of the pool surface
  private t = 0;
  private rng = makeRng(41);

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#2a9fd8"],
      [1, "#3fd0d9"],
    ]);
    this.addBackdrop("tidepools");
    this.addArenaShell(arena);
    this.root.addChild(this.layer);

    // surveyed layout (?edit=bb export 2026-07-11): slim cliff walls, no
    // central slab — two tiers of jump-through decks over one big pool
    this.solidPxRect(arena, 245, 558, 505, 599, { oneWay: true }); // left stepping stone
    this.solidPxRect(arena, 1172, 547, 1427, 591, { oneWay: true }); // right stepping stone
    this.solidPxRect(arena, 0, 100, 54, 941); // left cliff
    this.solidPxRect(arena, 1624, 127, 1841, 938); // right cliff
    this.solidPxRect(arena, 226, 704, 557, 748, { oneWay: true }); // low deck L
    this.solidPxRect(arena, 1108, 707, 1441, 751, { oneWay: true }); // low deck R
    // pool floor — the tide pools are shallow; you wade, you don't drown
    this.solidPxRect(arena, 8, 814, 1680, 1011);

    // urchin-crusted cliff faces (painted) are lethal to the touch
    this.addKillZonePx(200, 130, 300, 620, { labels: ["URCHIN'D", "WALL OF NOPE", "ACUPUNCTURE"], fx: "bubble", sfx: "splash" });
    this.addKillZonePx(1380, 150, 1470, 620, { labels: ["URCHIN'D", "WALL OF NOPE", "ACUPUNCTURE"], fx: "bubble", sfx: "splash" });

    this.spawns = [
      { pos: { x: -5.5, y: 1.4 }, angle: 0 },
      { pos: { x: 5.6, y: 1.2 }, angle: 0 },
      { pos: { x: -1.5, y: 2.0 }, angle: 0 },
      { pos: { x: 1.5, y: 2.0 }, angle: 0 },
    ];

    // residents
    this.critters.push(
      new DynamicCritter(arena, this.layer, "shrimp", 0.55, "hopper", -6.8, 4.4, -11, -5.4, this.waterY),
      new DynamicCritter(arena, this.layer, "shrimp", 0.5, "hopper", 6.8, 4.4, 5.4, 11, this.waterY),
      new DynamicCritter(arena, this.layer, "shrimp", 0.6, "hopper", 0, 4.6, -4.5, 4.5, this.waterY),
      new DynamicCritter(arena, this.layer, "crab", 0.5, "waddler", -2.5, 2.2, -4.6, 4.6),
      new DynamicCritter(arena, this.layer, "crab", 0.45, "waddler", 2.5, 2.2, -4.6, 4.6),
    );
  }

  fixedStep(arena: Arena) {
    for (const c of this.critters) c.fixedStep(arena);
    // wading: water drags goats below the surface line
    for (const goat of arena.goats) {
      if (goat.dead || goat.eliminated) continue;
      if (goat.pos.y > this.waterY) {
        const lv = goat.body.linvel();
        goat.body.setLinvel({ x: lv.x * 0.965, y: lv.y * 0.96 - 0.045 }, false);
      }
    }
  }

  update(dt: number, arena: Arena) {
    this.t += dt;
    for (const c of this.critters) c.sync();
    if (this.rng() < dt * 2) {
      arena.fx.burst("bubble", { x: randRange(this.rng, -10, 10), y: randRange(this.rng, 3.4, 5) }, { n: 1 });
    }
  }

  escalate(dt: number) {
    this.creepZones(dt);
  }

  destroy(arena: Arena) {
    for (const c of this.critters) c.destroy(arena);
    this.critters.length = 0;
    super.destroy(arena);
  }
}
