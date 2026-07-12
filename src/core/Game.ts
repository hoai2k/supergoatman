import { Application, Container } from "pixi.js";
import { InputHub, type Source } from "./Input";
import { AudioBus } from "./Audio";
import type { Screen } from "../ui/Screen";
import { PALETTES } from "../config";
import type { PlayerConfig } from "./Match";

export interface Slot {
  active: boolean;
  isCPU: boolean;
  aiLevel: number;
  paletteIdx: number;
  source: Source | null; // for humans
}

export interface Session {
  slots: Slot[];
  boardId: string;
  difficulty: number; // 0..2 for CPUs
}

function emptySlot(paletteIdx: number): Slot {
  return { active: false, isCPU: false, aiLevel: 1, paletteIdx, source: null };
}

export class Game {
  input = new InputHub();
  audio = new AudioBus();
  session: Session = {
    slots: [emptySlot(0), emptySlot(3), emptySlot(2), emptySlot(1)],
    boardId: "balloon",
    difficulty: 1,
  };
  private screen: Screen | null = null;
  root = new Container();
  vw = 1280;
  vh = 720;
  /** ?edit=bb — platform surveying: no goats, no sound, whole-board camera. */
  editMode = false;

  // screen factories are injected to avoid import cycles
  makeTitle!: (g: Game) => Screen;
  makeLobby!: (g: Game) => Screen;
  makeBoardSelect!: (g: Game) => Screen;
  makeMatch!: (g: Game) => Screen;
  makeResults!: (g: Game, winner: number) => Screen;

  constructor(public app: Application) {
    app.stage.addChild(this.root);
    this.vw = app.screen.width;
    this.vh = app.screen.height;
  }

  go(screen: Screen) {
    if (this.screen) {
      this.screen.exit();
      this.root.removeChild(this.screen.container);
    }
    this.screen = screen;
    this.root.addChild(screen.container);
    screen.resize(this.vw, this.vh);
    screen.enter();
  }

  toTitle() {
    this.go(this.makeTitle(this));
  }
  toLobby() {
    this.go(this.makeLobby(this));
  }
  toBoardSelect() {
    this.go(this.makeBoardSelect(this));
  }
  toMatch() {
    this.audio.setMusic(true);
    this.go(this.makeMatch(this));
  }
  toResults(winner: number) {
    this.go(this.makeResults(this, winner));
  }

  /** Convert lobby slots into player configs for a match. */
  buildPlayers(): PlayerConfig[] {
    if (this.editMode) return []; // surveyors work alone
    const out: PlayerConfig[] = [];
    let idx = 0;
    for (const slot of this.session.slots) {
      if (!slot.active) continue;
      out.push({
        index: idx,
        name: slot.isCPU ? "CPU" : `P${idx + 1}`,
        palette: PALETTES[slot.paletteIdx % PALETTES.length],
        source: slot.isCPU ? { kind: "ai", level: this.session.difficulty } : slot.source!,
      });
      idx++;
    }
    return out;
  }

  activeCount(): number {
    return this.session.slots.filter((s) => s.active).length;
  }

  /** Sources that could still join (unclaimed keyboards + connected pads). */
  availableSources(): Source[] {
    const claimed = new Set(
      this.session.slots
        .filter((s) => s.active && !s.isCPU && s.source)
        .map((s) => sourceKey(s.source!)),
    );
    const all: Source[] = [
      { kind: "keyboard", scheme: 0 },
      { kind: "keyboard", scheme: 1 },
      ...this.input.connectedGamepads().map((i) => ({ kind: "gamepad", index: i }) as Source),
    ];
    return all.filter((s) => !claimed.has(sourceKey(s)));
  }

  update(dt: number) {
    this.input.update();
    this.screen?.update(dt);
    this.audio.updateMusic(dt);
  }

  resize(w: number, h: number) {
    this.vw = w;
    this.vh = h;
    this.screen?.resize(w, h);
  }
}

export function sourceKey(s: Source): string {
  if (s.kind === "gamepad") return `gp${s.index}`;
  if (s.kind === "keyboard") return `kb${s.scheme}`;
  return "ai";
}

export function sourceLabel(s: Source | null): string {
  if (!s) return "CPU";
  if (s.kind === "gamepad") return `Pad ${s.index + 1}`;
  if (s.kind === "keyboard") return s.scheme === 0 ? "Arrows" : "WASD";
  return "CPU";
}
