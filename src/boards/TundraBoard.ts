import { Container } from "pixi.js";
import { Board, type TerrainTheme } from "./Board";
import type { Arena } from "../core/types";
import { DynamicCritter, Walker } from "../entities/Critter";

const THEME: TerrainTheme = { top: 0xcfe8ff, topLight: 0xffffff, face: 0x6f9fd8, faceDark: 0x4a6fa8 };

export class TundraBoard extends Board {
  readonly name = "Black Ice";
  readonly blurb = "Zero traction, one moose with places to be, and penguins who think this is all very funny.";
  readonly tip = "The rink is pure ice — you steer by momentum, like a shopping trolley. Do NOT argue with the moose. Punt penguins; they're basically curling stones.";
  theme = THEME;
  gravityScale = 1;

  private layer = new Container();
  private moose!: Walker;
  private penguins: DynamicCritter[] = [];

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#2a2a6e"],
      [1, "#4a4a9e"],
    ]);
    this.addBackdrop("tundra");
    this.addArenaShell(arena);
    this.root.addChild(this.layer);

    // surveyed layout (?edit=bb export 2026-07-11)
    // the rink: enormous and utterly frictionless
    this.solidPxRect(arena, 110, 716, 1560, 850, { friction: 0.01, icy: true });
    // floating berg — leap up through it from the rink
    this.solidPxRect(arena, 695, 428, 955, 490, { friction: 0.08, icy: true, oneWay: true });
    // glacier cliffs
    this.solidPxRect(arena, 0, 60, 125, 941);
    this.solidPxRect(arena, 1551, 60, 1672, 941);
    // raised ice shelves (slick, jump-through)
    this.solidPxRect(arena, 462, 576, 707, 625, { friction: 0.04, icy: true, oneWay: true });
    this.solidPxRect(arena, 977, 577, 1207, 626, { friction: 0.04, icy: true, oneWay: true });
    // high glacier perches
    this.solidPxRect(arena, 130, 147, 237, 285);
    this.solidPxRect(arena, 1428, 164, 1562, 272);

    // painted ice-spike beds at the rink edges (hazards surveyed 2026-07-11)
    this.addKillZonePx(65, 613, 201, 778, { labels: ["ICICLE'D", "FLASH FROZEN", "SLUSHIED"], fx: "star", sfx: "pop" });
    this.addKillZonePx(1481, 608, 1641, 778, { labels: ["ICICLE'D", "FLASH FROZEN", "SLUSHIED"], fx: "star", sfx: "pop" });
    // icicle spears guarding the glacier faces and high perches
    this.addKillZonePx(1467, 278, 1552, 441);
    this.addKillZonePx(125, 293, 204, 480);
    this.addKillZonePx(1428, 279, 1466, 357);
    this.addKillZonePx(219, 210, 256, 364);

    this.spawns = [
      { pos: { x: -6.5, y: 2.2 }, angle: 0 },
      { pos: { x: 6.5, y: 2.2 }, angle: 0 },
      { pos: { x: -3.6, y: 0.6 }, angle: 0 },
      { pos: { x: 3.6, y: 0.6 }, angle: 0 },
    ];

    // wildlife: one moose with a commute, two smug penguins
    this.moose = new Walker(arena, this.layer, "moose", 1.7, -7.8, 7.8, 3.15, 1.15);
    this.penguins.push(
      new DynamicCritter(arena, this.layer, "penguin", 0.62, "waddler", -2, 2.5, -8.5, 8.5),
      new DynamicCritter(arena, this.layer, "penguin", 0.56, "waddler", 2, 2.5, -8.5, 8.5),
    );
  }

  fixedStep(arena: Arena) {
    this.moose.fixedStep(arena);
    for (const p of this.penguins) p.fixedStep(arena);
  }

  update(_dt: number, _arena: Arena) {
    this.moose.sync();
    for (const p of this.penguins) p.sync();
  }


  destroy(arena: Arena) {
    this.moose.destroy(arena);
    for (const p of this.penguins) p.destroy(arena);
    this.penguins.length = 0;
    super.destroy(arena);
  }
}
