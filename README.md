# 🐐 Super Goat Man

A local-multiplayer physics brawler for the browser — a goat-flavoured love letter to the
awkward, hilarious ragdoll movement of *Super Bunny Man*. Grab, kick, and headbutt your
friends into lava, off bridges, into sea-urchins, and out of the sky. Bring controllers.

**▶ Play:** https://hoai2k.github.io/supergoatman/ *(live once the Pages deploy finishes)*

## What it is

- **2–4 local players** on one screen, plus **CPU goats** to fill the roster (three skill levels: Chill / Normal / Feral).
- **XBox / gamepad first** (up to 4 pads), with keyboard fallback for two players.
- **VS mode**, last-goat-standing rounds, first to 5 wins.
- Every goat is **recolourable** — pick your bright, silly colour in the lobby.

## Controls

You don't *walk* — you **tumble**. Orient your whole body, then kick to launch. That indirect,
floppy control **is** the game.

| Action | Gamepad | Keyboard P1 | Keyboard P2 |
| --- | --- | --- | --- |
| Roll / tumble | Left stick / D-pad | `A` `D` | `←` `→` |
| Kick (jump / attack / swim) | `A` or `RT` | `Space` | `RShift` / `/` |
| Grab (ledges, balloons, rivals) | `X` / `RB` / `LB` | `LShift` / `E` | `.` / `RCtrl` |
| Pause | `Start` | `Enter` | `\` |

- **Kick** launches you head-first (your legs push off whatever's behind them) — so aim by rotating your body. It also boots rivals, pops balloons, and whips bridges.
- **Grab** latches your hands onto ledges, balloons, or another goat. Grab + kick = fling them.

## The arenas

- **Cloud Nine** — grab balloons to ride the sky, kick balloons to pop them, don't fall into the void (which slowly rises).
- **Wobble Gorge** — a springy rope bridge over a bottomless canyon. Stomp-kick planks to trampoline rivals off the edge.
- **The Deep End** — neutral-buoyancy swimming (each kick is a stroke), scuba tanks, and spiked floor & ceiling to boot rivals into.
- **Cinder Cone** — a crumbly rock shelf over a lake of lava. Kick opponents in. Try not to become fondue.

## The goat

Drawn procedurally in code (no asset files) as a single smooth Super-Bunny-Man-style capsule
body with stubby limbs and a simple face — but with curved **goat horns** where the bunny's ears
would be. It's recoloured natively per player, the collider is kept tight to the body, and the
torso stays anchored while a leg snaps out on a kick.

## Tech

Vite + TypeScript, **PixiJS v8** (WebGL rendering, per-player recolouring, particles),
**Rapier2D** (deterministic, stable physics), Web Gamepad API. All art is drawn procedurally and
all sound is synthesized in the browser — nothing to download.

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

Deploys to GitHub Pages from `main` via `.github/workflows/deploy.yml`.

### Debug shortcuts

Append a hash to the URL to jump straight into a CPU brawl: `#allai`, `#quick`,
`#board=volcano` (`balloon` / `bridge` / `underwater` / `volcano`), or `#solo&board=bridge`
for one keyboard player vs CPUs. `#poses` shows the character art sheet.
