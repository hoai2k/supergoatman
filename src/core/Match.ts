import { Container } from "pixi.js";
import { Physics } from "./Physics";
import { Camera } from "./Camera";
import { FxSystem } from "../render/Fx";
import { Background } from "../render/Background";
import { Goat } from "../entities/Goat";
import { GoatAI } from "../ai/GoatAI";
import type { Board } from "../boards/Board";
import type { InputHub, Source } from "./Input";
import type { AudioBus } from "./Audio";
import type { Arena } from "./types";
import { GRAVITY, MATCH, type Palette } from "../config";
import { neutralIntent, type Intent } from "./intent";
import type { Vec2 } from "./math";

export interface PlayerConfig {
  index: number;
  name: string;
  palette: Palette;
  source: Source;
}

export type MatchPhase = "intro" | "play" | "outro" | "done";

export class Match {
  arena: Arena;
  physics: Physics;
  camera = new Camera();
  fx: FxSystem;
  bg: Background;
  goats: Goat[] = [];
  private ai = new Map<number, GoatAI>();

  world = new Container(); // scaled/positioned by camera
  private terrainLayer = new Container();
  private goatLayer = new Container();
  private fxLayer = new Container();

  phase: MatchPhase = "intro";
  private phaseT = 0;
  private hitstop = 0;
  playTime = 0;
  round = 0;
  scores: number[] = [];
  lastRoundWinner = -1;
  onMatchOver?: (winner: number) => void;
  onRoundEvent?: (kind: "intro" | "go" | "roundOver" | "matchOver", data?: unknown) => void;

  constructor(
    public stageRoot: Container,
    public board: Board,
    public players: PlayerConfig[],
    private input: InputHub,
    private audio: AudioBus,
  ) {
    this.physics = new Physics({ x: 0, y: GRAVITY * board.gravityScale });
    this.bg = new Background();
    this.fx = new FxSystem(this.fxLayer, this.camera);

    this.world.addChild(this.terrainLayer, this.goatLayer, this.fxLayer);
    stageRoot.addChild(this.bg.root, this.world);

    this.arena = {
      physics: this.physics,
      goats: this.goats,
      props: [],
      fx: this.fx,
      sfx: this.audio,
    };

    this.board.bg = this.bg;
    this.board.build(this.arena);
    this.terrainLayer.addChild(this.board.root);
    this.camera.bounds = this.board.bounds;

    this.scores = players.map(() => 0);
    for (const pc of players) {
      const sp = board.spawnFor(pc.index);
      const goat = new Goat(this.physics, pc.palette, pc.index, sp.pos, sp.angle);
      goat.attach(this.goatLayer);
      this.board.onGoatSpawn?.(goat, this.arena);
      this.goats.push(goat);
      if (pc.source.kind === "ai") this.ai.set(pc.index, new GoatAI(pc.source.level));
    }

    this.startRound();
  }

  private startRound() {
    this.round++;
    this.phase = "intro";
    this.phaseT = 0;
    this.playTime = 0;
    this.board.reset(this.arena);
    for (let i = 0; i < this.goats.length; i++) {
      const sp = this.board.spawnFor(this.players[i].index);
      this.goats[i].respawn(sp.pos, sp.angle);
    }
    this.onRoundEvent?.("intro");
    this.audio.play("whistle");
  }

  private aliveGoats(): Goat[] {
    return this.goats.filter((g) => !g.dead);
  }

  update(dt: number) {
    // input.update() is driven once per frame by the Game loop

    // ---- intents ----
    const controlling = this.phase === "play";
    for (const goat of this.goats) {
      let intent: Intent = neutralIntent();
      if (controlling && !goat.dead) {
        const pc = this.players[goat.playerIndex];
        if (pc.source.kind === "ai") {
          intent = this.ai.get(pc.index)!.think(goat, this.arena, dt);
        } else {
          intent = this.input.intent(pc.source);
        }
      }
      goat.setIntent(intent);
    }

    // brief slow-mo when a goat gets got
    const aliveBefore = this.aliveGoats().length;
    let sdt = dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      sdt = dt * 0.4;
    }

    // ---- fixed-step simulation ----
    this.physics.step(sdt, () => {
      this.board.fixedStep(this.arena);
      for (const goat of this.goats) goat.fixedStep(this.arena);
    });

    // ---- render sync ----
    for (const goat of this.goats) goat.sync();
    this.board.update(sdt, this.arena);
    this.fx.update(sdt);

    // ---- phase / rules ----
    this.tickPhase(dt);
    if (this.aliveGoats().length < aliveBefore) this.hitstop = 0.16;

    // ---- camera ----
    const pts: Vec2[] = this.aliveGoats().map((g) => g.pos);
    this.board.decorateCameraPoints?.(pts);
    if (pts.length) this.camera.frame(pts);
    this.camera.update(dt);
    this.camera.apply(this.world);
    this.bg.update(this.camera);

    this.audio.updateMusic(dt);
  }

  private tickPhase(dt: number) {
    this.phaseT += dt;
    if (this.phase === "intro") {
      if (this.phaseT >= MATCH.roundIntroTime) {
        this.phase = "play";
        this.phaseT = 0;
        this.onRoundEvent?.("go");
        this.audio.play("go");
      }
      return;
    }
    if (this.phase === "play") {
      this.playTime += dt;
      this.board.checkHazards(this.arena);
      if (this.playTime > MATCH.suddenDeathAfter) this.board.escalate?.(dt, this.arena);

      const alive = this.aliveGoats();
      if (alive.length <= 1 && this.goats.length > 1) {
        this.phase = "outro";
        this.phaseT = 0;
        const winner = alive.length === 1 ? alive[0].playerIndex : -1;
        this.lastRoundWinner = winner;
        if (winner >= 0) {
          this.scores[winner]++;
          this.fx.popText(alive[0].pos, "WINNER!", alive[0].palette.body);
          this.audio.play("cheer");
        }
        this.onRoundEvent?.("roundOver", winner);
      }
      return;
    }
    if (this.phase === "outro") {
      if (this.phaseT >= MATCH.roundOutroTime) {
        const winIdx = this.scores.findIndex((s) => s >= MATCH.pointsToWin);
        if (winIdx >= 0) {
          this.phase = "done";
          this.onRoundEvent?.("matchOver", winIdx);
          this.onMatchOver?.(winIdx);
        } else {
          this.startRound();
        }
      }
    }
  }

  resize(w: number, h: number) {
    this.camera.resize(w, h);
    this.bg.resize(w, h);
  }

  destroy() {
    this.board.destroy(this.arena);
    for (const g of this.goats) g.destroy(this.arena);
    this.bg.destroy();
    this.world.destroy({ children: true });
    this.physics.destroy();
  }
}
