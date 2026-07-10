import { Container, Graphics } from "pixi.js";
import type { Screen } from "./Screen";
import type { Game } from "../core/Game";
import { mkText, COL } from "./theme";
import { BOARDS } from "../boards";
import { clamp } from "../core/math";

interface Meta {
  id: string;
  accent: number;
  name: string;
  blurb: string;
  tip: string;
}

const DIFF = ["Chill", "Normal", "Feral"];

function boardIcon(g: Graphics, id: string, s: number, accent: number) {
  g.clear();
  if (id === "balloon") {
    for (const [dx, c] of [[-0.5, 0xff5d5d], [0.5, 0x4fc3ff], [0, 0xffd23f]] as const) {
      g.ellipse(dx * s, -0.1 * s, 0.28 * s, 0.34 * s).fill({ color: c });
      g.moveTo(dx * s, 0.24 * s).lineTo(dx * s, 0.55 * s).stroke({ width: 0.03 * s, color: 0xffffff, alpha: 0.6 });
    }
  } else if (id === "bridge") {
    g.moveTo(-0.7 * s, -0.2 * s).quadraticCurveTo(0, 0.4 * s, 0.7 * s, -0.2 * s).stroke({ width: 0.08 * s, color: accent });
    for (let i = -0.6; i <= 0.6; i += 0.2) g.rect(i * s, (0.05 + Math.abs(i) * -0.3 + 0.15) * s * 0.0 + 0.1 * s, 0.1 * s, 0.14 * s).fill({ color: 0x9a6b3f });
  } else if (id === "underwater") {
    for (let i = 0; i < 3; i++) g.moveTo(-0.7 * s, (-0.2 + i * 0.25) * s).quadraticCurveTo(0, (0.0 + i * 0.25) * s, 0.7 * s, (-0.2 + i * 0.25) * s).stroke({ width: 0.05 * s, color: accent, alpha: 0.8 });
    g.circle(0.2 * s, -0.3 * s, 0.1 * s).fill({ color: 0xbfeaff, alpha: 0.8 });
  } else {
    // volcano
    g.moveTo(-0.6 * s, 0.4 * s).lineTo(-0.15 * s, -0.4 * s).lineTo(0.15 * s, -0.4 * s).lineTo(0.6 * s, 0.4 * s).fill({ color: 0x3a2a2a });
    g.ellipse(0, -0.4 * s, 0.16 * s, 0.07 * s).fill({ color: 0xffb347 });
    g.moveTo(-0.05 * s, -0.38 * s).bezierCurveTo(0.0, 0.0, -0.1, 0.2 * s, 0.05 * s, 0.4 * s).stroke({ width: 0.05 * s, color: 0xff6a24 });
  }
}

export class BoardSelectScreen implements Screen {
  container = new Container();
  private bg = new Graphics();
  private header = mkText("CHOOSE YOUR ARENA", { size: 44, weight: "900", fill: COL.accent, stroke: COL.ink, strokeW: 8 });
  private tiles = new Container();
  private info = new Container();
  private footer = new Container();
  private meta: Meta[] = [];
  private idx = 0;
  private t = 0;
  private diffText = mkText("", { size: 24, weight: "900", fill: COL.good, stroke: COL.ink, strokeW: 5 });

  constructor(private game: Game) {
    this.meta = BOARDS.map((b) => {
      const inst = b.make();
      const m = { id: b.id, accent: b.accent, name: inst.name, blurb: inst.blurb, tip: inst.tip };
      inst.root.destroy({ children: true });
      return m;
    });
    this.idx = Math.max(0, this.meta.findIndex((m) => m.id === game.session.boardId));
    this.container.addChild(this.bg, this.header, this.tiles, this.info, this.footer);
  }

  enter() {
    this.game.audio.play("blip");
  }
  exit() {}

  private mergedNav() {
    const s = this.game;
    const srcs = s.session.slots.filter((sl) => sl.active && !sl.isCPU && sl.source).map((sl) => sl.source!);
    const acc = { confirm: false, back: false, left: false, right: false, up: false, down: false, start: false };
    for (const src of srcs) {
      const n = s.input.nav(src);
      for (const k of Object.keys(acc) as (keyof typeof acc)[]) acc[k] = acc[k] || (n as unknown as Record<string, boolean>)[k];
    }
    return acc;
  }

