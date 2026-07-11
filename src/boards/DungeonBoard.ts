import { Container, Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { Board, type TerrainTheme } from "./Board";
import { CG, groups } from "../config";
import type { Arena, Prop } from "../core/types";
import { makeRng } from "../core/math";

const THEME: TerrainTheme = { top: 0x6b625a, topLight: 0x8a7f74, face: 0x413a34, faceDark: 0x2a2521 };

interface ChainLink {
  body: RigidBody;
  prop: Prop;
  gfx: Graphics;
}

export class DungeonBoard extends Board {
  readonly name = "The Goatacombs";
  readonly blurb = "Somebody built a dungeon with excellent grab-height chains. Convenient. Suspicious, but convenient.";
  readonly tip = "GRAB the hanging chains and swing — a full swing plus a well-timed kick clears the whole hall. The spike pits do not offer a second opinion.";
  theme = THEME;
  gravityScale = 1;

  private links: ChainLink[] = [];
  private layer = new Container();
  private t = 0;
  private rng = makeRng(66);

  build(arena: Arena) {
    this.bg.setGradient([
      [0, "#141014"],
      [1, "#2a1d18"],
    ]);
    this.addBackdrop("dungeon");
    this.addArenaShell(arena);
    this.root.addChild(this.layer);

    // stonework matched to the painting
    this.solidPxRect(arena, 285, 712, 1385, 830); // main hall floor
    // the raised ledges hover over the hall — jump up through them
    this.solidPxRect(arena, 225, 545, 510, 589, { oneWay: true }); // left ledge
    this.solidPxRect(arena, 1165, 540, 1450, 584, { oneWay: true }); // right ledge
    this.solidPxRect(arena, 0, 60, 90, 941); // outer walls
    this.solidPxRect(arena, 1580, 60, 1672, 941);
    // pit floors beneath the spikes (so the corpses have somewhere to land)
    this.solidRect(arena, this.bounds.minX, 6.1, this.bounds.maxX, 6.75);

    // painted spike pits flanking the hall
    this.addKillZonePx(30, 680, 285, 890, { labels: ["IMPALED", "DUNGEON'D", "POKED HOLES"], fx: "ember", sfx: "thud" });
    this.addKillZonePx(1385, 680, 1645, 890, { labels: ["IMPALED", "DUNGEON'D", "POKED HOLES"], fx: "ember", sfx: "thud" });

    this.spawns = [
      { pos: { x: -5.6, y: 0.4 }, angle: 0 },
      { pos: { x: 5.7, y: 0.4 }, angle: 0 },
      { pos: { x: -1.8, y: 2.6 }, angle: 0 },
      { pos: { x: 1.8, y: 2.6 }, angle: 0 },
    ];

    // three swinging chains: over each ledge, and a long one over centre hall.
    // Ends dangle ~1u above the stone so a hop reaches them.
    this.buildChain(arena, -7.2, -5.1, 12);
    this.buildChain(arena, 7.3, -5.1, 12);
    this.buildChain(arena, 0, -6.4, 17);
  }

  private buildChain(arena: Arena, x: number, topY: number, linkCount: number) {
    const linkLen = 0.42;
    const anchor = this.fixedAnchor(arena, x, topY);
    let prev: RigidBody = anchor;
    for (let i = 0; i < linkCount; i++) {
      const y = topY + linkLen * (i + 0.5);
      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y)
        .setLinearDamping(0.5)
        .setAngularDamping(0.8);
      const body = arena.physics.world.createRigidBody(desc);
      const col = RAPIER.ColliderDesc.capsule(linkLen * 0.42, 0.055)
        .setDensity(2.4)
        .setFriction(0.7)
        .setCollisionGroups(groups(CG.PROP, CG.TERRAIN)); // swings through goats; you interact by grabbing
      arena.physics.world.createCollider(col, body);

      const a1 = prev === anchor ? { x: 0, y: 0 } : { x: 0, y: linkLen / 2 };
      const jd = RAPIER.JointData.revolute(
        new RAPIER.Vector2(a1.x, a1.y),
        new RAPIER.Vector2(0, -linkLen / 2),
      );
      arena.physics.world.createImpulseJoint(jd, prev, body, true);

      const gfx = new Graphics();
      const isEnd = i === linkCount - 1;
      gfx.roundRect(-0.09, -linkLen / 2, 0.18, linkLen, 0.085).stroke({ width: 0.06, color: 0x9a9184 });
      gfx.roundRect(-0.05, -linkLen / 2 + 0.06, 0.1, linkLen - 0.12, 0.05).stroke({ width: 0.03, color: 0x6a6258, alpha: 0.8 });
      if (isEnd) {
        // a meaty hook at the end — the good grab spot
        gfx.circle(0, linkLen / 2 + 0.11, 0.16).stroke({ width: 0.07, color: 0xb8a878 });
      }
      this.layer.addChild(gfx);

      const link: ChainLink = {
        body,
        gfx,
        prop: {
          body,
          radius: 0.2,
          kind: "chain",
          grabbable: true,
          kickable: true,
          alive: true,
          onKick: (dir) => body.applyImpulse({ x: dir.x * 0.5, y: dir.y * 0.5 }, true),
        },
      };
      arena.props.push(link.prop);
      this.links.push(link);
      prev = body;
    }
  }

  update(dt: number, arena: Arena) {
    this.t += dt;
    for (const l of this.links) {
      const t = l.body.translation();
      l.gfx.position.set(t.x, t.y);
      l.gfx.rotation = l.body.rotation();
    }
    // torch embers at the painted sconces
    if (this.rng() < dt * 6) {
      const sconce = this.rng() < 0.5 ? { x: -3.37, y: -0.15 } : { x: 3.9, y: -0.15 };
      arena.fx.burst("ember", sconce, { n: 1 });
    }
  }

  escalate(dt: number) {
    this.creepZones(dt);
  }

  destroy(arena: Arena) {
    this.links.length = 0;
    super.destroy(arena);
  }
}
