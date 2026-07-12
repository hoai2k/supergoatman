import { Board, type TerrainTheme } from "./Board";
import type { Arena } from "../core/types";
import { FIXED_DT } from "../config";

const THEME: TerrainTheme = { top: 0x62c6f2, topLight: 0x9fe0ff, face: 0xe45f9e, faceDark: 0xb03d78 };

/** Top plane of the wall-to-wall mattress, in world units. */
const MAT_TOP = (652 / 941) * 13.5 - 6.75;

export class CastleBoard extends Board {
  readonly name = "Bounce Palace";
  readonly blurb = "A rental. We are absolutely not getting the deposit back.";
  readonly tip = "The floor is a trampoline: KICK or HEADBUTT as you land to pump MUCH higher each time. Rolling boings. The silver spikes are, regrettably, not bouncy.";
  theme = THEME;
  gravityScale = 1;
  speedCap = 16; // trampoline airs need headroom over the standard cap

  private prevVy = new Map<number, number>();
  private hopCd = new Map<number, number>();

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

  /**
   * Trampoline physics: every landing rebounds with almost all of its fall
   * speed, landing WITH a kick or headbutt pumps the bounce higher each
   * time (fall speed + hit integrated), rolling adds boing, and anything
   * arriving fast — including goats spiked downward — rebounds
   * correspondingly high.
   */
  fixedStep(arena: Arena) {
    for (const g of arena.goats) {
      const idx = g.playerIndex;
      if (g.dead || g.eliminated) {
        this.prevVy.delete(idx);
        continue;
      }
      const vy = g.body.linvel().y;
      const prev = this.prevVy.get(idx) ?? vy;
      const cd = Math.max(0, (this.hopCd.get(idx) ?? 0) - FIXED_DT);
      this.hopCd.set(idx, cd);
      const near = g.pos.y > MAT_TOP - 0.8 && g.pos.y < MAT_TOP + 1.2;

      if (near && cd <= 0 && prev > 1.0 && vy <= 0.2) {
        // impact: the solver just reversed a real fall — take over the launch
        const pound = g.poundT > 0;
        // rolling barely feeds the launch — height comes from falls and hits
        const rollJuice = Math.min(0.5, Math.abs(g.body.angvel()) * 0.06);
        const out = Math.min(
          15,
          pound ? prev * 1.12 + 4.2 + rollJuice : prev * 0.98 + rollJuice,
        );
        const lv = g.body.linvel();
        g.body.setLinvel({ x: lv.x, y: -out }, true);
        this.hopCd.set(idx, 0.14);
        arena.fx.burst("dust", { x: g.pos.x, y: MAT_TOP }, { n: pound ? 14 : 5 });
        if (pound) {
          arena.fx.shake(5);
          arena.sfx.play("kick", { rate: 0.65, volume: 0.8 });
        } else if (prev > 3) {
          arena.sfx.play("pop", { rate: 0.9, volume: 0.35 });
        }
      } else if (near && cd <= 0 && Math.abs(vy) < 0.7 && Math.abs(g.body.angvel()) > 2.2) {
        // rolling across the mattress: little cosmetic boings, no real lift
        const lv = g.body.linvel();
        g.body.setLinvel(
          { x: lv.x, y: -Math.min(1.1, 0.6 + Math.abs(g.body.angvel()) * 0.06) },
          true,
        );
        this.hopCd.set(idx, 0.34);
        arena.fx.burst("dust", { x: g.pos.x, y: MAT_TOP }, { n: 4 });
      }
      this.prevVy.set(idx, vy);
    }
  }
}
