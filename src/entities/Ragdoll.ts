import { Container, Mesh, MeshGeometry, Texture } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { CG, groups } from "../config";
import { rotate, type Vec2 } from "../core/math";
import type { Arena } from "../core/types";
import type { GoatSkin } from "../render/GoatSprites";
import {
  CELL,
  NEUTRAL_BBOX,
  cellPxToLocal,
  RAGDOLL_JOINTS,
  RAGDOLL_PARTS,
} from "../render/goatgeom";

interface Bone {
  name: string;
  body: RigidBody;
  rect: { x: number; y: number; w: number; h: number };
}

// ragdolls get three seconds to collapse in a heap, then vanish in a puff
// of smoke; the replacement goat arrives a beat later (no ghostly overlap)
const LIFETIME = 3.0;

// skinning mesh resolution (quads across the sprite's content bbox)
const GRID_X = 12;
const GRID_Y = 10;
// weight falloff: softens the 1/d² blend so joints bend over a region
// instead of creasing along the part-rect borders
const FALLOFF_PX = 14;

/**
 * A goat that has stopped being a goat. The physics is a jointed skeleton
 * (head/torso/legs as bodies with limited revolute joints), but the render
 * is the SAME single neutral sprite the live goat was drawn with, skinned
 * to the skeleton: a grid mesh whose vertices blend between the bones, so
 * the body bends at the neck and hips instead of splitting into pieces.
 * At the moment of the swap the bind pose reproduces the live sprite
 * pixel-perfect.
 */
export class Ragdoll {
  private bones: Bone[] = [];
  private mesh: Mesh;
  // per-vertex skinning data, flat: [w0..w3, ox0,oy0 .. ox3,oy3] per vertex
  private weights: Float32Array;
  private boneOffsets: Float32Array;
  private vertCount: number;
  private life = 0;
  alive = true;

