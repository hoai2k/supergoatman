import { Container, Graphics, Sprite, Text } from "pixi.js";
import { mkText, COL } from "./theme";
import { goatPreview, PREVIEW_ANCHOR } from "../render/goatPreview";
import type { Match } from "../core/Match";

class LivesCard {
  root = new Container();
  private livesText: Text;
  private goat: Sprite;
  private frame: Graphics;
  private color: number;
  private lastLives = -1;
  private eliminated = false;

  constructor(name: string, color: number, palette: import("../config").Palette) {
    this.color = color;
    this.frame = new Graphics();
    this.drawFrame(false);
    this.goat = new Sprite(goatPreview(palette));
    this.goat.anchor.set(PREVIEW_ANCHOR.x, PREVIEW_ANCHOR.y);
    this.goat.scale.set(0.15);
    this.goat.position.set(30, 32);
    const label = mkText(name, { size: 18, weight: "900", fill: color, anchorX: 0, anchorY: 0.5 });
    label.position.set(62, 17);
    this.livesText = mkText("♥ ×5", { size: 20, weight: "900", fill: 0xffffff, anchorX: 0, anchorY: 0.5 });
    this.livesText.position.set(62, 40);
    this.root.addChild(this.frame, this.goat, label, this.livesText);
  }

  private drawFrame(dead: boolean) {
    this.frame.clear();
    this.frame.roundRect(0, 0, 182, 58, 14).fill({ color: 0x1c1630, alpha: dead ? 0.55 : 0.82 });
    this.frame.roundRect(0, 0, 182, 58, 14).stroke({ color: dead ? 0x555060 : this.color, width: 3, alpha: 0.9 });
  }

  setLives(lives: number, eliminated: boolean) {
    if (lives === this.lastLives && eliminated === this.eliminated) return;
    this.lastLives = lives;
    this.eliminated = eliminated;
    if (eliminated) {
      this.livesText.text = "☠ OUT";
      this.livesText.style.fill = 0x8a8494;
      this.goat.alpha = 0.35;
      this.drawFrame(true);
    } else {
      this.livesText.text = `♥ ×${lives}`;
      this.livesText.style.fill = lives <= 2 ? 0xff5d5d : 0xffffff;
    }
  }
}

export class HUD {
  root = new Container();
  private cards: LivesCard[] = [];
  private vw = 1280;

  build(match: Match) {
    this.root.removeChildren();
    this.cards = [];
    for (const p of match.players) {
      const c = new LivesCard(p.name, p.palette.body, p.palette);
      this.cards.push(c);
      this.root.addChild(c.root);
    }
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
  }

  update(match: Match) {
    for (let i = 0; i < this.cards.length; i++) {
      const g = match.goats[i];
      this.cards[i].setLives(g.lives, g.eliminated);
    }
  }

  resize(vw: number, _vh: number) {
    this.layout(vw);
  }
}
