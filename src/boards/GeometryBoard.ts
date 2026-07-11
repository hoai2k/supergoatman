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

    // neon slabs matched to the painting
    this.solidPxRect(arena, 420, 638, 1260, 810); // central platform
    this.solidPxRect(arena, 690, 308, 985, 388); // floating hex
    this.solidPxRect(arena, 170, 595, 420, 665); // left steps
    this.solidPxRect(arena, 350, 515, 545, 575);
    this.solidPxRect(arena, 245, 478, 345, 532);
    this.solidPxRect(arena, 1175, 512, 1390, 572); // right steps
    this.solidPxRect(arena, 1290, 588, 1500, 658);
    this.solidPxRect(arena, 0, 650, 265, 720); // low outer benches
    this.solidPxRect(arena, 1400, 645, 1672, 715);
    // grid floor at the bottom so the void doesn't eat everyone instantly
    this.solidRect(arena, this.bounds.minX, 5.9, this.bounds.maxX, 6.75);

    // the giant painted gear-saws
    this.addKillZonePx(0, 60, 250, 620, { labels: ["GEARED", "SAWN", "TESSELLATED"], fx: "star", sfx: "pop" });
    this.addKillZonePx(1420, 60, 1672, 620, { labels: ["GEARED", "SAWN", "TESSELLATED"], fx: "star", sfx: "pop" });

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

  escalate(dt: number) {
    this.creepZones(dt);
  }
}
