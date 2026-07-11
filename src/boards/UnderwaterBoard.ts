import { Container, Graphics } from "pixi.js";
import { Board, type TerrainTheme } from "./Board";
import type { Arena } from "../core/types";
import type { Goat } from "../entities/Goat";
import { makeRng, randRange } from "../core/math";

const THEME: TerrainTheme = { top: 0xd9c27f, topLight: 0xf0e0a8, face: 0x3a5a6e, faceDark: 0x27404f };

export class UnderwaterBoard extends Board {
  readonly name = "The Deep End";
  readonly blurb = "A sunken reef with tasteful coral décor and extremely tactless urchins.";
  readonly tip = "You can't walk down here — KICK to swim, one stroke at a time. Herd rivals into the purple urchins. Yes, they're exactly as pointy as they look.";
  theme = THEME;
  gravityScale = 0.05; // near-weightless
  private t = 0;
  private rng = makeRng(555);
  private bubbleT = 0;

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#0a5a80"],
      [1, "#1f86a8"],
    ]);
    this.addBackdrop("underwater");

    // colliders matched to the painted reef rock (arena-art px coords)
    this.solidPxRect(arena, 0, 545, 1672, 750); // main sandy ledge
    this.solidPxRect(arena, 55, 303, 430, 545); // left pillar
    this.solidPxRect(arena, 1215, 310, 1665, 545); // right pillar
    this.solidPxRect(arena, 700, 348, 980, 470); // floating centre platform

    // walls + ceiling (the surface) — glass aquarium rules
    this.solidRect(arena, this.bounds.minX - 1.2, this.bounds.minY - 2, this.bounds.minX - 0.1, this.bounds.maxY);
    this.solidRect(arena, this.bounds.maxX + 0.1, this.bounds.minY - 2, this.bounds.maxX + 1.2, this.bounds.maxY);
    this.solidRect(arena, this.bounds.minX, this.bounds.minY - 1.4, this.bounds.maxX, this.bounds.minY - 0.3);

    // urchin colonies on the pillar tops against each wall...
    this.addHazard("urchins", this.bounds.minX + 1.1, -2.38, 1.6, {
      labels: ["URCHIN'D", "ACUPUNCTURE", "POP GOES THE GOAT"],
      fx: "bubble",
      sfx: "splash",
    });
    this.addHazard("urchins", this.bounds.maxX - 1.1, -2.28, 1.6, {
      flip: true,
      labels: ["URCHIN'D", "ACUPUNCTURE", "POP GOES THE GOAT"],
      fx: "bubble",
      sfx: "splash",
    });
    // ...and smaller ones tucked at ledge level in the wall slots
    this.addHazard("urchins", this.bounds.minX + 0.75, 1.2, 1.1, {
      labels: ["URCHIN'D", "SAT ON A CACTUS"],
      fx: "bubble",
      sfx: "splash",
    });
    this.addHazard("urchins", this.bounds.maxX - 0.75, 1.2, 1.1, {
      flip: true,
      labels: ["URCHIN'D", "SAT ON A CACTUS"],
      fx: "bubble",
      sfx: "splash",
    });

    this.spawns = [
      { pos: { x: -7.3, y: -3.4 }, angle: 0 },
      { pos: { x: 7.4, y: -3.3 }, angle: 0 },
      { pos: { x: 0.0, y: -2.8 }, angle: 0 },
      { pos: { x: 3.4, y: 0.2 }, angle: 0 },
    ];
  }

  onGoatSpawn(goat: Goat) {
    const tank = new Container();
    const g = new Graphics();
    g.roundRect(-0.14, -0.24, 0.28, 0.48, 0.13).fill({ color: 0xf1c40f });
    g.roundRect(-0.14, -0.24, 0.12, 0.48, 0.09).fill({ color: 0xf5d64b });
    g.circle(0, -0.24, 0.08).fill({ color: 0xbfc4cc });
    g.moveTo(0.04, -0.22).bezierCurveTo(0.3, -0.18, 0.35, 0.0, 0.5, 0.04).stroke({ width: 0.045, color: 0x2a2a2a, alpha: 0.8 });
    g.rotation = 0.3;
    g.position.set(-0.3, -0.22);
    tank.addChild(g);
    goat.addAccessory(tank);
  }

  fixedStep(arena: Arena) {
    // water drag: kicks become strokes that quickly bleed off
    for (const goat of arena.goats) {
      if (goat.dead || goat.eliminated) continue;
      const lv = goat.body.linvel();
      goat.body.setLinvel({ x: lv.x * 0.972 + Math.sin(this.t * 0.4) * 0.004, y: lv.y * 0.972 }, false);
      goat.body.setAngvel(goat.body.angvel() * 0.95, false);
    }
  }

  update(dt: number, arena: Arena) {
    this.t += dt;
    this.bubbleT -= dt;
    if (this.bubbleT <= 0) {
      this.bubbleT = 0.3;
      arena.fx.burst("bubble", { x: randRange(this.rng, -11, 11), y: randRange(this.rng, 0, 1) }, { n: 1 });
      for (const goat of arena.goats) {
        if (!goat.dead && !goat.eliminated && this.rng() < 0.5) {
          arena.fx.burst("bubble", { x: goat.pos.x + 0.35, y: goat.pos.y - 0.2 }, { n: 1 });
        }
      }
    }
  }
}
