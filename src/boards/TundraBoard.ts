import { Container } from "pixi.js";
import { Board, type TerrainTheme } from "./Board";
import type { Arena } from "../core/types";
import { DynamicCritter, KinematicWalker } from "../entities/Critter";

const THEME: TerrainTheme = { top: 0xcfe8ff, topLight: 0xffffff, face: 0x6f9fd8, faceDark: 0x4a6fa8 };

export class TundraBoard extends Board {
  readonly name = "Black Ice";
  readonly blurb = "Zero traction, one moose with places to be, and penguins who think this is all very funny.";
  readonly tip = "The rink is pure ice — you steer by momentum, like a shopping trolley. Do NOT argue with the moose. Punt penguins; they're basically curling stones.";
  theme = THEME;
  gravityScale = 1;

  private layer = new Container();
  private moose!: KinematicWalker;
  private penguins: DynamicCritter[] = [];

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#2a2a6e"],
      [1, "#4a4a9e"],
    ]);
    this.addBackdrop("tundra");
    this.addArenaShell(arena);
    this.root.addChild(this.layer);

    // the rink: enormous and utterly frictionless
    this.solidPxRect(arena, 110, 690, 1560, 850, { friction: 0.01, icy: true });
    // raised ice blocks (also slick)
    this.solidPxRect(arena, 455, 578, 700, 690, { friction: 0.04, icy: true });
    this.solidPxRect(arena, 975, 570, 1215, 690, { friction: 0.04, icy: true });
    // floating berg
    this.solidPxRect(arena, 695, 428, 955, 490, { friction: 0.08, icy: true });
    // glacier cliffs
    this.solidPxRect(arena, 0, 60, 210, 941);
    this.solidPxRect(arena, 1460, 60, 1672, 941);

    // painted ice-spike beds at the rink edges
    this.addKillZonePx(30, 590, 250, 760, { labels: ["ICICLE'D", "FLASH FROZEN", "SLUSHIED"], fx: "star", sfx: "pop" });
    this.addKillZonePx(1430, 590, 1650, 760, { labels: ["ICICLE'D", "FLASH FROZEN", "SLUSHIED"], fx: "star", sfx: "pop" });

    this.spawns = [
      { pos: { x: -6.5, y: 2.2 }, angle: 0 },
      { pos: { x: 6.5, y: 2.2 }, angle: 0 },
      { pos: { x: -3.6, y: 0.6 }, angle: 0 },
      { pos: { x: 3.6, y: 0.6 }, angle: 0 },
    ];

    // wildlife: one moose with a commute, two smug penguins
    this.moose = new KinematicWalker(arena, this.layer, "moose", 1.7, -7.8, 7.8, 3.15, 1.15);
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

  escalate(dt: number) {
    this.creepZones(dt);
  }

  destroy(arena: Arena) {
    this.moose.destroy(arena);
    for (const p of this.penguins) p.destroy(arena);
    this.penguins.length = 0;
    super.destroy(arena);
  }
}
