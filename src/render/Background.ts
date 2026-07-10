import { Container, Sprite, Texture } from "pixi.js";
import { PPU } from "../config";
import type { Camera } from "../core/Camera";

/** Backmost full-screen gradient + a stack of parallax world-space layers. */
export class Background {
  root = new Container();
  private grad: Sprite;
  private gradStops: [number, string][] = [];
  private layers: { node: Container; factor: number }[] = [];

  constructor() {
    this.grad = new Sprite(Texture.WHITE);
    this.root.addChild(this.grad);
  }

  setGradient(stops: [number, string][]) {
    this.gradStops = stops;
    this.rebuildGradient(this.grad.width || 1280, this.grad.height || 720);
  }

  private rebuildGradient(w: number, h: number) {
    const cv = document.createElement("canvas");
    cv.width = 16;
    cv.height = Math.max(2, Math.floor(h));
    const ctx = cv.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, cv.height);
    for (const [stop, color] of this.gradStops) g.addColorStop(stop, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cv.width, cv.height);
    this.grad.texture = Texture.from(cv);
    this.grad.width = w;
    this.grad.height = h;
  }

  addLayer(factor: number): Container {
    const c = new Container();
    this.layers.push({ node: c, factor });
    this.root.addChild(c);
    return c;
  }

  resize(w: number, h: number) {
    this.rebuildGradient(w, h);
  }

  update(cam: Camera) {
    const pz = cam.pixelZoom;
    for (const l of this.layers) {
      l.node.scale.set(pz);
      l.node.position.set(
        cam.vw / 2 - cam.center.x * pz * l.factor,
        cam.vh / 2 - cam.center.y * pz * l.factor,
      );
    }
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}

// Handy helper to keep the world container math consistent with PPU.
export const worldPx = (u: number) => u * PPU;
