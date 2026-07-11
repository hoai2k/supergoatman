import { Container } from "pixi.js";
import { PPU } from "../config";
import { clamp, damp, type Vec2 } from "./math";

export interface CamBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Shared party-cam: frames every live goat, zooming to keep them all on screen. */
export class Camera {
  center: Vec2 = { x: 0, y: 0 };
  zoom = 0.7;
  private targetCenter: Vec2 = { x: 0, y: 0 };
  private targetZoom = 0.7;
  minZoom = 0.42;
  maxZoom = 2.7; // close-ups when the brawl bunches up
  bounds: CamBounds | null = null;
  /** If set, zoom never goes low enough to show outside this rect. */
  viewRect: CamBounds | null = null;
  private trauma = 0;
  private shakeT = 0;

  vw = 1280;
  vh = 720;

  resize(w: number, h: number) {
    this.vw = w;
    this.vh = h;
  }

  addTrauma(amount: number) {
    this.trauma = clamp(this.trauma + amount / 100, 0, 1);
  }

  frame(points: Vec2[], padding = 1.7) {
    if (points.length === 0) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    const spanX = Math.max(0.1, maxX - minX);
    const spanY = Math.max(0.1, maxY - minY);
    const zx = this.vw / (spanX * PPU);
    const zy = this.vh / (spanY * PPU);
    let lo = this.minZoom;
    if (this.viewRect) {
      const vr = this.viewRect;
      lo = Math.max(
        lo,
        this.vw / ((vr.maxX - vr.minX) * PPU),
        this.vh / ((vr.maxY - vr.minY) * PPU),
      );
    }
    this.targetZoom = clamp(Math.min(zx, zy), lo, this.maxZoom);
    this.targetCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

    if (this.bounds) this.clampToBounds();
  }

  private clampToBounds() {
    const b = this.bounds!;
    const halfW = this.vw / (2 * PPU * this.targetZoom);
    const halfH = this.vh / (2 * PPU * this.targetZoom);
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    this.targetCenter.x =
      bw < halfW * 2 ? (b.minX + b.maxX) / 2 : clamp(this.targetCenter.x, b.minX + halfW, b.maxX - halfW);
    this.targetCenter.y =
      bh < halfH * 2 ? (b.minY + b.maxY) / 2 : clamp(this.targetCenter.y, b.minY + halfH, b.maxY - halfH);
  }

  update(dt: number) {
    this.zoom = damp(this.zoom, this.targetZoom, 0.0009, dt);
    this.center.x = damp(this.center.x, this.targetCenter.x, 0.0009, dt);
    this.center.y = damp(this.center.y, this.targetCenter.y, 0.0009, dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.shakeT += dt * 40;
  }

  private shakeOffset(): Vec2 {
    const s = this.trauma * this.trauma;
    if (s <= 0) return { x: 0, y: 0 };
    const mag = s * 26;
    return {
      x: Math.sin(this.shakeT * 1.3) * mag * (Math.random() * 0.5 + 0.5),
      y: Math.cos(this.shakeT * 1.7) * mag * (Math.random() * 0.5 + 0.5),
    };
  }

  /** Apply the transform to the world container (world units -> screen px). */
  apply(world: Container) {
    const s = PPU * this.zoom;
    world.scale.set(s);
    const off = this.shakeOffset();
    world.position.set(
      this.vw / 2 - this.center.x * s + off.x,
      this.vh / 2 - this.center.y * s + off.y,
    );
  }

  worldToScreen(p: Vec2): Vec2 {
    const s = PPU * this.zoom;
    return { x: this.vw / 2 - this.center.x * s + p.x * s, y: this.vh / 2 - this.center.y * s + p.y * s };
  }
  get pixelZoom(): number {
    return PPU * this.zoom;
  }
}