  constructor(
    arena: Arena,
    skin: GoatSkin,
    origin: Vec2,
    angle: number,
    linvel: Vec2,
    angvel: number,
    layer: Container,
    impulse?: Vec2,
  ) {
    const world = arena.physics.world;
    const byName = new Map<string, Bone>();

    for (const part of RAGDOLL_PARTS) {
      const r = part.rect;
      // part centre in goat-local units, then world
      const centerLocal = cellPxToLocal(r.x + r.w / 2, r.y + r.h / 2);
      const off = rotate(centerLocal, angle);
      const px = origin.x + off.x;
      const py = origin.y + off.y;

      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(px, py)
        .setRotation(angle)
        .setLinearDamping(0.3)
        .setAngularDamping(0.8)
        .setCcdEnabled(true);
      const body = world.createRigidBody(desc);
      const col = RAPIER.ColliderDesc.ball(part.radius)
        .setDensity(0.7)
        .setFriction(0.9)
        .setRestitution(0.08)
        .setCollisionGroups(groups(CG.PROP, CG.TERRAIN | CG.GOAT | CG.PROP));
      world.createCollider(col, body);

      // velocity of this part = body linvel + spin contribution + a whisper of
      // scatter — the body should flop as one piece, not detonate
      const spin = { x: -off.y * angvel, y: off.x * angvel };
      body.setLinvel(
        new RAPIER.Vector2(
          linvel.x + spin.x + (Math.random() - 0.5) * 0.5 + (impulse?.x ?? 0),
          linvel.y + spin.y + (Math.random() - 0.5) * 0.5 + (impulse?.y ?? 0),
        ),
        true,
      );
      body.setAngvel(angvel + (Math.random() - 0.5) * 2.5, true);

      const bone = { name: part.name, body, rect: r };
      this.bones.push(bone);
      byName.set(part.name, bone);
    }

    // free revolute joints: the skinned mesh keeps the body reading as one
    // goat, so limbs can swing loose and the whole thing collapses in a heap
    for (const [aName, bName, jx, jy] of RAGDOLL_JOINTS) {
      const a = byName.get(aName);
      const b = byName.get(bName);
      if (!a || !b) continue;
      const jLocal = cellPxToLocal(jx, jy);
      const aPos = a.body.translation();
      const bPos = b.body.translation();
      const jWorld = { x: origin.x, y: origin.y };
      const jOff = rotate(jLocal, angle);
      jWorld.x += jOff.x;
      jWorld.y += jOff.y;
      const a1 = rotate({ x: jWorld.x - aPos.x, y: jWorld.y - aPos.y }, -angle);
      const a2 = rotate({ x: jWorld.x - bPos.x, y: jWorld.y - bPos.y }, -angle);
      const jd = RAPIER.JointData.revolute(
        new RAPIER.Vector2(a1.x, a1.y),
        new RAPIER.Vector2(a2.x, a2.y),
      );
      world.createImpulseJoint(jd, a.body, b.body, true);
    }

    // ---- skinned mesh over the whole neutral sprite -----------------------
    // grid spans the content bbox (plus margin for antialiased fringes)
    const pad = 24;
    const bx0 = Math.max(0, NEUTRAL_BBOX.x0 - pad);
    const by0 = Math.max(0, NEUTRAL_BBOX.y0 - pad);
    const bx1 = Math.min(CELL, NEUTRAL_BBOX.x1 + pad);
    const by1 = Math.min(CELL, NEUTRAL_BBOX.y1 + pad);

    const cols = GRID_X + 1;
    const rows = GRID_Y + 1;
    this.vertCount = cols * rows;
    const positions = new Float32Array(this.vertCount * 2);
    const uvs = new Float32Array(this.vertCount * 2);
    this.weights = new Float32Array(this.vertCount * 4);
    this.boneOffsets = new Float32Array(this.vertCount * 8);

    // the skin sheet is [neutral | kick] side by side; UV against the whole
    // source, using the neutral frame's placement within it
    const src = skin.neutral.tex.source;
    const fr = skin.neutral.tex.frame;

    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        const v = iy * cols + ix;
        const px = bx0 + ((bx1 - bx0) * ix) / GRID_X;
        const py = by0 + ((by1 - by0) * iy) / GRID_Y;
        uvs[v * 2] = (fr.x + px) / src.width;
        uvs[v * 2 + 1] = (fr.y + py) / src.height;

        // bone weights: inverse-square distance to each part's crop rect,
        // so vertices deep inside a part follow it rigidly and vertices in
        // the overlap zones (the joints) blend smoothly between bones
        const local = cellPxToLocal(px, py);
        let total = 0;
        for (let b = 0; b < this.bones.length; b++) {
          const r = this.bones[b].rect;
          const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
          const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
          const d = Math.hypot(dx, dy);
          const w = 1 / ((d + FALLOFF_PX) * (d + FALLOFF_PX));
          this.weights[v * 4 + b] = w;
          total += w;

          // rest offset from the bone's centre, in goat-local units — the
          // bone's rotation maps this back to world space every frame
          const c = cellPxToLocal(r.x + r.w / 2, r.y + r.h / 2);
          this.boneOffsets[v * 8 + b * 2] = local.x - c.x;
          this.boneOffsets[v * 8 + b * 2 + 1] = local.y - c.y;
        }
        for (let b = 0; b < 4; b++) this.weights[v * 4 + b] /= total;
      }
    }

    const indices = new Uint32Array(GRID_X * GRID_Y * 6);
    let k = 0;
    for (let iy = 0; iy < GRID_Y; iy++) {
      for (let ix = 0; ix < GRID_X; ix++) {
        const a = iy * cols + ix;
        indices[k++] = a;
        indices[k++] = a + 1;
        indices[k++] = a + cols;
        indices[k++] = a + 1;
        indices[k++] = a + cols + 1;
        indices[k++] = a + cols;
      }
    }

    const geometry = new MeshGeometry({ positions, uvs, indices });
    this.mesh = new Mesh({ geometry, texture: new Texture({ source: src }) });
    layer.addChild(this.mesh);
    this.skinVertices(); // bind pose = exactly where the live sprite was
  }

  /** Linear blend skinning: vertex world pos = Σ wᵢ · boneᵢ(rest offset). */
  private skinVertices() {
    const n = this.bones.length;
    const t: { x: number; y: number; cos: number; sin: number }[] = [];
    for (const b of this.bones) {
      const p = b.body.translation();
      const r = b.body.rotation();
      t.push({ x: p.x, y: p.y, cos: Math.cos(r), sin: Math.sin(r) });
    }
    const buf = this.mesh.geometry.getBuffer("aPosition");
    const pos = buf.data as Float32Array;
    for (let v = 0; v < this.vertCount; v++) {
      let x = 0;
      let y = 0;
      for (let b = 0; b < n; b++) {
        const w = this.weights[v * 4 + b];
        if (w < 0.001) continue;
        const ox = this.boneOffsets[v * 8 + b * 2];
        const oy = this.boneOffsets[v * 8 + b * 2 + 1];
        const m = t[b];
        x += w * (m.x + m.cos * ox - m.sin * oy);
        y += w * (m.y + m.sin * ox + m.cos * oy);
      }
      pos[v * 2] = x;
      pos[v * 2 + 1] = y;
    }
    buf.update();
  }

  /** Returns false once fully expired (caller then calls destroy). */
  update(dt: number, arena: Arena): boolean {
    this.life += dt;
    this.skinVertices();
    if (this.life >= LIFETIME && this.alive) {
      // the big send-off: one puff of smoke and the body is simply gone
      let cx = 0;
      let cy = 0;
      for (const b of this.bones) {
        const t = b.body.translation();
        cx += t.x / this.bones.length;
        cy += t.y / this.bones.length;
      }
      arena.fx.burst("dust", { x: cx, y: cy }, { n: 26 });
      arena.fx.ring({ x: cx, y: cy }, 0xdddddd, 1.1);
      arena.sfx.play("pop", { rate: 0.6, volume: 0.7 });
      this.alive = false;
    }
    return this.alive;
  }

  destroy(arena: Arena) {
    for (const b of this.bones) {
      arena.physics.world.removeRigidBody(b.body);
    }
    this.bones.length = 0;
    this.mesh.destroy();
  }
}
