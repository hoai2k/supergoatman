import { Board, type TerrainTheme } from "./Board";
import type { Arena } from "../core/types";

const THEME: TerrainTheme = { top: 0x62c6f2, topLight: 0x9fe0ff, face: 0xe45f9e, faceDark: 0xb03d78 };

export class CastleBoard extends Board {
  readonly name = "Bounce Palace";
  readonly blurb = "A rental. We are absolutely not getting the deposit back.";
  readonly tip = "EVERYTHING is bouncy — time your kicks off the rebound to fly. The silver spikes on the side ledges are, regrettably, not bouncy.";
  theme = THEME;
  gravityScale = 1;

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#1e6fe0"],
      [1, "#63b7f2"],
    ]);
    this.addBackdrop("castle");
    this.addArenaShell(arena);

    // surveyed layout (?edit=bb export 2026-07-11): one wall-to-wall
    // mattress — the entire floor is a trampoline, nowhere to hide
    this.solidPxRect(arena, 0, 652, 1672, 850, { restitution: 0.82, bouncy: true, friction: 0.7 });

    // painted silver spike beds on the ledges
    this.addKillZonePx(0, 570, 195, 700, { labels: ["DEFLATED", "POPPED", "DEPOSIT LOST"], fx: "star", sfx: "pop" });
    this.addKillZonePx(1480, 570, 1672, 700, { labels: ["DEFLATED", "POPPED", "DEPOSIT LOST"], fx: "star", sfx: "pop" });

    this.spawns = [
      { pos: { x: -5.5, y: 1.4 }, angle: 0 },
      { pos: { x: 5.5, y: 1.4 }, angle: 0 },
      { pos: { x: -1.8, y: 1.4 }, angle: 0 },
      { pos: { x: 1.8, y: 1.4 }, angle: 0 },
    ];
  }

  escalate(dt: number) {
    this.creepZones(dt);
  }
}
