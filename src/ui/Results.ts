import { Container, Graphics, Sprite } from "pixi.js";
import type { Screen } from "./Screen";
import type { Game } from "../core/Game";
import { mkText, COL, panel } from "./theme";
import { goatPreview, PREVIEW_ANCHOR } from "../render/goatPreview";
import { makeRng, randRange } from "../core/math";

interface Confetti {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  color: number;
  size: number;
}

const OPTIONS = ["Rematch", "Change Arena", "Main Menu"];
const CONF_COLORS = [0xff5fa2, 0xffd23f, 0x3fd0d9, 0x8fd94b, 0xb07bff, 0xff9433];

export class ResultsScreen implements Screen {
  container = new Container();
  private bg = new Graphics();
  private confGfx = new Graphics();
  private confetti: Confetti[] = [];
  private content = new Container();
  private buttons = new Container();
  private goat = new Sprite();
  private sel = 0;
  private t = 0;
  private rng = makeRng(7);
  private clickedConfirm = false;

  constructor(private game: Game, private winner: number) {
    this.container.addChild(this.bg, this.confGfx, this.content, this.buttons);
    this.goat.anchor.set(PREVIEW_ANCHOR.x, PREVIEW_ANCHOR.y);
    this.content.addChild(this.goat);
    for (let i = 0; i < 90; i++) this.spawnConfetti(true);
  }

  private spawnConfetti(scatter: boolean) {
    this.confetti.push({
      x: randRange(this.rng, 0, this.game.vw || 1280),
      y: scatter ? randRange(this.rng, -200, this.game.vh || 720) : -20,
      vx: randRange(this.rng, -30, 30),
      vy: randRange(this.rng, 60, 180),
      rot: randRange(this.rng, 0, 6.3),
      spin: randRange(this.rng, -5, 5),
      color: CONF_COLORS[(this.rng() * CONF_COLORS.length) | 0],
      size: randRange(this.rng, 5, 12),
    });
  }

  enter() {
    this.game.audio.play("cheer");
  }
  exit() {}

  update(dt: number) {
    this.t += dt;
    // confetti
    for (const c of this.confetti) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vy += 40 * dt;
      c.rot += c.spin * dt;
      if (c.y > (this.game.vh || 720) + 20) {
        c.y = -20;
        c.x = randRange(this.rng, 0, this.game.vw || 1280);
        c.vy = randRange(this.rng, 60, 180);
      }
    }
    this.drawConfetti();
    this.goat.rotation = Math.sin(this.t * 2.2) * 0.18;
    this.goat.scale.set(0.8 + Math.sin(this.t * 3) * 0.04);
    this.goat.position.set(0, 60 + Math.sin(this.t * 3) * 8);

    const nav = this.mergedNav();
    if (nav.left) {
      this.sel = (this.sel - 1 + OPTIONS.length) % OPTIONS.length;
      this.game.audio.play("click");
    }
    if (nav.right) {
      this.sel = (this.sel + 1) % OPTIONS.length;
      this.game.audio.play("click");
    }
    if (nav.confirm || nav.start || this.clickedConfirm) {
      this.clickedConfirm = false;
      this.game.audio.play("go");
      if (this.sel === 0) this.game.toMatch();
      else if (this.sel === 1) this.game.toBoardSelect();
      else this.game.toTitle();
      return;
    }
    if (nav.back) {
      this.game.audio.play("release");
      this.game.toTitle();
      return;
    }
    this.updateButtons();
  }

  private drawConfetti() {
    const g = this.confGfx;
    g.clear();
    for (const c of this.confetti) {
      g.rect(c.x - c.size / 2, c.y - c.size / 2, c.size, c.size * 0.6).fill({ color: c.color });
    }
  }

  private mergedNav() {
    const srcs = this.game.session.slots.filter((sl) => sl.active && !sl.isCPU && sl.source).map((sl) => sl.source!);
    const all = [...srcs, { kind: "keyboard", scheme: 0 } as const];
    const acc = { confirm: false, back: false, left: false, right: false, up: false, down: false, start: false };
    for (const s of all) {
      const n = this.game.input.nav(s);
      for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] = acc[k] || (n as unknown as Record<string, boolean>)[k];
    }
    return acc;
  }

  private updateButtons() {
    for (let i = 0; i < this.buttons.children.length; i++) {
      const b = this.buttons.children[i] as Container;
      const focused = i === this.sel;
      b.scale.set(b.scale.x + ((focused ? 1.12 : 1) - b.scale.x) * 0.2);
      b.alpha = b.alpha + ((focused ? 1 : 0.65) - b.alpha) * 0.2;
    }
  }

  resize(w: number, h: number) {
    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill({ color: 0x171226 });

    const players = this.game.buildPlayers();
    const win = players[this.winner];
    const color = win ? win.palette.body : COL.accent;
    this.content.removeChildren();
    if (win) this.goat.texture = goatPreview(win.palette);
    this.content.addChild(this.goat);
    const title = mkText(win ? `${win.name} WINS!` : "NOBODY WINS", { size: 64, weight: "900", fill: color, stroke: COL.ink, strokeW: 10 });
    title.position.set(0, -190);
    const sub = mkText("last goat standing", { size: 26, weight: "700", fill: COL.dim });
    sub.position.set(0, 250);
    this.content.addChild(title, sub);
    this.content.position.set(w / 2, h * 0.4);

    this.buttons.removeChildren();
    const bw = 220;
    const gap = 24;
    const total = OPTIONS.length * bw + (OPTIONS.length - 1) * gap;
    for (let i = 0; i < OPTIONS.length; i++) {
      const b = new Container();
      const p = panel(bw, 60, { fill: 0x2a2140, radius: 30, stroke: COL.cream, strokeW: 2, strokeAlpha: 0.3 });
      const t = mkText(OPTIONS[i], { size: 26, weight: "900", fill: COL.cream });
      b.addChild(p, t);
      b.position.set(-total / 2 + bw / 2 + i * (bw + gap), 0);
      b.eventMode = "static";
      b.cursor = "pointer";
      const optIdx = i;
      b.on("pointertap", () => {
        this.sel = optIdx;
        this.clickedConfirm = true;
      });
      this.buttons.addChild(b);
    }
    this.buttons.position.set(w / 2, h * 0.82);
  }
}
