import { Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { Board, type TerrainTheme } from "./Board";
import { CG, groups } from "../config";
import type { Arena } from "../core/types";

const THEME: TerrainTheme = { top: 0xb07bff, topLight: 0xd4b3ff, face: 0x3a2a6e, faceDark: 0x241a48 };

export class GeometryBoard extends Board {
  readonly name = "Euclid's Revenge";
  readonly blurb = "Low gravity, glowing geometry, and two gear-saws that failed the safety audit.";
  readonly tip = "Gravity is soft here — huge floaty leaps. Ride the spinning cube for the high ground, and stay OUT of the gears. They are not decorative.";
  theme = THEME;
  gravityScale = 0.72;

  private spinner!: RigidBody;
  private spinnerGfx = new Graphics();
  private spinAngle = 0;
  private t = 0;
  private readonly SPIN_HALF = 1.05;

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#120a2e"],
      [1, "#2a1a5e"],
    ]);
    this.addBackdrop("geometry");
    this.addArenaShell(arena);

    // surveyed layout (?edit=bb export 2026-07-11) — every slab hovers,
    // every slab is a brawler platform: leap up through, land on top
    this.solidPxRect(arena, 423, 649, 1263, 693, { oneWay: true }); // central platform
    this.solidPxRect(arena, 690, 318, 985, 362, { oneWay: true }); // floating hex
    this.solidPxRect(arena, 170, 595, 420, 639, { oneWay: true }); // left steps
    this.solidPxRect(arena, 382, 518, 541, 560, { oneWay: true });
    this.solidPxRect(arena, 251, 478, 422, 502, { oneWay: true });
    this.solidPxRect(arena, 1176, 520, 1334, 554, { oneWay: true }); // right steps
    this.solidPxRect(arena, 1294, 591, 1505, 629, { oneWay: true });
    this.solidPxRect(arena, 0, 671, 265, 714, { oneWay: true }); // low outer benches
    this.solidPxRect(arena, 1413, 671, 1685, 715, { oneWay: true });
    // grid floor at the bottom so the void doesn't eat everyone instantly
    this.solidPxRect(arena, 0, 882, 1672, 941);
    // little right-side hop pad
    this.solidPxRect(arena, 1345, 473, 1441, 501, { oneWay: true });
    // survey pass 2 (?edit=bb export 2026-07-12): the small floating shapes
    // and low pillar tops are all standable brawler platforms too
    this.solidPxRect(arena, 1325, 735, 1427, 813, { oneWay: true });
    this.solidPxRect(arena, 214, 733, 298, 848, { oneWay: true });
    this.solidPxRect(arena, 1132, 782, 1217, 858, { oneWay: true });
    this.solidPxRect(arena, 449, 818, 571, 867, { oneWay: true });
    this.solidPxRect(arena, 483, 351, 527, 400, { oneWay: true });
    this.solidPxRect(arena, 1214, 271, 1310, 403, { oneWay: true });
    this.solidPxRect(arena, 562, 256, 615, 304, { oneWay: true });
    this.solidPxRect(arena, 993, 245, 1059, 294, { oneWay: true });
    this.solidPxRect(arena, 1154, 568, 1209, 617, { oneWay: true });
    this.solidPxRect(arena, 270, 402, 352, 467, { oneWay: true });
    this.solidPxRect(arena, 1220, 160, 1288, 209, { oneWay: true });
    this.solidPxRect(arena, 366, 164, 524, 228, { oneWay: true });

    // the giant painted gear-saws (hazards surveyed 2026-07-11)
    this.addKillZonePx(0, 60, 121, 589, { labels: ["GEARED", "SAWN", "TESSELLATED"], fx: "star", sfx: "pop" });
    this.addKillZonePx(1544, 60, 1672, 592, { labels: ["GEARED", "SAWN", "TESSELLATED"], fx: "star", sfx: "pop" });
    // spike columns flanking the gear pits
    this.addKillZonePx(1448, 222, 1552, 487);
    this.addKillZonePx(113, 203, 217, 485);

    this.spawns = [
      { pos: { x: -4.5, y: 1.6 }, angle: 0 },
      { pos: { x: 4.5, y: 1.6 }, angle: 0 },
      { pos: { x: -1.5, y: 1.6 }, angle: 0 },
      { pos: { x: 1.5, y: 1.6 }, angle: 0 },
    ];

    // the spinning cube: a slowly rotating kinematic platform above centre
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -0.6);
    this.spinner = arena.physics.world.createRigidBody(desc);
    const col = RAPIER.ColliderDesc.cuboid(this.SPIN_HALF, this.SPIN_HALF)
      .setFriction(1.0)
      .setCollisionGroups(groups(CG.TERRAIN, CG.GOAT | CG.PROP));
    arena.physics.world.createCollider(col, this.spinner);
    this.root.addChild(this.spinnerGfx);
    this.drawSpinner();
  }

  private drawSpinner() {
    const g = this.spinnerGfx;
    const h = this.SPIN_HALF;
    g.clear();
    const pulse = 0.55 + 0.25 * Math.sin(this.t * 3);
    g.rect(-h, -h, h * 2, h * 2).fill({ color: 0x2a1a5e, alpha: 0.88 });
    g.rect(-h, -h, h * 2, h * 2).stroke({ width: 0.09, color: 0x00eaff, alpha: pulse });
    g.rect(-h * 0.62, -h * 0.62, h * 1.24, h * 1.24).stroke({ width: 0.05, color: 0xff4bd8, alpha: pulse * 0.9 });
    g.moveTo(-h, 0).lineTo(h, 0).stroke({ width: 0.03, color: 0x00eaff, alpha: 0.35 });
    g.moveTo(0, -h).lineTo(0, h).stroke({ width: 0.03, color: 0x00eaff, alpha: 0.35 });
  }

  fixedStep() {
    this.spinAngle += 0.55 / 120; // slow, majestic, mildly rude
    this.spinner.setNextKinematicRotation(this.spinAngle);
  }

  update(dt: number, arena: Arena) {
    this.t += dt;
    const p = this.spinner.translation();
    this.spinnerGfx.position.set(p.x, p.y);
    this.spinnerGfx.rotation = this.spinner.rotation();
    this.drawSpinner();
    if (Math.random() < dt * 1.2) {
      arena.fx.burst("star", { x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 10 }, { n: 1 });
    }
  }

}
