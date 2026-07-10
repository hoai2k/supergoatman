import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Screen } from "./Screen";
import type { Game } from "../core/Game";
import { mkText, COL, buttonGlyph } from "./theme";
import { renderGoat, ANCHOR } from "../render/GoatArt";
import { PALETTES } from "../config";
import { makeRng, randRange } from "../core/math";

interface FloatGoat {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  spin: number;
  bob: number;
  phase: number;
}

export class TitleScreen implements Screen {
  container = new Container();
  private bg = new Graphics();
  private blobs = new Graphics();
  private logo = new Container();
  private hint = new Container();
  private goats: FloatGoat[] = [];
  private rng = makeRng(42);
  private t = 0;

  constructor(private game: Game) {
    this.container.addChild(this.bg, this.blobs);
    for (let i = 0; i < 4; i++) {
      const pal = PALETTES[i * 2];
      const tex = Texture.from(renderGoat(pal, 0.2, 0.1));
      const s = new Sprite(tex);
      s.anchor.set(ANCHOR.x, ANCHOR.y);
      s.scale.set(0.9);
      this.container.addChild(s);
      this.goats.push({ sprite: s, x: 0, y: 0, vx: randRange(this.rng, -30, 30), spin: randRange(this.rng, -0.6, 0.6), bob: randRange(this.rng, 12, 30), phase: randRange(this.rng, 0, 6.3) });
    }
    this.buildLogo();
    this.container.addChild(this.logo, this.hint);
  }

  private buildLogo() {
    const superT = mkText("SUPER", { size: 54, weight: "900", fill: COL.accent, stroke: COL.ink, strokeW: 9, letterSpacing: 8 });
    superT.position.set(0, -96);
    const goatT = mkText("GOAT", { size: 168, weight: "900", fill: 0xff5fa2, stroke: COL.ink, strokeW: 16 });
    goatT.position.set(0, 0);
    const manT = mkText("MAN", { size: 88, weight: "900", fill: COL.cream, stroke: COL.ink, strokeW: 12, letterSpacing: 12 });
    manT.position.set(0, 108);
    const tag = mkText("a local-multiplayer headbutt-'em-up", { size: 26, weight: "700", fill: COL.cream, stroke: COL.ink, strokeW: 5 });
    tag.position.set(0, 176);
    tag.alpha = 0.92;
    this.logo.addChild(superT, goatT, manT, tag);
  }

  private buildHint(w: number) {
    this.hint.removeChildren();
    const a = buttonGlyph("A", COL.good, 18);
    a.position.set(-96, 0);
    const t = mkText("Press  Ⓐ  or  Space  to play", { size: 30, weight: "800", fill: COL.cream, stroke: COL.ink, strokeW: 6 });
    const sub = mkText("controllers strongly encouraged  •  2–4 players", { size: 20, weight: "700", fill: COL.dim });
    sub.position.set(0, 40);
    this.hint.addChild(t, sub);
    void w;
  }

  enter() {
    this.game.audio.play("blip");
  }
  exit() {}

  update(dt: number) {
    this.t += dt;
    // any input starts the party
    const nav = this.anyConfirm();
    if (nav) {
      this.game.audio.resume();
      this.game.audio.play("go");
      this.game.toLobby();
      return;
    }
    // animate floaters
    for (const g of this.goats) {
      g.x += g.vx * dt;
      g.phase += dt;
      if (g.x < -80) g.x = this.game.vw + 80;
      if (g.x > this.game.vw + 80) g.x = -80;
      g.sprite.position.set(g.x, g.y + Math.sin(g.phase) * g.bob);
      g.sprite.rotation = Math.sin(g.phase * 0.7) * 0.35;
    }
    this.logo.scale.set(1 + Math.sin(this.t * 1.6) * 0.015);
    this.hint.alpha = 0.6 + 0.4 * Math.sin(this.t * 3);
  }

  private anyConfirm(): boolean {
    for (const s of [{ kind: "keyboard", scheme: 0 } as const, { kind: "keyboard", scheme: 1 } as const, ...this.game.input.connectedGamepads().map((i) => ({ kind: "gamepad", index: i }) as const)]) {
      if (this.game.input.nav(s).confirm) return true;
    }
    return false;
  }

  resize(w: number, h: number) {
    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill({ color: 0x171226 });
    this.blobs.clear();
    const colors = [0xff5fa2, 0x5b8bff, 0x8fd94b, 0xffd23f, 0xb07bff];
    for (let i = 0; i < 7; i++) {
      const x = randRange(this.rng, 0, w);
      const y = randRange(this.rng, 0, h);
      this.blobs.circle(x, y, randRange(this.rng, 60, 200)).fill({ color: colors[i % colors.length], alpha: 0.06 });
    }
    this.logo.position.set(w / 2, h * 0.38);
    const scale = Math.min(1, w / 720);
    this.logo.scale.set(scale);
    this.hint.position.set(w / 2, h * 0.78);
    this.buildHint(w);
    for (let i = 0; i < this.goats.length; i++) {
      this.goats[i].x = (w * (i + 1)) / (this.goats.length + 1);
      this.goats[i].y = h * 0.66 + randRange(this.rng, -20, 20);
    }
  }
}
