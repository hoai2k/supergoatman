import { Container, Graphics, Sprite } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { ARENA_RECT, CG, groups } from "../config";
import type { CamBounds } from "../core/Camera";
import type { Arena, Prop } from "../core/types";
import type { Vec2 } from "../core/math";
import type { Background } from "../render/Background";
import type { Goat } from "../entities/Goat";
import { arenaTexture, hazardTexture, type HazardKind } from "../render/assets";

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
  gfx: Container | null;
}

/** A live, editable axis-aligned solid (world coords; px derived on export). */
export interface EditRect {
  collider: RAPIER.Collider;
  body: RigidBody;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  oneWay: boolean;
  visible: boolean; // rendered in-scene as a board-themed block
  gfx: Graphics | null; // the rendering, when visible
  shell: boolean; // arena walls/ceiling — not part of the board's platforms
}

/** Paint a box in the board's terrain colours — the "visible" platform look. */
export function drawThemedBox(g: Graphics, x0: number, y0: number, x1: number, y1: number, theme: TerrainTheme) {
  g.clear();
  const w = x1 - x0;
  const h = y1 - y0;
  const band = Math.min(0.18, h * 0.38);
  const shade = Math.min(0.12, h * 0.22);
  g.rect(x0, y0, w, h).fill({ color: theme.face });
  g.rect(x0, y1 - shade, w, shade).fill({ color: theme.faceDark });
  g.rect(x0, y0, w, band).fill({ color: theme.top });
  g.rect(x0, y0, w, Math.min(0.05, band * 0.4)).fill({ color: theme.topLight });
  g.rect(x0, y0, w, h).stroke({ width: 0.035, color: theme.faceDark, alpha: 0.85 });
}

export interface HazardZone {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  label: string[];
  fx: string; // particle burst kind
  sfx: string;
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
  bounds: CamBounds = { ...ARENA_RECT };
  gravityScale = 1;
  /** Optional override for the goat speed cap (see Arena.speedCap). */
  speedCap?: number;

  protected solids: Solid[] = [];
  hazardZones: HazardZone[] = [];
  /** Debug: collider rects drawn when #dbgcol is in the URL. */
  debugRects: { x: number; y: number; w: number; h: number; lethal: boolean }[] = [];
  /** Every axis-aligned solid, in build order — the ?edit=bb editor's model. */
  editRects: EditRect[] = [];
  private buildingShell = false;

  abstract build(arena: Arena): void;
  // called once per rendered frame
  update(_dt: number, _arena: Arena): void {}
  // called once per fixed physics step
  fixedStep(_arena: Arena): void {}
  /** Kill goats that touched something lethal. Overrides should call super. */
  checkHazards(arena: Arena): void {
    this.checkHazardZones(arena);
  }
  // reset props/hazards between rounds
  reset(_arena: Arena): void {}
  // optional: add extra points the camera should try to keep in frame
  decorateCameraPoints?(points: Vec2[]): void;
  // optional: decorate a goat when it enters this board (scuba tank, hat...)
  onGoatSpawn?(goat: Goat, arena: Arena): void;

  spawnFor(i: number): Spawn {
    return this.spawns[i % this.spawns.length];
  }

  // ---- painted backdrop ----------------------------------------------------
  /** Place the arena painting so it exactly fills the world rect. */
  protected addBackdrop(boardId: string) {
    const tex = arenaTexture(boardId);
    const sp = new Sprite(tex);
    const w = this.bounds.maxX - this.bounds.minX;
    const h = this.bounds.maxY - this.bounds.minY;
    sp.width = w;
    sp.height = h;
    sp.position.set(this.bounds.minX, this.bounds.minY);
    this.root.addChildAt(sp, 0);
  }

  /** Convert arena-art pixel coords (1672x941) to world coords. */
  protected px(x: number, y: number): Vec2 {
    const w = this.bounds.maxX - this.bounds.minX;
    const h = this.bounds.maxY - this.bounds.minY;
    return {
      x: this.bounds.minX + (x / 1672) * w,
      y: this.bounds.minY + (y / 941) * h,
    };
  }

