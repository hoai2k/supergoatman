import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Screen } from "./Screen";
import { type Game, sourceLabel, type Slot } from "../core/Game";
import { mkText, panel, COL, buttonGlyph } from "./theme";
import { renderGoat, ANCHOR } from "../render/GoatArt";
import { PALETTES } from "../config";

const previews: Texture[] = [];
function preview(idx: number): Texture {
  if (!previews[idx]) {
    const t = Texture.from(renderGoat(PALETTES[idx], 0.15, 0.1));
    t.source.scaleMode = "linear";
    previews[idx] = t;
  }
  return previews[idx];
}

class Card {
  root = new Container();
  private frame = new Graphics();
  private goat = new Sprite();
  private title = mkText("", { size: 26, weight: "900" });
  private sub = mkText("", { size: 20, weight: "700", fill: COL.dim });
  private hintL = mkText("", { size: 18, weight: "800", fill: COL.cream });
  private t = 0;

  constructor() {
    this.goat.anchor.set(ANCHOR.x, ANCHOR.y);
    this.goat.scale.set(0.62);
    this.title.position.set(0, 74);
    this.sub.position.set(0, 104);
    this.hintL.position.set(0, 132);
    this.root.addChild(this.frame, this.goat, this.title, this.sub, this.hintL);
  }

  layout(w: number, h: number) {
    this.frame.clear();
    this.frame.roundRect(-w / 2, -h / 2, w, h, 22).fill({ color: COL.panel, alpha: 0.96 });
    this.goat.position.set(0, -30);
    this.title.position.set(0, h / 2 - 118);
    this.sub.position.set(0, h / 2 - 88);
    this.hintL.position.set(0, h / 2 - 56);
  }

  update(slot: Slot, dt: number, w: number, h: number) {
    this.t += dt;
    this.frame.clear();
    const accent = slot.active ? PALETTES[slot.paletteIdx].body : 0x3b3155;
    this.frame.roundRect(-w / 2, -h / 2, w, h, 22).fill({ color: COL.panel, alpha: 0.96 });
    this.frame.roundRect(-w / 2, -h / 2, w, h, 22).stroke({ color: accent, width: slot.active ? 5 : 3, alpha: slot.active ? 1 : 0.4 });

    if (slot.active) {
      this.goat.visible = true;
      this.goat.texture = preview(slot.paletteIdx);
      this.goat.rotation = Math.sin(this.t * 2) * 0.12;
      this.goat.position.set(0, -30 + Math.sin(this.t * 2.4) * 4);
      this.title.text = slot.isCPU ? "CPU" : sourceLabel(slot.source);
      this.title.style.fill = accent;
      this.sub.text = PALETTES[slot.paletteIdx].name;
      this.hintL.text = slot.isCPU ? "◄ recolor ►" : "◄ recolor ►   Ⓑ leave";
      this.hintL.visible = true;
    } else {
      this.goat.visible = false;
      this.title.text = "OPEN";
      this.title.style.fill = COL.dim;
      this.sub.text = "";
      this.hintL.text = "press Ⓐ / Space";
      this.hintL.visible = true;
    }
  }
}

export class LobbyScreen implements Screen {
  container = new Container();
  private bg = new Graphics();
  private header = mkText("PICK YOUR GOAT", { size: 46, weight: "900", fill: COL.accent, stroke: COL.ink, strokeW: 8 });
  private footer = new Container();
  private cards: Card[] = [];
  private cardRow = new Container();

  constructor(private game: Game) {
    this.container.addChild(this.bg, this.header, this.cardRow, this.footer);
    for (let i = 0; i < 4; i++) {
      const c = new Card();
      this.cards.push(c);
      this.cardRow.addChild(c.root);
    }
  }

  enter() {
    this.game.audio.play("blip");
  }
  exit() {}

