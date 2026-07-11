import { Application } from "pixi.js";
import { initRapier } from "./core/rapier";
import { loadAssets } from "./render/assets";
import { Game } from "./core/Game";
import { TitleScreen } from "./ui/TitleScreen";
import { LobbyScreen } from "./ui/Lobby";
import { BoardSelectScreen } from "./ui/BoardSelect";
import { MatchScreen } from "./ui/MatchScreen";
import { ResultsScreen } from "./ui/Results";

async function boot() {
  await Promise.all([initRapier(), loadAssets()]);
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

  // ---- fullscreen toggle (button + F key) ----
  const fsBtn = document.createElement("button");
  fsBtn.textContent = "⛶";
  fsBtn.title = "Fullscreen (F)";
  fsBtn.style.cssText =
    "position:fixed;top:10px;right:10px;z-index:10;width:44px;height:44px;" +
    "font-size:24px;line-height:1;color:#fff6e9;background:rgba(28,22,48,0.72);" +
    "border:2px solid rgba(255,246,233,0.35);border-radius:10px;cursor:pointer;" +
    "user-select:none;transition:opacity .2s;opacity:0.7;";
  fsBtn.onmouseenter = () => (fsBtn.style.opacity = "1");
  fsBtn.onmouseleave = () => (fsBtn.style.opacity = "0.7");
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    fsBtn.blur(); // give key focus back to the game
  };
  fsBtn.onclick = toggleFullscreen;
  document.addEventListener("fullscreenchange", () => {
    fsBtn.textContent = document.fullscreenElement ? "🗗" : "⛶";
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyF" && !e.repeat && !e.metaKey && !e.ctrlKey) toggleFullscreen();
  });
  document.body.appendChild(fsBtn);

  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    game.update(dt);
  });

  (window as unknown as { __game: Game }).__game = game;
  console.log("Super Goat Man ready");
}

async function showPoses(app: Application) {
  const { Container, Sprite, Text } = await import("pixi.js");
  const { getSkin } = await import("./render/GoatSprites");
  const { PALETTES } = await import("./config");
  const root = new Container();
  app.stage.addChild(root);
  // columns: palettes; rows: neutral frame, kick frame, ragdoll parts spread
  PALETTES.forEach((pal, i) => {
    const skin = getSkin(pal);
    const x = 110 + i * 155;
    for (const [j, frame] of [skin.neutral, skin.kick].entries()) {
      const s = new Sprite(frame.tex);
      s.anchor.set(frame.anchor.x, frame.anchor.y);
      s.scale.set(0.22);
      s.position.set(x, 130 + j * 170);
      root.addChild(s);
    }
    skin.parts.forEach((part, k) => {
      const s = new Sprite(part.tex);
      s.anchor.set(0.5);
      s.scale.set(0.2);
      s.position.set(x + (k % 2) * 60 - 30, 440 + Math.floor(k / 2) * 90);
      root.addChild(s);
    });
    const t = new Text({ text: pal.name, style: { fill: 0xffffff, fontSize: 15, fontWeight: "800", fontFamily: "system-ui" } });
    t.anchor.set(0.5);
    t.position.set(x, 30);
    root.addChild(t);
  });
  const hint = new Text({ text: "rows: neutral / kick / ragdoll parts", style: { fill: 0x9a90b0, fontSize: 18, fontFamily: "system-ui" } });
  hint.position.set(20, app.screen.height - 30);
  root.addChild(hint);
}

boot();