  // ---- terrain helpers ---------------------------------------------------
  /**
   * Static collider matched to painted scenery (invisible by default).
   * `oneWay`: brawler-style platform — solid from above, jump-through from
   * below. Only meaningful for slabs that HOVER over standable ground.
   * `visible`: also render the box as a block in the board's terrain colours
   * (for platforms that aren't part of the painted backdrop).
   */
  solidRect(
    arena: Arena,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    opts: {
      friction?: number;
      restitution?: number;
      icy?: boolean;
      bouncy?: boolean;
      oneWay?: boolean;
      visible?: boolean;
    } = {},
  ): Solid {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy);
    const body = arena.physics.world.createRigidBody(desc);
    const col = RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2)
      .setFriction(opts.friction ?? 0.95)
      .setRestitution(opts.restitution ?? 0.0)
      .setCollisionGroups(groups(CG.TERRAIN, CG.GOAT | CG.PROP));
    if (opts.icy) col.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
    if (opts.bouncy) col.setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max);
    const collider = arena.physics.world.createCollider(col, body);
    if (opts.oneWay) arena.physics.addOneWay(collider);
    let gfx: Graphics | null = null;
    if (opts.visible) {
      gfx = new Graphics();
      drawThemedBox(gfx, x0, y0, x1, y1, this.theme);
      this.root.addChild(gfx);
    }
    const solid = { body, gfx };
    this.solids.push(solid);
    this.debugRects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, lethal: false });
    this.editRects.push({
      collider,
      body,
      x0,
      y0,
      x1,
      y1,
      oneWay: !!opts.oneWay,
      visible: !!opts.visible,
      gfx,
      shell: this.buildingShell,
    });
    return solid;
  }

  /** Inverse of px(): world coords -> arena-art pixels (1672x941). */
  pxOf(x: number, y: number): Vec2 {
    const w = this.bounds.maxX - this.bounds.minX;
    const h = this.bounds.maxY - this.bounds.minY;
    return {
      x: ((x - this.bounds.minX) / w) * 1672,
      y: ((y - this.bounds.minY) / h) * 941,
    };
  }

  /** Static collider from arena-art pixel coords. */
  solidPxRect(
    arena: Arena,
    px0: number,
    py0: number,
    px1: number,
    py1: number,
    opts: {
      friction?: number;
      restitution?: number;
      icy?: boolean;
      bouncy?: boolean;
      oneWay?: boolean;
      visible?: boolean;
    } = {},
  ): Solid {
    const a = this.px(px0, py0);
    const b = this.px(px1, py1);
    return this.solidRect(arena, a.x, a.y, b.x, b.y, opts);
  }

  /** Lethal zone over a hazard that is already painted into the backdrop. */
  protected addKillZone(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    opts: { labels?: string[]; fx?: string; sfx?: string } = {},
  ) {
    this.hazardZones.push({
      minX: x0,
      minY: y0,
      maxX: x1,
      maxY: y1,
      label: opts.labels ?? ["SKEWERED", "POKED", "PERFORATED"],
      fx: opts.fx ?? "impact",
      sfx: opts.sfx ?? "thud",
    });
    this.debugRects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, lethal: true });
  }

  /** addKillZone in arena-art pixel coords. */
  protected addKillZonePx(
    px0: number,
    py0: number,
    px1: number,
    py1: number,
    opts: { labels?: string[]; fx?: string; sfx?: string } = {},
  ) {
    const a = this.px(px0, py0);
    const b = this.px(px1, py1);
    this.addKillZone(a.x, a.y, b.x, b.y, opts);
  }

  /**
   * Standard invisible walls + ceiling so nobody leaves the painting.
   * Wall faces overlap the arena bound by 0.05 (not recessed outside it):
   * terrain slabs end exactly at the bound, and any crack between a slab
   * end and a wall face is a goat trap — the opposing contact normals
   * deadlock the solver and the goat hangs wedged at the edge of the
   * screen. Overlapping static boxes cost nothing.
   */
  protected addArenaShell(arena: Arena) {
    this.buildingShell = true;
    this.solidRect(arena, this.bounds.minX - 1.2, this.bounds.minY - 2, this.bounds.minX + 0.05, this.bounds.maxY);
    this.solidRect(arena, this.bounds.maxX - 0.05, this.bounds.minY - 2, this.bounds.maxX + 1.2, this.bounds.maxY);
    this.solidRect(arena, this.bounds.minX - 1.2, this.bounds.minY - 1.4, this.bounds.maxX + 1.2, this.bounds.minY - 0.3);
    this.buildingShell = false;
  }

  solidBox(
    arena: Arena,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { angle?: number; friction?: number; theme?: TerrainTheme; invisible?: boolean } = {},
  ): Solid {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y).setRotation(opts.angle ?? 0);
    const body = arena.physics.world.createRigidBody(desc);
    const col = RAPIER.ColliderDesc.cuboid(w / 2, h / 2)
      .setFriction(opts.friction ?? 0.95)
      .setRestitution(0.0)
      .setCollisionGroups(groups(CG.TERRAIN, CG.GOAT | CG.PROP));
    arena.physics.world.createCollider(col, body);

    let g: Graphics | null = null;
    if (!opts.invisible) {
      g = new Graphics();
      paintPlatform(g, w, h, opts.theme ?? this.theme);
      g.position.set(x, y);
      g.rotation = opts.angle ?? 0;
      this.root.addChild(g);
    }
    this.debugRects.push({ x: x - w / 2, y: y - h / 2, w, h, lethal: false });
    const solid = { body, gfx: g };
    this.solids.push(solid);
    return solid;
  }

  fixedAnchor(arena: Arena, x: number, y: number): RigidBody {
    const desc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y);
    return arena.physics.world.createRigidBody(desc);
  }

  // ---- deadly edge obstacles ------------------------------------------------
  /**
   * Place a hazard sprite from the atlas and register its kill zone.
   * The sprite sits with its base at (x, baseY), `height` world units tall,
   * mirrored when `flip` is true.
   */
  protected addHazard(
    kind: HazardKind,
    x: number,
    baseY: number,
    height: number,
    opts: { flip?: boolean; labels?: string[]; fx?: string; sfx?: string; zonePad?: number } = {},
  ) {
    const tex = hazardTexture(kind);
    const sp = new Sprite(tex);
    const scale = height / 1.0; // atlas art is roughly square
    sp.anchor.set(0.5, 1);
    sp.width = height * 1.0;
    sp.height = height;
    if (opts.flip) sp.scale.x = -Math.abs(sp.scale.x);
    sp.position.set(x, baseY);
    this.root.addChild(sp);
    void scale;

    const pad = opts.zonePad ?? 0.18;
    const halfW = height * 0.5 - pad;
    this.hazardZones.push({
      minX: x - halfW,
      maxX: x + halfW,
      minY: baseY - height + pad * 1.6,
      maxY: baseY - 0.02,
      label: opts.labels ?? ["SKEWERED", "POKED", "PERFORATED"],
      fx: opts.fx ?? "impact",
      sfx: opts.sfx ?? "thud",
    });
    const z = this.hazardZones[this.hazardZones.length - 1];
    this.debugRects.push({ x: z.minX, y: z.minY, w: z.maxX - z.minX, h: z.maxY - z.minY, lethal: true });
  }

  /** Mirror-place the same hazard at both far edges of the arena. */
  protected addEdgeHazards(
    kind: HazardKind,
    baseY: number,
    height: number,
    inset = 0.55,
    opts: { labels?: string[]; fx?: string; sfx?: string } = {},
  ) {
    this.addHazard(kind, this.bounds.minX + inset + height * 0.28, baseY, height, { ...opts });
    this.addHazard(kind, this.bounds.maxX - inset - height * 0.28, baseY, height, {
      ...opts,
      flip: true,
    });
  }

  protected checkHazardZones(arena: Arena) {
    for (const goat of arena.goats) {
      if (goat.dead || goat.eliminated || goat.invulnT > 0) continue;
      const p = goat.pos;
      // universal backstop: nobody gets to live in a crack below the arena
      if (p.y > this.bounds.maxY + 1.3) {
        arena.fx.burst("dust", p, { n: 8 });
        arena.killGoat(goat, pick(["LOST", "OUT OF BOUNDS", "GONE SPELUNKING"]));
        continue;
      }
      // ...and nobody gets to orbit the map after a physics tantrum — a
      // degenerate joint can catapult a body out in a single solver step
      if (p.y < this.bounds.minY - 16 || p.x < this.bounds.minX - 16 || p.x > this.bounds.maxX + 16) {
        arena.killGoat(goat, pick(["LEFT ORBIT", "ESCAPED THE MAP", "YEETED INTO SPACE"]));
        continue;
      }
      const r = goat.radius * 0.55; // forgiving: need real contact, not a graze
      for (const z of this.hazardZones) {
        if (p.x + r > z.minX && p.x - r < z.maxX && p.y + r > z.minY && p.y - r < z.maxY) {
          arena.fx.burst(z.fx, p, { n: 14 });
          arena.sfx.play(z.sfx);
          arena.killGoat(goat, pick(z.label));
          break;
        }
      }
    }
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

function pick<T>(a: T[]): T {
  return a[(Math.random() * a.length) | 0];
}

export function paintPlatform(g: Graphics, w: number, h: number, th: TerrainTheme) {
  const hw = w / 2;
  const hh = h / 2;
  const r = Math.min(0.2, hh * 0.7, hw * 0.7);
  g.roundRect(-hw, -hh + 0.06, w, h, r).fill({ color: th.faceDark });
  g.roundRect(-hw, -hh, w, h - 0.04, r).fill({ color: th.face });
  const cap = Math.min(0.24, h * 0.55);
  g.roundRect(-hw, -hh, w, cap, r).fill({ color: th.top });
  g.roundRect(-hw + 0.08, -hh + 0.03, w - 0.16, 0.05, 0.025).fill({ color: th.topLight });
  if (th.grass) {
    for (let gx = -hw + 0.35; gx < hw - 0.2; gx += 0.7) {
      g.moveTo(gx, -hh + 0.02);
      g.lineTo(gx - 0.06, -hh - 0.12);
      g.lineTo(gx + 0.02, -hh + 0.02);
      g.fill({ color: th.topLight });
    }
  }
}
