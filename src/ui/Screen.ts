import type { Container } from "pixi.js";

export interface Screen {
  container: Container;
  enter(): void;
  exit(): void;
  update(dt: number): void;
  resize(w: number, h: number): void;
}
