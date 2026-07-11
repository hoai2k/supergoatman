import { Container } from "pixi.js";
import { Physics } from "./Physics";
import { Camera } from "./Camera";
import { FxSystem } from "../render/Fx";
import { Background } from "../render/Background";
import { Goat } from "../entities/Goat";
import { Ragdoll } from "../entities/Ragdoll";
import { GoatAI } from "../ai/GoatAI";
import type { Board } from "../boards/Board";
import type { InputHub, Source } from "./Input";
import type { AudioBus } from "./Audio";
import type { Arena } from "./types";
import { GRAVITY, MATCH, type Palette } from "../config";
import { neutralIntent, type Intent } from "./intent";
import { dist, type Vec2 } from "./math";

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
  private ragdolls: Ragdoll[] = [];

  world = new Container(); // scaled/positioned by camera
  private terrainLayer = new Container();
  private goatLayer = new Container();
  private fxLayer = new Container();

  phase: MatchPhase = "intro";
  private phaseT = 0;
  private hitstop = 0;
  playTime = 0;
  onMatchOver?: (winner: number) => void;
  onRoundEvent?: (kind: "intro" | "go" | "kill" | "matchOver", data?: unknown) => void;

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
      bounds: board.bounds,
      killGoat: (g, cause, impulse, byPlayer) => this.killGoat(g, cause, impulse, byPlayer),
    };

    this.board.bg = this.bg;
    this.board.build(this.arena);
    this.terrainLayer.addChild(this.board.root);
    this.camera.bounds = this.board.bounds;
    this.camera.viewRect = this.board.bounds;

    for (const pc of players) {
      const sp = board.spawnFor(pc.index);
      const goat = new Goat(this.physics, pc.palette, pc.index, sp.pos, sp.angle);
      goat.attach(this.goatLayer);
      this.board.onGoatSpawn?.(goat, this.arena);
      this.goats.push(goat);
      if (pc.source.kind === "ai") this.ai.set(pc.index, new GoatAI(pc.source.level));
    }

    this.phase = "intro";
    this.phaseT = 0;
    this.onRoundEvent?.("intro");
    this.audio.play("whistle");
  }

  // ---- death & respawn ----------------------------------------------------
  private killGoat(goat: Goat, cause: string, impulse?: Vec2, byPlayer?: number) {
    if (goat.dead || goat.eliminated || goat.invulnT > 0 || this.phase !== "play") return;
    goat.lives--;

    // the moment of transformation: live sprite -> jointed sprite-part ragdoll
    this.ragdolls.push(
      new Ragdoll(
        this.arena,
        goat.skin,
        goat.pos,
        goat.angle,
        goat.vel,
        goat.body.angvel(),
        this.goatLayer,
        impulse,
      ),
    );

    this.fx.burst("impact", goat.pos, { n: 14 });
    this.fx.ring(goat.pos, goat.palette.body, 1.4);
    this.fx.shake(11);
    this.fx.popText({ x: goat.pos.x, y: goat.pos.y - 0.7 }, cause, goat.palette.body);
    this.audio.play("thud", { rate: 0.7 });
    this.hitstop = 0.14;

    goat.enterDeadState(this.arena);
    // pick the comeback spot NOW so the camera can hold it in frame — no
    // zooming tight onto the survivors and then jarringly back out
    if (!goat.eliminated) goat.pendingSpawn = this.safestSpawn(goat);
    this.onRoundEvent?.("kill", { victim: goat.playerIndex, cause, byPlayer });

    if (goat.eliminated) {
      this.fx.popText({ x: goat.pos.x, y: goat.pos.y - 1.3 }, "ELIMINATED!", 0xffffff);
      this.audio.play("cheer", { volume: 0.5 });
    }
  }

  private respawnDueGoats(dt: number) {
    for (const goat of this.goats) {
      if (!goat.dead || goat.eliminated) continue;
      goat.respawnT -= dt;
      if (goat.respawnT <= 0) {
        const sp = goat.pendingSpawn ?? this.safestSpawn(goat);
        goat.respawn(sp.pos, sp.angle);
        this.fx.ring(sp.pos, goat.palette.body, 1.0);
        this.audio.play("blip");
      }
    }
  }

  /** Spawn farthest from living opponents. */
  private safestSpawn(goat: Goat) {
    const foes = this.goats.filter((g) => g !== goat && !g.dead && !g.eliminated);
    let best = this.board.spawnFor(goat.playerIndex);
    let bestScore = -Infinity;
    for (let i = 0; i < this.board.spawns.length; i++) {
      const s = this.board.spawns[i];
      const score = foes.length
        ? Math.min(...foes.map((f) => dist(f.pos, s.pos)))
        : Math.random() * 2;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  /** Goats still contending (alive now, or waiting to respawn with lives). */
  private contenders(): Goat[] {
    return this.goats.filter((g) => !g.eliminated);
  }

  update(dt: number) {
    // ---- intents ----
    const controlling = this.phase === "play";
    for (const goat of this.goats) {
      let intent: Intent = neutralIntent();
      if (controlling && !goat.dead && !goat.eliminated) {
        const pc = this.players[goat.playerIndex];
        if (pc.source.kind === "ai") {
          intent = this.ai.get(pc.index)!.think(goat, this.arena, dt);
        } else {
          intent = this.input.intent(pc.source);
        }
      }
      goat.setIntent(intent);
    }

    let sdt = dt;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      sdt = dt * 0.35;
    }

    // ---- fixed-step simulation ----
    this.physics.step(sdt, () => {
      this.board.fixedStep(this.arena);
      for (const goat of this.goats) goat.fixedStep(this.arena);
    });

    // ---- render sync ----
    for (const goat of this.goats) goat.sync();
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      if (!this.ragdolls[i].update(sdt)) {
        this.ragdolls[i].destroy(this.arena);
        this.ragdolls.splice(i, 1);
      }
    }
    this.board.update(sdt, this.arena);
    this.fx.update(sdt);

    // ---- rules ----
    this.tickPhase(dt);

    // ---- camera ----
    const pts: Vec2[] = this.goats.filter((g) => !g.dead && !g.eliminated).map((g) => g.pos);
    // a fallen goat's return spot stays framed while they wait — the camera
    // never dives onto the survivors only to yank back out at respawn
    if (this.phase === "play") {
      for (const g of this.goats) {
        if (g.dead && !g.eliminated && g.pendingSpawn) pts.push(g.pendingSpawn.pos);
      }
    }
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
      this.respawnDueGoats(dt);
      if (this.playTime > MATCH.suddenDeathAfter) this.board.escalate?.(dt, this.arena);

      const left = this.contenders();
      if (left.length <= 1 && this.goats.length > 1) {
        this.phase = "outro";
        this.phaseT = 0;
        const winner = left.length === 1 ? left[0].playerIndex : -1;
        this.winnerIndex = winner;
        if (winner >= 0) {
          const g = left[0];
          if (!g.dead) this.fx.popText(g.pos, "LAST GOAT STANDING!", g.palette.body);
          this.audio.play("cheer");
        }
      }
      return;
    }
    if (this.phase === "outro") {
      if (this.phaseT >= MATCH.outroTime) {
        this.phase = "done";
        this.onRoundEvent?.("matchOver", this.winnerIndex);
        this.onMatchOver?.(this.winnerIndex);
      }
    }
  }

  winnerIndex = -1;

  resize(w: number, h: number) {
    this.camera.resize(w, h);
    this.bg.resize(w, h);
  }

  destroy() {
    for (const r of this.ragdolls) r.destroy(this.arena);
    this.ragdolls.length = 0;
    this.board.destroy(this.arena);
    for (const g of this.goats) g.destroy(this.arena);
    this.bg.destroy();
    this.world.destroy({ children: true });
    this.physics.destroy();
  }
}
