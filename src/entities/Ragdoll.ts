import { Container, Sprite } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { RigidBody } from "../core/rapier";
import { CG, groups } from "../config";
import { rotate, type Vec2 } from "../core/math";
import type { Arena } from "../core/types";
import type { GoatSkin } from "../render/GoatSprites";
import { cellPxToLocal, PX2U, RAGDOLL_JOINTS } from "../render/goatgeom";

interface Piece {
  name: string;
  body: RigidBody;
  sprite: Sprite;
}

const LIFETIME = 3.2;
const FADE_AT = 2.2;

/**
 * A goat that has stopped being a goat. Built by cutting the SAME neutral
 * sprite the live goat was drawn with into head/torso/legs, so at the moment
 * of the swap every part lines up pixel-perfect with where the body was.
 */
export class Ragdoll {
  private pieces: Piece[] = [];
  private life = 0;
  alive = true;

  constructor(
    arena: Arena,
    skin: GoatSkin,
    origin: Vec2,
    angle: number,
    linvel: Vec2,
    angvel: number,
    private layer: Container,
    impulse?: Vec2,
  ) {
    const world = arena.physics.world;
    const byName = new Map<string, Piece>();

    for (const part of skin.parts) {
      const r = part.def.rect;
      // part centre in goat-local units, then world
      const centerLocal = cellPxToLocal(r.x + r.w / 2, r.y + r.h / 2);
      const off = rotate(centerLocal, angle);
      const px = origin.x + off.x;
      const py = origin.y + off.y;

      const desc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(px, py)
        .setRotation(angle)
        .setLinearDamping(0.3)
        .setAngularDamping(0.9)
        .setCcdEnabled(true);
      const body = world.createRigidBody(desc);
      const col = RAPIER.ColliderDesc.ball(part.def.radius)
        .setDensity(0.7)
        .setFriction(0.8)
        .setRestitution(0.25)
        .setCollisionGroups(groups(CG.PROP, CG.TERRAIN | CG.GOAT | CG.PROP));
      world.createCollider(col, body);

      // velocity of this part = body linvel + spin contribution + scatter
      const spin = { x: -off.y * angvel, y: off.x * angvel };
      body.setLinvel(
        new RAPIER.Vector2(
          linvel.x + spin.x + (Math.random() - 0.5) * 1.6 + (impulse?.x ?? 0),
          linvel.y + spin.y + (Math.random() - 0.5) * 1.6 + (impulse?.y ?? 0),
        ),
        true,
      );
      body.setAngvel(angvel + (Math.random() - 0.5) * 10, true);

      const sprite = new Sprite(part.tex);
      sprite.anchor.set(0.5);
      sprite.scale.set(PX2U);
      layer.addChild(sprite);

      const piece = { name: part.def.name, body, sprite };
      this.pieces.push(piece);
      byName.set(part.def.name, piece);
    }

    // loose revolute joints so limbs flail but stay attached
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
  }

  /** Returns false once fully expired (caller then calls destroy). */
  update(dt: number): boolean {
    this.life += dt;
    const alpha = this.life > FADE_AT ? Math.max(0, 1 - (this.life - FADE_AT) / (LIFETIME - FADE_AT)) : 1;
    for (const p of this.pieces) {
      const t = p.body.translation();
      p.sprite.position.set(t.x, t.y);
      p.sprite.rotation = p.body.rotation();
      p.sprite.alpha = alpha;
    }
    if (this.life >= LIFETIME) this.alive = false;
    return this.alive;
  }

  destroy(arena: Arena) {
    for (const p of this.pieces) {
      arena.physics.world.removeRigidBody(p.body);
      p.sprite.destroy();
    }
    this.pieces.length = 0;
  }
}
