import { Container, Graphics } from "pixi.js";
import type { Screen } from "./Screen";
import type { Game } from "../core/Game";
import { Match } from "../core/Match";
import { boardById } from "../boards";
import { DebugDraw } from "../render/DebugDraw";
import { BoxEditor } from "../render/BoxEditor";
import { HUD } from "./HUD";
import { mkText, COL } from "./theme";
import { easeOutBack } from "./theme";

export class MatchScreen implements Screen {
  container = new Container();
  private match: Match;
  private hud = new HUD();
  private banner = new Container();
  private bannerText = mkText("", { size: 90, weight: "900", fill: COL.cream, stroke: COL.ink, strokeW: 12 });
  private bannerT = 0;
  private bannerDur = 0;
  private pauseOverlay = new Container();
  private paused = false;
  private pendingResults = -2;
  private debugDraw: DebugDraw | null = null;
  private boxEditor: BoxEditor | null = null;

  constructor(private game: Game) {
    const board = boardById(game.session.boardId);
    const players = game.buildPlayers();
    this.match = new Match(this.container, board, players, game.input, game.audio);
    this.match.onMatchOver = (winner) => {
      this.pendingResults = winner;
    };
    this.match.onRoundEvent = (kind, data) => this.onRoundEvent(kind, data);
    (window as unknown as { __match: Match }).__match = this.match;

    // debug overlay: live collision shapes for EVERYTHING (?debug=bb or #dbgcol)
    const params = new URLSearchParams(location.search);
    const wantEdit = params.get("edit") === "bb";
    const wantDebug = params.get("debug") === "bb" || location.hash.includes("dbgcol") || wantEdit;
    if (wantDebug) this.debugDraw = new DebugDraw(this.match);
    // ?edit=bb: drag platform boxes live, then export the tuned coords
    if (wantEdit) this.boxEditor = new BoxEditor(this.match, game.session.boardId);

    this.banner.addChild(this.bannerText);
    this.container.addChild(this.hud.root, this.banner);
    this.hud.build(this.match);
    this.onRoundEvent("intro"); // constructor fired before our handler attached
    this.buildPause();
    this.container.addChild(this.pauseOverlay);
    this.pauseOverlay.visible = false;
  }

  private onRoundEvent(kind: string, data?: unknown) {
    if (kind === "intro")
      this.showBanner(this.game.editMode ? "SURVEYOR MODE" : "9 LIVES. NO REFUNDS.", COL.accent, 1.7);
    else if (kind === "go") this.showBanner("GOAT!", COL.good, 0.8);
    else if (kind === "kill") {
      const d = data as { victim: number; cause: string };
      const p = this.match.players[d.victim];
      const g = this.match.goats[d.victim];
      if (g.eliminated) this.showBanner(`${p.name} IS OUT`, p.palette.body, 1.6);
    }
  }

  private showBanner(text: string, color: number, dur: number) {
    this.bannerText.text = text;
    this.bannerText.style.fill = color;
    this.bannerT = 0;
    this.bannerDur = dur;
    this.banner.visible = true;
  }

  enter() {}

  exit() {
    this.boxEditor?.destroy();
    this.boxEditor = null;
    this.match.destroy();
  }

  update(dt: number) {
    // pause toggle
    if (this.consumeStart()) {
      this.paused = !this.paused;
      this.pauseOverlay.visible = this.paused;
      this.game.audio.play(this.paused ? "release" : "blip");
    }
    if (this.paused) {
      // the platform editor stays live while paused — calmest way to edit
      this.boxEditor?.update();
      if (this.consumeBack()) {
        this.game.audio.play("release");
        this.game.audio.setMusic(false);
        // surveyors return to the arena shelf, brawlers to the title
        if (this.game.editMode) this.game.toBoardSelect();
        else this.game.toTitle();
      }
      return;
    }

    this.match.update(dt);
    this.debugDraw?.update();
    this.boxEditor?.update();
    this.hud.update(this.match);
    this.tickBanner(dt);

    if (this.pendingResults !== -2) {
      const w = this.pendingResults;
      this.pendingResults = -2;
      this.game.audio.setMusic(false);
      this.game.toResults(w);
    }
  }

  private tickBanner(dt: number) {
    if (!this.banner.visible) return;
    this.bannerT += dt;
    const t = this.bannerT;
    const inT = Math.min(1, t / 0.3);
    this.banner.scale.set(easeOutBack(inT));
    if (t > this.bannerDur) {
      this.banner.alpha = Math.max(0, 1 - (t - this.bannerDur) / 0.4);
      if (this.banner.alpha <= 0) {
        this.banner.visible = false;
        this.banner.alpha = 1;
      }
    } else {
      this.banner.alpha = 1;
    }
    this.banner.position.set(this.game.vw / 2, this.game.vh * 0.32);
  }

  private consumeStart(): boolean {
    for (const s of this.navSources()) if (this.game.input.nav(s).start) return true;
    return false;
  }
  private consumeBack(): boolean {
    for (const s of this.navSources()) if (this.game.input.nav(s).back) return true;
    return false;
  }
  private activeSources() {
    return this.game.session.slots.filter((sl) => sl.active && !sl.isCPU && sl.source).map((sl) => sl.source!);
  }
  /** Edit mode has no claimed slots — any keyboard or pad may pause/exit. */
  private navSources() {
    const active = this.activeSources();
    return active.length === 0 && this.game.editMode ? this.game.availableSources() : active;
  }

  private pauseHint() {
    return this.game.editMode
      ? "Start / Enter: resume      Ⓑ / Esc: back to arena select"
      : "Start: resume      Ⓑ / Esc: quit to menu";
  }

  private buildPause() {
    const dim = new Graphics();
    dim.rect(0, 0, this.game.vw, this.game.vh).fill({ color: 0x000000, alpha: 0.6 });
    dim.label = "dim";
    const t = mkText("PAUSED", { size: 80, weight: "900", fill: COL.cream, stroke: COL.ink, strokeW: 12 });
    t.position.set(this.game.vw / 2, this.game.vh * 0.42);
    const h = mkText(this.pauseHint(), { size: 26, weight: "800", fill: COL.dim });
    h.position.set(this.game.vw / 2, this.game.vh * 0.42 + 70);
    this.pauseOverlay.addChild(dim, t, h);
  }

  resize(w: number, h: number) {
    this.match.resize(w, h);
    this.hud.resize(w, h);
    this.banner.position.set(w / 2, h * 0.32);
    this.pauseOverlay.removeChildren();
    const dim = new Graphics();
    dim.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.6 });
    const t = mkText("PAUSED", { size: 80, weight: "900", fill: COL.cream, stroke: COL.ink, strokeW: 12 });
    t.position.set(w / 2, h * 0.42);
    const hint = mkText(this.pauseHint(), { size: 26, weight: "800", fill: COL.dim });
    hint.position.set(w / 2, h * 0.42 + 70);
    this.pauseOverlay.addChild(dim, t, hint);
  }
}
