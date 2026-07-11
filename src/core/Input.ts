import { neutralIntent, type Intent } from "./intent";

/** How a player slot is being driven. */
export type Source =
  | { kind: "gamepad"; index: number }
  | { kind: "keyboard"; scheme: 0 | 1 }
  | { kind: "ai"; level: number };

const DEADZONE = 0.28;

interface KeyScheme {
  left: string[];
  right: string[];
  up: string[];
  down: string[];
  kick: string[];
  grab: string[];
  start: string[];
}

const SCHEMES: KeyScheme[] = [
  {
    left: ["KeyA"],
    right: ["KeyD"],
    up: ["KeyW"],
    down: ["KeyS"],
    kick: ["Space"],
    grab: ["ShiftLeft", "KeyE", "KeyQ"],
    start: ["Enter"],
  },
  {
    left: ["ArrowLeft"],
    right: ["ArrowRight"],
    up: ["ArrowUp"],
    down: ["ArrowDown"],
    kick: ["ShiftRight", "Slash", "Numpad0"],
    grab: ["Period", "ControlRight", "NumpadDecimal"],
    start: ["Backslash"],
  },
];

interface PadSnap {
  axes: number[];
  down: boolean[];
  just: boolean[];
}

export class InputHub {
  private keys = new Set<string>();
  private keyJustBuf = new Set<string>();
  private keyJust = new Set<string>();
  private pads: PadSnap[] = [];
  private prevPadDown: boolean[][] = [];

  constructor() {
    window.addEventListener("keydown", (e) => {
      // don't hijack devtools / refresh
      if (e.metaKey || e.ctrlKey) return;
      this.keys.add(e.code);
      if (!e.repeat) this.keyJustBuf.add(e.code);
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  update() {
    this.keyJust = this.keyJustBuf;
    this.keyJustBuf = new Set();

    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    this.pads = [];
    for (let i = 0; i < gps.length; i++) {
      const gp = gps[i];
      if (!gp) {
        this.pads[i] = { axes: [0, 0, 0, 0], down: [], just: [] };
        continue;
      }
      const down = gp.buttons.map((b) => b.pressed || b.value > 0.4);
      const prev = this.prevPadDown[i] || [];
      const just = down.map((d, j) => d && !prev[j]);
      this.prevPadDown[i] = down;
      this.pads[i] = { axes: [...gp.axes], down, just };
    }
  }

  connectedGamepads(): number[] {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    const out: number[] = [];
    for (let i = 0; i < gps.length; i++) if (gps[i]) out.push(i);
    return out;
  }

  // ---- gameplay intent ---------------------------------------------------
  intent(src: Source): Intent {
    if (src.kind === "gamepad") return this.padIntent(src.index);
    if (src.kind === "keyboard") return this.keyIntent(SCHEMES[src.scheme]);
    return neutralIntent();
  }

  private padIntent(index: number): Intent {
    const p = this.pads[index];
    if (!p) return neutralIntent();
    const lx = dz(p.axes[0] ?? 0);
    let roll = lx;
    if (p.down[14]) roll = -1; // dpad left
    if (p.down[15]) roll = 1; // dpad right
    const kick = !!(p.down[0] || p.down[7]); // A or RT
    const grab = !!(p.down[2] || p.down[5] || p.down[4] || p.down[6]); // X / RB / LB / LT
    const butt = !!p.down[3]; // Y — headbutt
    const precise = !!p.down[1]; // B — slow, fine rotation
    return { roll, aimX: dz(p.axes[2] ?? 0), aimY: dz(p.axes[3] ?? 0), kick, grab, butt, precise };
  }

  private keyIntent(s: KeyScheme): Intent {
    const on = (codes: string[]) => codes.some((c) => this.keys.has(c));
    const roll = (on(s.right) ? 1 : 0) - (on(s.left) ? 1 : 0);
    return {
      roll,
      aimX: 0,
      aimY: (on(s.down) ? 1 : 0) - (on(s.up) ? 1 : 0),
      kick: on(s.kick),
      grab: on(s.grab),
      butt: on(s.up), // W / ↑ — headbutt
      precise: on(s.down), // S / ↓ — slow, fine rotation
    };
  }

  // ---- menu navigation (edge-triggered) ----------------------------------
  nav(src: Source) {
    if (src.kind === "gamepad") {
      const p = this.pads[src.index];
      if (!p) return NAV0;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      return {
        confirm: !!(p.just[0] || p.just[9]),
        back: !!(p.just[1] || p.just[8]),
        start: !!p.just[9],
        left: p.just[14] || this.axisEdge(src.index, 0, -1, ax),
        right: p.just[15] || this.axisEdge(src.index, 0, 1, ax),
        up: p.just[12] || this.axisEdge(src.index, 1, -1, ay),
        down: p.just[13] || this.axisEdge(src.index, 1, 1, ay),
      };
    }
    if (src.kind === "keyboard") {
      const s = SCHEMES[src.scheme];
      const j = (codes: string[]) => codes.some((c) => this.keyJust.has(c));
      return {
        confirm: j(s.kick) || j(s.start),
        back: this.keyJust.has("Escape"),
        start: j(s.start),
        left: j(s.left),
        right: j(s.right),
        up: j(s.up),
        down: j(s.down),
      };
    }
    return NAV0;
  }

  // simple axis "just crossed threshold" edge tracking
  private axisState = new Map<string, boolean>();
  private axisEdge(pad: number, axis: number, sign: number, value: number): boolean {
    const key = `${pad}:${axis}:${sign}`;
    const active = sign > 0 ? value > 0.6 : value < -0.6;
    const was = this.axisState.get(key) || false;
    this.axisState.set(key, active);
    return active && !was;
  }

  // global "any confirm" for the title screen
  anyKeyJust(): boolean {
    return this.keyJust.size > 0 || this.pads.some((p) => p && p.just.some(Boolean));
  }
}

const NAV0 = { confirm: false, back: false, start: false, left: false, right: false, up: false, down: false };

function dz(x: number): number {
  const a = Math.abs(x);
  if (a < DEADZONE) return 0;
  return Math.sign(x) * ((a - DEADZONE) / (1 - DEADZONE));
}

const BLOCK_DEFAULT = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Slash",
  "Enter",
  "ShiftRight",
]);
