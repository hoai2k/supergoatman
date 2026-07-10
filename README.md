# 🐐 Super Goat Man

A local-multiplayer physics brawler for the browser — a goat-flavoured love letter to the
awkward, hilarious ragdoll movement of *Super Bunny Man*. Grab, kick, and headbutt your
friends into lava, off bridges, into sea-urchins, and out of the sky. Bring controllers.

**▶ Play:** https://hoai2k.github.io/supergoatman/ *(live once the Pages deploy finishes)*

## What it is

- **2–4 local players** on one screen, plus **CPU goats** to fill the roster (three skill levels: Chill / Normal / Feral).
- **XBox / gamepad first** (up to 4 pads), with keyboard fallback for two players.
- **VS mode**: every goat has **9 lives**. Lose one and you ragdoll apart, then respawn — until you're out. Last goat standing wins.
- Ways to die: booted square in the **head**, shoved into the **deadly obstacles** at every arena's edges (spears, urchins, stakes, molten glass), the arena's own specialty (lava, the void, the canyon) — or held by the scruff and **twisted** until physics gives up on you.
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

Each arena is a painted backdrop with physics colliders matched to the scenery, and themed
deadly obstacles guarding the far left and right edges.

- **Cloud Nine** — cloud platforms in a balloon festival. Grab balloons to ride the sky, kick them to pop. Ceremonial spears line the walls.
- **Wobble Gorge** — a springy plank bridge over a canyon. Stomp-kick planks to trampoline rivals; sharpened stakes wait on the cliff tops.
- **The Deep End** — neutral-buoyancy reef swimming (each kick is a stroke) with scuba tanks. Urchin colonies own the walls.
- **Cinder Cone** — basalt islands in a lava lake, bracketed by molten obsidian shards. Try not to become fondue.

## The goat

The character is a painted plush goat (neutral + kicking poses). Each player's colour is made
by hue-rotating the plush pixels so all the soft shading survives; horns, hooves, and muzzle
stay untouched. The physics collider is a **convex hull traced from the sprite's silhouette**,
and the kick frame is anchored so the head/torso stay planted while the legs stretch out.
On death the same sprite is cut into head/torso/legs and reassembled as a jointed ragdoll at
the exact same position — so the goat falls apart mid-air without a visual pop.

## Tech

Vite + TypeScript, **PixiJS v8** (WebGL rendering, per-player recolouring, particles),
**Rapier2D** (deterministic, stable physics), Web Gamepad API. Backgrounds, character, and
hazards are painted assets in `assets/`; sound is synthesized in the browser.

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
