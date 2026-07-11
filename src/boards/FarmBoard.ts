import { Container } from "pixi.js";
import { Board, type TerrainTheme } from "./Board";
import type { Arena } from "../core/types";
import { DynamicCritter, Walker } from "../entities/Critter";

const THEME: TerrainTheme = { top: 0x8fd94b, topLight: 0xc0f27f, face: 0x9a6b3f, faceDark: 0x74502f };

export class FarmBoard extends Board {
  readonly name = "Petting Zoo (Do Not Pet)";
  readonly blurb = "A lovely farm. The machinery is rusty, the donkey is armed, and the sheep are load-bearing.";
  readonly tip = "Sheep are bouncy ammunition. NEVER stand behind the donkey. The harvest machinery at the edges will harvest you.";
  theme = THEME;
  gravityScale = 1;

  private layer = new Container();
  private walkers: Walker[] = [];
  private sheep: DynamicCritter[] = [];

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#4ab6f2"],
      [1, "#8fd94b"],
    ]);
    this.addBackdrop("farm");
    this.addArenaShell(arena);
    this.root.addChild(this.layer);

    // the paddock
    this.solidPxRect(arena, 150, 700, 1520, 850);
    // centre table (jump up through the top, brawl underneath it)
    this.solidPxRect(arena, 600, 493, 1075, 537, { oneWay: true });
    this.solidPxRect(arena, 640, 560, 700, 700); // legs
    this.solidPxRect(arena, 950, 560, 1010, 700);
    // floating plank
    this.solidPxRect(arena, 688, 352, 977, 402, { oneWay: true });
    // benches (tops only)
    this.solidPxRect(arena, 315, 588, 555, 640, { oneWay: true });
    this.solidPxRect(arena, 1105, 583, 1345, 635, { oneWay: true });
    // rusty machinery blocks the edges
    this.solidPxRect(arena, 0, 520, 215, 941);
    this.solidPxRect(arena, 1375, 560, 1672, 941);

    // ...and shreds whatever touches it
    this.addKillZonePx(30, 500, 300, 800, { labels: ["THRESHED", "BALED", "TETANUS"], fx: "star", sfx: "thud" });
    this.addKillZonePx(1360, 540, 1650, 800, { labels: ["THRESHED", "BALED", "TETANUS"], fx: "star", sfx: "thud" });

    this.spawns = [
      { pos: { x: -6.2, y: 2.2 }, angle: 0 },
      { pos: { x: 6.2, y: 2.2 }, angle: 0 },
      { pos: { x: -1.5, y: -0.6 }, angle: 0 },
      { pos: { x: 1.5, y: -0.6 }, angle: 0 },
    ];

    // livestock
    this.walkers.push(
      new Walker(arena, this.layer, "cow", 1.25, -5.8, 5.8, 3.29, 0.7),
      new Walker(arena, this.layer, "donkey", 1.2, -6.5, 6.5, 3.29, 0.95, true),
    );
    this.sheep.push(
      new DynamicCritter(arena, this.layer, "sheep", 0.72, "sheep", -3.5, 2.4, -7, 7),
      new DynamicCritter(arena, this.layer, "sheep", 0.65, "sheep", 3.5, 2.4, -7, 7),
    );
  }

  fixedStep(arena: Arena) {
    for (const w of this.walkers) w.fixedStep(arena);
    for (const s of this.sheep) s.fixedStep(arena);
  }

  update(_dt: number, _arena: Arena) {
    for (const w of this.walkers) w.sync();
    for (const s of this.sheep) s.sync();
  }

  escalate(dt: number) {
    this.creepZones(dt);
  }

  destroy(arena: Arena) {
    for (const w of this.walkers) w.destroy(arena);
    for (const s of this.sheep) s.destroy(arena);
    this.walkers.length = 0;
    this.sheep.length = 0;
    super.destroy(arena);
  }
}
