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
  /** Stable meta-order tile references — tiles.children gets re-sorted by
   *  zIndex, so it must NEVER be used for the i -> board mapping. */
  private tileList: Container[] = [];

  constructor(private game: Game) {
    this.meta = BOARDS.map((b) => {
      const inst = b.make();
      const m = { id: b.id, accent: b.accent, name: inst.name, blurb: inst.blurb, tip: inst.tip };
      inst.root.destroy({ children: true });
      return m;
    });
    this.idx = Math.max(0, this.meta.findIndex((m) => m.id === game.session.boardId));
    this.tiles.sortableChildren = true;
    this.container.addChild(this.bg, this.header, this.tiles, this.info, this.footer);
  }

  private wheelAcc = 0;
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // horizontal trackpad swipes and vertical wheel both browse the shelf
    this.wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    while (Math.abs(this.wheelAcc) >= 90) {
      const step = Math.sign(this.wheelAcc);
      this.wheelAcc -= step * 90;
      const next = clamp(this.idx + step, 0, this.meta.length - 1);
      if (next !== this.idx) {
        this.idx = next;
        this.game.audio.play("click");
      }
    }
  };

  enter() {
    this.game.audio.play("blip");
    window.addEventListener("wheel", this.onWheel, { passive: false });
  }
  exit() {
    window.removeEventListener("wheel", this.onWheel);
  }

  /** Confirm the focused arena — shared by keyboard/pad confirm and clicks. */
  private startMatch() {
    this.game.session.boardId = this.meta[this.idx].id;
    this.game.audio.play("go");
    this.game.toMatch();
  }

  /** Click a tile: centre it; click the centred tile again to fight there. */
  private clickTile(i: number) {
    if (i === this.idx) {
      this.startMatch();
    } else {
      this.idx = i;
      this.game.audio.play("click");
    }
  }

  private mergedNav() {
    const s = this.game;
    let srcs = s.session.slots.filter((sl) => sl.active && !sl.isCPU && sl.source).map((sl) => sl.source!);
    // edit mode arrives with no claimed slots — let any input browse boards
    if (srcs.length === 0) srcs = s.availableSources();
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
    // clamp at the ends — wrapping made all 11 tiles sweep across the screen
    if (nav.left && this.idx > 0) {
      this.idx--;
      this.game.audio.play("click");
    }
    if (nav.right && this.idx < this.meta.length - 1) {
      this.idx++;
      this.game.audio.play("click");
    }
    if (nav.up || nav.down) {
      this.game.session.difficulty = clamp(this.game.session.difficulty + (nav.up ? 1 : -1), 0, 2);
      this.refreshDiff();
      this.game.audio.play("blip");
    }
    if (nav.back && !this.game.editMode) {
      this.game.audio.play("release");
      this.game.toLobby();
      return;
    }
    if (nav.confirm || nav.start) {
      this.startMatch();
      return;
    }
    this.layoutTiles(dt);
    if (this.idx !== this.infoIdx) this.updateInfo();
  }

  private tileSpacing = 220;

  private layoutTiles(dt: number) {
    // carousel: the selected tile sits centred; neighbours fan out and fade.
    // Iterate tileList (stable meta order) — NOT tiles.children, which Pixi
    // re-sorts by zIndex (using it caused tiles to swap slots every frame).
    const k = 1 - Math.exp(-14 * dt);
    for (let i = 0; i < this.tileList.length; i++) {
      const tile = this.tileList[i];
      const rel = i - this.idx;
      const targetX = rel * this.tileSpacing;
      tile.position.x += (targetX - tile.position.x) * k;
      // never lag more than one slot behind — keeps slow machines tidy
      const lag = tile.position.x - targetX;
      const maxLag = this.tileSpacing * 0.95;
      if (Math.abs(lag) > maxLag) tile.position.x = targetX + Math.sign(lag) * maxLag;
      tile.visible = Math.abs(rel) < 2.3;
      const focused = rel === 0;
      const targetS = focused ? 1.14 : Math.max(0.66, 0.9 - Math.abs(rel) * 0.14);
      tile.scale.set(tile.scale.x + (targetS - tile.scale.x) * k);
      tile.alpha = tile.alpha + ((focused ? 1 : 0.4) - tile.alpha) * k;
      tile.zIndex = 100 - Math.abs(rel); // sortableChildren handles draw order
      // only the focused tile shows its name — neighbours stay clean
      const label = tile.children[2];
      if (label) label.alpha = label.alpha + ((focused ? 1 : 0) - label.alpha) * k;
    }
  }

  private infoIdx = -1;

  private updateInfo() {
    // rebuild ONLY when the selection changes, and destroy the old Text
    // objects — rebuilding every frame leaked canvases and janked the menu
    this.infoIdx = this.idx;
    const m = this.meta[this.idx];
    for (const c of this.info.removeChildren()) c.destroy();
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

    for (const c of this.tiles.removeChildren()) c.destroy({ children: true });
    this.tileList = [];
    const tileW = Math.min(210, w * 0.18);
    this.tileSpacing = tileW + 30;
    for (let i = 0; i < this.meta.length; i++) {
      const m = this.meta[i];
      const tile = new Container();
      const p = new Graphics();
      p.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 20).fill({ color: 0x241a38 });
      p.roundRect(-tileW / 2, -tileW / 2, tileW, tileW, 20).stroke({ color: m.accent, width: 4 });
      const thumb = boardThumb(m.id, tileW - 10, tileW * 0.62);
      thumb.position.set(0, -tileW * 0.1);
      const label = mkText(m.name, { size: 16, weight: "800", fill: COL.cream });
      label.position.set(0, tileW / 2 - 22);
      tile.addChild(p, thumb, label);
      tile.position.set((i - this.idx) * this.tileSpacing, 0);
      tile.eventMode = "static";
      tile.cursor = "pointer";
      const tileIdx = i;
      tile.on("pointertap", () => this.clickTile(tileIdx));
      this.tiles.addChild(tile);
      this.tileList.push(tile);
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
