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

    // the big blue mattress — a trampoline the size of a zip code
    this.solidPxRect(arena, 340, 628, 1330, 800, { restitution: 0.82, bouncy: true, friction: 0.7 });
    // pink front rim, slightly lower, also bouncy — full width so no goat
    // can wedge itself into a crack beside the walls
    this.solidPxRect(arena, 0, 745, 1672, 850, { restitution: 0.6, bouncy: true });
    // raised side ledges (where the spikes live)
    this.solidPxRect(arena, 0, 598, 330, 745, { restitution: 0.35, bouncy: true });
    this.solidPxRect(arena, 1340, 598, 1672, 745, { restitution: 0.35, bouncy: true });
    // inflatable towers as soft walls
    this.solidPxRect(arena, 160, 260, 340, 600, { restitution: 0.55, bouncy: true });
    this.solidPxRect(arena, 1330, 260, 1510, 600, { restitution: 0.55, bouncy: true });

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