  update(dt: number) {
    this.t += dt;
    const nav = this.mergedNav();
    if (nav.left) {
      this.idx = (this.idx - 1 + this.meta.length) % this.meta.length;
      this.game.audio.play("click");
    }
    if (nav.right) {
      this.idx = (this.idx + 1) % this.meta.length;
      this.game.audio.play("click");
    }
    if (nav.up || nav.down) {
      this.game.session.difficulty = clamp(this.game.session.difficulty + (nav.up ? 1 : -1), 0, 2);
      this.refreshDiff();
      this.game.audio.play("blip");
    }
    if (nav.back) {
      this.game.audio.play("release");
      this.game.toLobby();
      return;
    }
    if (nav.confirm || nav.start) {
      this.game.session.boardId = this.meta[this.idx].id;
      this.game.audio.play("go");
      this.game.toMatch();
      return;
    }
    this.layoutTiles();
    this.updateInfo();
  }

  private layoutTiles() {
    // handled in resize + here for the pop animation
    for (let i = 0; i < this.tiles.children.length; i++) {
      const tile = this.tiles.children[i] as Container;
      const focused = i === this.idx;
      const target = focused ? 1.14 : 0.82;
      tile.scale.set(tile.scale.x + (target - tile.scale.x) * 0.2);
      tile.alpha = tile.alpha + ((focused ? 1 : 0.5) - tile.alpha) * 0.2;
    }
  }

  private updateInfo() {
    const m = this.meta[this.idx];
    this.info.removeChildren();
    const name = mkText(m.name, { size: 40, weight: "900", fill: m.accent, stroke: COL.ink, strokeW: 7 });
    const blurb = mkText(m.blurb, { size: 24, weight: "700", fill: COL.cream });
    blurb.position.set(0, 44);
    const tip = mkText("💡 " + m.tip, { size: 20, weight: "700", fill: COL.accent });
    (tip.style as unknown as { wordWrap: boolean; wordWrapWidth: number }).wordWrap = true;
    (tip.style as unknown as { wordWrapWidth: number }).wordWrapWidth = Math.min(900, this.game.vw - 160);
    tip.position.set(0, 92);
    this.info.addChild(name, blurb, tip);
    this.info.position.set(this.game.vw / 2, this.game.vh * 0.6);
  }

  resize(w: number, h: number) {
    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill({ color: 0x171226 });
    this.header.position.set(w / 2, h * 0.12);

    this.tiles.removeChildren();
    const tileW = Math.min(190, (w - 120) / 4 - 20);
    const gap = 26;
    const total = this.meta.length * tileW + (this.meta.length - 1) * gap;
    for (let i = 0; i < this.meta.length; i++) {
      const m = this.meta[i];
      const tile = new Container();
      const p = new Graphics();
      p.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 20).fill({ color: 0x241a38 });
      p.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 20).stroke({ color: m.accent, width: 4 });
      const icon = new Graphics();
      boardIcon(icon, m.id, tileW * 0.7, m.accent);
      icon.position.set(0, -tileW * 0.06);
      const label = mkText(m.name, { size: 17, weight: "800", fill: COL.cream });
      label.position.set(0, tileW / 2 - 22);
      tile.addChild(p, icon, label);
      tile.position.set(-total / 2 + tileW / 2 + i * (tileW + gap), 0);
      this.tiles.addChild(tile);
    }
    this.tiles.position.set(w / 2, h * 0.34);

    this.footer.removeChildren();
    this.diffText.position.set(0, 0);
    const controls = mkText("◄ ►  Arena      ▲ ▼  CPU skill      Ⓐ Fight!      Ⓑ Back", { size: 22, weight: "800", fill: COL.cream, stroke: COL.ink, strokeW: 4 });
    controls.position.set(0, 36);
    this.footer.addChild(this.diffText, controls);
    this.footer.position.set(w / 2, h * 0.84);
    this.refreshDiff();
    this.updateInfo();
  }

  private refreshDiff() {
    this.diffText.text = `CPU skill:  ${DIFF[this.game.session.difficulty]}`;
  }
}
