import { Container, Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { CG, groups } from "../config";
import type { CamBounds } from "../core/Camera";
import type { Arena, Prop } from "../core/types";
import type { Vec2 } from "../core/math";
import type { Background } from "../render/Background";
import type { Goat } from "../entities/Goat";

export interface TerrainTheme {
  top: number;
  topLight: number;
  face: number;
  faceDark: number;
  grass?: boolean;
}

export interface Spawn {
  pos: Vec2;
  angle: number;
}

export interface Solid {
  body: RigidBody;
  gfx: Container;
}

/** Base class for a battle board: terrain, props, hazards, win-flavoured logic. */
export abstract class Board {
  abstract readonly name: string;
  abstract readonly blurb: string;
  abstract readonly tip: string;
  abstract theme: TerrainTheme;

  root = new Container(); // world-space terrain + props
  bg!: Background; // assigned by the Match before build()
  spawns: Spawn[] = [];
  bounds: CamBounds = { minX: -20, maxX: 20, minY: -14, maxY: 12 };
  gravityScale = 1;

  protected solids: Solid[] = [];

  abstract build(arena: Arena): void;
  // called once per rendered frame
  update(_dt: number, _arena: Arena): void {}
  // called once per fixed physics step
  fixedStep(_arena: Arena): void {}
  // eliminate goats that touched something lethal; return killed goats
  checkHazards(_arena: Arena): void {}
  // reset props/hazards between rounds
  reset(_arena: Arena): void {}
  // optional: escalate during sudden death (raise lava, shrink stage...)
  escalate?(dt: number, arena: Arena): void;
  // optional: add extra points the camera should try to keep in frame
  decorateCameraPoints?(points: Vec2[]): void;
  // optional: decorate a goat when it enters this board (scuba tank, hat...)
  onGoatSpawn?(goat: Goat, arena: Arena): void;

  spawnFor(i: number): Spawn {
    return this.spawns[i % this.spawns.length];
  }

  // ---- terrain helpers ---------------------------------------------------
  solidBox(
    arena: Arena,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { angle?: number; friction?: number; theme?: TerrainTheme } = {},
  ): Solid {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y).setRotation(opts.angle ?? 0);
    const body = arena.physics.world.createRigidBody(desc);
    const col = RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
      .setFriction(opts.friction ?? 0.95)
      .setRestitution(0.0)
      .setCollisionGroups(groups(CG.TERRAIN, CG.GOAT | CG.PROP));
    arena.physics.world.createCollider(col, body);

    const g = new Graphics();
    paintPlatform(g, w, h, opts.theme ?? this.theme);
    g.position.set(x, y);
    g.rotation = opts.angle ?? 0;
    this.root.addChild(g);
    const solid = { body, gfx: g };
    this.solids.push(solid);
    return solid;
  }

  ramp(arena: Arena, x: number, y: number, w: number, h: number, angle: number): Solid {
    return this.solidBox(arena, x, y, w, h, { angle });
  }

  fixedAnchor(arena: Arena, x: number, y: number): RigidBody {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y);
    return arena.physics.world.createRigidBody(desc);
  }

  removeProp(arena: Arena, prop: Prop) {
    prop.alive = false;
    arena.physics.world.removeRigidBody(prop.body);
    const idx = arena.props.indexOf(prop);
    if (idx >= 0) arena.props.splice(idx, 1);
  }

  destroy(arena: Arena) {
    for (const s of this.solids) arena.physics.world.removeRigidBody(s.body);
    for (const p of [...arena.props]) {
      if (p.alive) arena.physics.world.removeRigidBody(p.body);
    }
    arena.props.length = 0;
    this.root.destroy({ children: true });
  }
}

export function paintPlatform(g: Graphics, w: number, h: number, th: TerrainTheme) {
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(0.2, hh * 0.7, hw * 0.7);
  // drop shadow / underside
  g.roundRect(-hw, -hh + 0.06, w, h, r).fill({ color: th.faceDark });
  // main face
  g.roundRect(-hw, -hh, w, h - 0.04, r).fill({ color: th.face });
  // top cap
  const cap = Math.min(0.24, h * 0.55);
  g.roundRect(-hw, -hh, w, cap, r).fill({ color: th.top });
  // top highlight
  g.roundRect(-hw + 0.08, -hh + 0.03, w - 0.16, 0.05, 0.025).fill({ color: th.topLight });
  // grass tufts
  if (th.grass) {
    for (let gx = -hw + 0.35; gx < hw - 0.2; gx += 0.7) {
      g.moveTo(gx, -hh + 0.02);
      g.lineTo(gx - 0.06, -hh - 0.12);
      g.lineTo(gx + 0.02, -hh + 0.02);
      g.fill({ color: th.topLight });
    }
  }
}
