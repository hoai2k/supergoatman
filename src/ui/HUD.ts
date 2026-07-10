import { Container, Graphics, Sprite } from "pixi.js";
import { mkText, COL } from "./theme";
import { goatPreview } from "../render/goatPreview";
import { MATCH } from "../config";
import type { Match } from "../core/Match";
import { ANCHOR } from "../render/GoatArt";

class ScoreCard {
  root = new Container();
  private pips: Graphics;
  private color: number;

  constructor(name: string, color: number, palette: import("../config").Palette) {
    this.color = color;
    const bg = new Graphics();
    bg.roundRect(0, 0, 182, 58, 14).fill({ color: 0x1c1630, alpha: 0.82 });
    bg.roundRect(0, 0, 182, 58, 14).stroke({ color, width: 3, alpha: 0.9 });
    const goat = new Sprite(goatPreview(palette));
    goat.anchor.set(ANCHOR.x, ANCHOR.y);
    goat.scale.set(0.26);
    goat.position.set(26, 30);
    const label = mkText(name, { size: 18, weight: "900", fill: color, anchorX: 0, anchorY: 0.5 });
    label.position.set(60, 17);
    this.pips = new Graphics();
    this.pips.position.set(62, 40);
    this.root.addChild(bg, goat, label, this.pips);
  }

  setScore(score: number) {
    const g = this.pips;
    g.clear();
    for (let i = 0; i < MATCH.pointsToWin; i++) {
      const x = i * 20;
      if (i < score) g.circle(x, 0, 7).fill({ color: this.color });
      else g.circle(x, 0, 7).fill({ color: 0xffffff, alpha: 0.14 });
    }
  }
}

export class HUD {
  root = new Container();
  private cards: ScoreCard[] = [];
  private sudden = mkText("", { size: 26, weight: "900", fill: COL.bad, stroke: COL.ink, strokeW: 6 });
  private vw = 1280;

  build(match: Match) {
    this.root.removeChildren();
    this.cards = [];
    for (const p of match.players) {
      const c = new ScoreCard(p.name, p.palette.body, p.palette);
      this.cards.push(c);
      this.root.addChild(c.root);
    }
    this.sudden.visible = false;
    this.root.addChild(this.sudden);
    this.layout(this.vw);
  }

  private layout(vw: number) {
    this.vw = vw;
    const n = this.cards.length;
    const cw = 182;
    const gap = 16;
    const total = n * cw + (n - 1) * gap;
    const startX = (vw - total) / 2;
    for (let i = 0; i < n; i++) this.cards[i].root.position.set(startX + i * (cw + gap), 14);
    this.sudden.position.set(vw / 2, 96);
  }

  update(match: Match) {
    for (let i = 0; i < this.cards.length; i++) this.cards[i].setScore(match.scores[i]);
    const remaining = MATCH.suddenDeathAfter - match.playTime;
    if (match.phase === "play" && remaining < 0) {
      this.sudden.visible = true;
      this.sudden.text = "⚠ SUDDEN DEATH ⚠";
      this.sudden.scale.set(1 + Math.sin(match.playTime * 8) * 0.06);
    } else {
      this.sudden.visible = false;
    }
  }

  resize(vw: number, _vh: number) {
    this.layout(vw);
  }
}
