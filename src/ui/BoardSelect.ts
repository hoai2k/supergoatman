import { Container, Graphics, Sprite } from "pixi.js";
import type { Screen } from "./Screen";
import type { Game } from "../core/Game";
import { mkText, COL } from "./theme";
import { BOARDS } from "../boards";
import { clamp } from "../core/math";
import { arenaTexture } from "../render/assets";

interface Meta {
  id: string;
  accent: number;
  name: string;
  blurb: string;
  tip: string;
}

const DIFF = ["Chill", "Normal", "Feral"];

/** Tile preview: the actual arena painting behind a rounded mask. */
function boardThumb(id: string, w: number, h: number): Container {
  const c = new Container();
  const sp = new Sprite(arenaTexture(id));
  const scale = Math.max(w / sp.texture.width, h / sp.texture.height);
  sp.anchor.set(0.5);
  sp.scale.set(scale);
  const mask = new Graphics();
  mask.roundRect(-w / 2, -h / 2, w, h, 16).fill({ color: 0xffffff });
  c.addChild(sp, mask);
  sp.mask = mask;
  return c;
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
      const thumb = boardThumb(m.id, tileW - 10, tileW * 0.62);
      thumb.position.set(0, -tileW * 0.1);
      const label = mkText(m.name, { size: 17, weight: "800", fill: COL.cream });
      label.position.set(0, tileW / 2 - 22);
      tile.addChild(p, thumb, label);
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
