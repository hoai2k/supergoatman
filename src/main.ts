import { Application } from "pixi.js";
import { initRapier } from "./core/rapier";
import { Game } from "./core/Game";
import { TitleScreen } from "./ui/TitleScreen";
import { LobbyScreen } from "./ui/Lobby";
import { BoardSelectScreen } from "./ui/BoardSelect";
import { MatchScreen } from "./ui/MatchScreen";
import { ResultsScreen } from "./ui/Results";

async function boot() {
  await initRapier();
  const app = new Application();
  await app.init({
    background: "#171226",
    resizeTo: window,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  });
  document.getElementById("app")!.appendChild(app.canvas);

  if (location.hash.includes("poses")) {
    await showPoses(app);
    return;
  }

  const game = new Game(app);
  game.makeTitle = (g) => new TitleScreen(g);
  game.makeLobby = (g) => new LobbyScreen(g);
  game.makeBoardSelect = (g) => new BoardSelectScreen(g);
  game.makeMatch = (g) => new MatchScreen(g);
  game.makeResults = (g, w) => new ResultsScreen(g, w);

  // debug shortcut: #quick / #allai / #board=volcano jumps straight into a CPU brawl
  const h = location.hash;
  const boardMatch = h.match(/board=(\w+)/);
  if (h.includes("quick") || h.includes("allai") || boardMatch) {
    if (boardMatch) game.session.boardId = boardMatch[1];
    game.session.difficulty = 2;
    game.session.slots.forEach((s, i) => {
      s.active = true;
      s.isCPU = i >= (h.includes("solo") ? 1 : 0);
      s.source = s.isCPU ? null : { kind: "keyboard", scheme: i as 0 | 1 };
    });
    game.toMatch();
  } else {
    game.toTitle();
  }

  app.renderer.on("resize", (w: number, h: number) => game.resize(w, h));
  game.resize(app.screen.width, app.screen.height);

  const startAudio = () => game.audio.resume();
  window.addEventListener("pointerdown", startAudio, { once: true });
  window.addEventListener("keydown", startAudio, { once: true });

  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    game.update(dt);
  });

  (window as unknown as { __game: Game }).__game = game;
  console.log("Super Goat Man ready");
}

async function showPoses(app: Application) {
  const { Container, Sprite, Texture, Text } = await import("pixi.js");
  const { renderGoat, ANCHOR } = await import("./render/GoatArt");
  const { PALETTES } = await import("./config");
  const root = new Container();
  app.stage.addChild(root);
  const poses: [string, number, number][] = [
    ["neutral", 0, 0],
    ["kick", 1, 0],
    ["grab", 0, 1],
    ["both", 1, 1],
  ];
  const rots = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]; // upright, lying, etc.
  poses.forEach(([label, k, g], i) => {
    const pal = PALETTES[i * 2];
    rots.forEach((rot, j) => {
      const s = new Sprite(Texture.from(renderGoat(pal, k, g)));
      s.anchor.set(ANCHOR.x, ANCHOR.y);
      s.scale.set(1.4);
      s.rotation = rot;
      s.position.set(200 + i * 300, 180 + j * 150);
      root.addChild(s);
    });
    const t = new Text({ text: label, style: { fill: 0xffffff, fontSize: 22, fontWeight: "800", fontFamily: "system-ui" } });
    t.anchor.set(0.5);
    t.position.set(200 + i * 300, 40);
    root.addChild(t);
  });
  const hint = new Text({ text: "rows: upright / lying / inverted / backwards", style: { fill: 0x9a90b0, fontSize: 18, fontFamily: "system-ui" } });
  hint.position.set(20, app.screen.height - 30);
  root.addChild(hint);
}

boot();