  update(dt: number) {
    const s = this.game;
    // joins from unclaimed sources
    for (const src of s.availableSources()) {
      if (s.input.nav(src).confirm) {
        const free = s.session.slots.find((sl) => !sl.active);
        if (free) {
          free.active = true;
          free.isCPU = false;
          free.source = src;
          free.paletteIdx = this.freePalette(free.paletteIdx);
          s.audio.play("go");
        }
      }
    }

    // per-active-slot controls
    let anyStart = false;
    let addCpu = false;
    let removeCpu = false;
    for (const slot of s.session.slots) {
      if (!slot.active) continue;
      const src = slot.isCPU ? null : slot.source;
      const nav = src ? s.input.nav(src) : null;
      if (nav) {
        if (nav.left) {
          slot.paletteIdx = this.cyclePalette(slot.paletteIdx, -1, slot);
          s.audio.play("click");
        }
        if (nav.right) {
          slot.paletteIdx = this.cyclePalette(slot.paletteIdx, 1, slot);
          s.audio.play("click");
        }
        if (nav.up) addCpu = true;
        if (nav.down) removeCpu = true;
        if (nav.back) {
          slot.active = false;
          slot.source = null;
          s.audio.play("release");
        }
        if (nav.start) anyStart = true;
      }
    }

    if (addCpu) this.addCpu();
    if (removeCpu) this.removeCpu();

    // start
    if (anyStart && s.activeCount() >= 2) {
      s.audio.play("go");
      s.toBoardSelect();
      return;
    }
    // back to title when empty
    if (s.activeCount() === 0) {
      for (const src of [{ kind: "keyboard", scheme: 0 } as const, { kind: "keyboard", scheme: 1 } as const, ...s.input.connectedGamepads().map((i) => ({ kind: "gamepad", index: i }) as const)]) {
        if (s.input.nav(src).back) {
          s.toTitle();
          return;
        }
      }
    }

    // draw
    const w = this.cardW;
    const h = this.cardH;
    for (let i = 0; i < 4; i++) this.cards[i].update(s.session.slots[i], dt, w, h);
    this.updateFooter();
  }

  private addCpu() {
    const free = this.game.session.slots.find((sl) => !sl.active);
    if (!free) return;
    free.active = true;
    free.isCPU = true;
    free.source = null;
    free.paletteIdx = this.freePalette(free.paletteIdx);
    this.game.audio.play("blip");
  }
  private removeCpu() {
    for (let i = this.game.session.slots.length - 1; i >= 0; i--) {
      const sl = this.game.session.slots[i];
      if (sl.active && sl.isCPU) {
        sl.active = false;
        this.game.audio.play("release");
        return;
      }
    }
  }

  private usedPalettes(except?: Slot): Set<number> {
    const set = new Set<number>();
    for (const sl of this.game.session.slots) if (sl.active && sl !== except) set.add(sl.paletteIdx);
    return set;
  }
  private cyclePalette(cur: number, dir: number, slot: Slot): number {
    const used = this.usedPalettes(slot);
    let n = cur;
    for (let k = 0; k < PALETTES.length; k++) {
      n = (n + dir + PALETTES.length) % PALETTES.length;
      if (!used.has(n)) return n;
    }
    return cur;
  }
  private freePalette(prefer: number): number {
    const used = this.usedPalettes();
    if (!used.has(prefer)) return prefer;
    for (let i = 0; i < PALETTES.length; i++) if (!used.has(i)) return i;
    return prefer;
  }

  private cardW = 210;
  private cardH = 300;

  private updateFooter() {
    // built in resize; nothing dynamic needed beyond enable/disable tint
  }

  resize(w: number, h: number) {
    this.bg.clear();
    this.bg.rect(0, 0, w, h).fill({ color: 0x171226 });
    this.header.position.set(w / 2, h * 0.12);

    this.cardW = Math.min(230, (w - 100) / 4 - 16);
    this.cardH = this.cardW * 1.42;
    const gap = 24;
    const total = 4 * this.cardW + 3 * gap;
    this.cardRow.position.set(w / 2, h * 0.5);
    for (let i = 0; i < 4; i++) {
      this.cards[i].layout(this.cardW, this.cardH);
      this.cards[i].root.position.set(-total / 2 + this.cardW / 2 + i * (this.cardW + gap), 0);
    }

    this.footer.removeChildren();
    const f1 = mkText("↑ Add CPU     ↓ Remove CPU     ◄ ► Recolor", { size: 22, weight: "800", fill: COL.cream, stroke: COL.ink, strokeW: 4 });
    f1.position.set(0, -18);
    const f2 = mkText("Press  Start  /  Enter  to choose a board   (2+ goats)", { size: 24, weight: "900", fill: COL.accent, stroke: COL.ink, strokeW: 5 });
    f2.position.set(0, 20);
    this.footer.addChild(f1, f2);
    this.footer.position.set(w / 2, h * 0.88);
  }
}
