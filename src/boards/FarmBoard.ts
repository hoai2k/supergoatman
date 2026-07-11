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

    // surveyed layout (?edit=bb export 2026-07-11)
    // the paddock
    this.solidPxRect(arena, 150, 720, 1520, 850);
    // centre table — a pure floating deck now, brawl right underneath it
    this.solidPxRect(arena, 600, 501, 1075, 532, { oneWay: true });
    // floating plank
    this.solidPxRect(arena, 688, 358, 977, 394, { oneWay: true });
    // benches (tops only)
    this.solidPxRect(arena, 321, 588, 548, 619, { oneWay: true });
    this.solidPxRect(arena, 1114, 583, 1345, 617, { oneWay: true });
    // rusty machinery blocks the edges
    this.solidPxRect(arena, -14, 587, 201, 1008);
    this.solidPxRect(arena, 1440, 619, 1653, 1000);

    // ...and shreds whatever touches it (hazards surveyed 2026-07-11)
    this.addKillZonePx(30, 633, 317, 800, { labels: ["THRESHED", "BALED", "TETANUS"], fx: "star", sfx: "thud" });
    this.addKillZonePx(1337, 680, 1650, 800, { labels: ["THRESHED", "BALED", "TETANUS"], fx: "star", sfx: "thud" });
    // spike rows crowning the machinery
    this.addKillZonePx(1409, 573, 1681, 636);
    this.addKillZonePx(1476, 529, 1699, 578);
    this.addKillZonePx(-2, 531, 175, 579);
    this.addKillZonePx(147, 573, 256, 643);

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
