import { Container, Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import { Board, type TerrainTheme } from "./Board";
import { CG, groups } from "../config";
import type { Arena, Prop } from "../core/types";

const THEME: TerrainTheme = { top: 0x7ec850, topLight: 0xa8e878, face: 0x8a6238, faceDark: 0x5f4426 };

interface Block {
  prop: Prop;
  gfx: Graphics;
  hits: number;
}

const BLOCK = 0.62;

export class VoxelBoard extends Board {
  readonly name = "Chunk Error";
  readonly blurb = "A floating island rendered at a suspiciously familiar resolution. Punch trees at your own risk.";
  readonly tip = "Kick a block TWICE to mine it — open holes under rivals, or demolish their cover. The lava pools at the edges are fully vanilla.";
  theme = THEME;
  gravityScale = 1;

  private blocks: Block[] = [];
  private layer = new Container();

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#4ab6f2"],
      [1, "#8fd0f2"],
    ]);
    this.addBackdrop("voxel");
    this.addArenaShell(arena);
    this.root.addChild(this.layer);

    // island matched to the painting
    this.solidPxRect(arena, 300, 655, 1390, 810); // main deck
    this.solidPxRect(arena, 630, 595, 1050, 660); // hill tiers
    this.solidPxRect(arena, 680, 545, 1000, 600);
    this.solidPxRect(arena, 730, 500, 930, 550);
    this.solidPxRect(arena, 500, 445, 640, 490); // floating pads
    this.solidPxRect(arena, 1035, 440, 1175, 485);
    this.solidPxRect(arena, 795, 352, 875, 398);
    // obsidian bowls at the edges
    this.solidPxRect(arena, 0, 630, 130, 941);
    this.solidPxRect(arena, 1580, 630, 1672, 941);

    // painted lava pools
    this.addKillZonePx(55, 690, 300, 850, { labels: ["GRIEFED", "SMELTED", "RESPAWN SET"], fx: "ember", sfx: "sizzle" });
    this.addKillZonePx(1390, 690, 1610, 850, { labels: ["GRIEFED", "SMELTED", "RESPAWN SET"], fx: "ember", sfx: "sizzle" });

    this.spawns = [
      { pos: { x: -6.4, y: 1.8 }, angle: 0 },
      { pos: { x: 6.0, y: 1.8 }, angle: 0 },
      { pos: { x: -2.6, y: 1.8 }, angle: 0 },
      { pos: { x: 2.6, y: 1.8 }, angle: 0 },
    ];

    // minable block structures: a tower, a wall, and two floating singles
    const spots: [number, number][] = [
      [-4.9, 2.33], [-4.9, 2.33 - BLOCK], [-4.9, 2.33 - 2 * BLOCK], // left tower
      [4.3, 2.33], [4.9, 2.33], [4.6, 2.33 - BLOCK], // right pyramid
      [-1.9, -1.6], [1.9, -1.65], // floaters near the pads
    ];
    for (const [x, y] of spots) this.addBlock(arena, x, y);
  }

  private addBlock(arena: Arena, x: number, y: number) {
    const body = arena.physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y));
    const col = RAPIER.ColliderDesc.cuboid(BLOCK / 2, BLOCK / 2)
      .setFriction(0.9)
      .setCollisionGroups(groups(CG.TERRAIN, CG.GOAT | CG.PROP));
    arena.physics.world.createCollider(col, body);

    const gfx = new Graphics();
    gfx.position.set(x, y);
    this.layer.addChild(gfx);

    const block: Block = {
      gfx,
      hits: 0,
      prop: {
        body,
        radius: BLOCK * 0.62,
        kind: "block",
        grabbable: true,
        kickable: true,
        alive: true,
        onKick: () => this.hitBlock(arena, block),
      },
    };
    this.drawBlock(block);
    arena.props.push(block.prop);
    this.blocks.push(block);
  }

  private drawBlock(b: Block) {
    const g = b.gfx;
    const h = BLOCK / 2;
    g.clear();
    g.rect(-h, -h, BLOCK, BLOCK).fill({ color: 0x8a6238 });
    g.rect(-h, -h, BLOCK, BLOCK * 0.28).fill({ color: 0x7ec850 });
    g.rect(-h, -h + BLOCK * 0.28, BLOCK, 0.03).fill({ color: 0x5f8f38 });
    g.rect(-h, -h, BLOCK, BLOCK).stroke({ width: 0.025, color: 0x3a2a18, alpha: 0.6 });
    // pixel noise
    for (let i = 0; i < 5; i++) {
      g.rect(-h + ((i * 37) % 50) / 100 * BLOCK, -h + BLOCK * 0.35 + ((i * 23) % 55) / 100 * BLOCK * 0.6, 0.06, 0.06)
        .fill({ color: 0x74532e, alpha: 0.7 });
    }
    if (b.hits > 0) {
      // cracks
      g.moveTo(-h * 0.5, -h * 0.6).lineTo(0, 0).lineTo(-h * 0.4, h * 0.7).stroke({ width: 0.028, color: 0x241a10, alpha: 0.85 });
      g.moveTo(0, 0).lineTo(h * 0.6, -h * 0.2).stroke({ width: 0.028, color: 0x241a10, alpha: 0.85 });
      g.moveTo(0, 0).lineTo(h * 0.5, h * 0.5).stroke({ width: 0.022, color: 0x241a10, alpha: 0.7 });
    }
  }

  private hitBlock(arena: Arena, b: Block) {
    if (!b.prop.alive) return;
    b.hits++;
    const p = b.prop.body.translation();
    if (b.hits >= 2) {
      b.prop.alive = false;
      for (const g of arena.goats) g.releaseIfGrabbing(b.prop.body, arena);
      arena.physics.world.removeRigidBody(b.prop.body);
      const pi = arena.props.indexOf(b.prop);
      if (pi >= 0) arena.props.splice(pi, 1);
      b.gfx.destroy();
      const bi = this.blocks.indexOf(b);
      if (bi >= 0) this.blocks.splice(bi, 1);
      arena.fx.burst("dust", { x: p.x, y: p.y }, { n: 14 });
      arena.fx.popText({ x: p.x, y: p.y - 0.5 }, "MINED!", 0xa8e878);
      arena.sfx.play("thud", { rate: 1.2 });
    } else {
      this.drawBlock(b);
      arena.fx.burst("dust", { x: p.x, y: p.y }, { n: 5 });
      arena.sfx.play("click", { rate: 0.7 });
    }
  }

  escalate(dt: number) {
    this.creepZones(dt);
  }

  destroy(arena: Arena) {
    this.blocks.length = 0;
    super.destroy(arena);
  }
}
