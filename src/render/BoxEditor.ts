import { Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { Match } from "../core/Match";
import { drawThemedBox, type EditRect } from "../boards/Board";

type DragMode = { l: boolean; r: boolean; t: boolean; b: boolean; move: boolean };

const BTN_STYLE = {
  position: "fixed",
  top: "12px",
  zIndex: "20",
  font: "700 14px system-ui, sans-serif",
  color: "#fff8ea",
  background: "#2b2233cc",
  border: "2px solid #ffee33",
  borderRadius: "10px",
  padding: "8px 12px",
  cursor: "pointer",
} as const;

/**
 * ?edit=bb — the platform surveyor. Every axis-aligned solid the board laid
 * down (minus the arena shell) becomes a live-editable box: drag an edge or
 * corner to resize, drag the middle to move, click to select, Delete to
 * remove. "+" adds a fresh box of the chosen type at the board's centre —
 * including "visible" boxes rendered in the board's own terrain colours.
 * The Rapier collider updates in real time, and "⬇ export platforms"
 * downloads a JSON of the tuned boxes (arena-art pixels + world units +
 * flags, in build order) ready to paste back into the board's source.
 */
export class BoxEditor {
  gfx = new Graphics();
  private rects: EditRect[];
  private hover: { rect: EditRect; mode: DragMode } | null = null;
  private selected: EditRect | null = null;
  private drag: {
    rect: EditRect;
    mode: DragMode;
    startWx: number;
    startWy: number;
    orig: { x0: number; y0: number; x1: number; y1: number };
  } | null = null;
  private exportBtn: HTMLButtonElement;
  private addBtn: HTMLButtonElement;
  private typeSel: HTMLSelectElement;
  private onDown: (e: PointerEvent) => void;
  private onMove: (e: PointerEvent) => void;
  private onUp: () => void;
  private onKey: (e: KeyboardEvent) => void;

  constructor(
    private match: Match,
    private boardId: string,
  ) {
    this.gfx.zIndex = 10000;
    match.world.addChild(this.gfx);
    this.rects = match.board.editRects.filter((r) => !r.shell);

    // ---- toolbar: [type ▾][+]  [⬇ export platforms] --------------------
    this.exportBtn = document.createElement("button");
    this.exportBtn.textContent = "⬇ export platforms";
    Object.assign(this.exportBtn.style, BTN_STYLE, { right: "64px" });
    this.exportBtn.addEventListener("click", () => {
      this.export();
      this.exportBtn.blur();
    });

    this.typeSel = document.createElement("select");
    for (const [v, label] of [
      ["solid", "solid"],
      ["oneway", "one-way"],
      ["visible", "visible"],
      ["visible-oneway", "visible one-way"],
    ]) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = label;
      this.typeSel.appendChild(o);
    }
    Object.assign(this.typeSel.style, BTN_STYLE, { right: "292px", cursor: "pointer" });

    this.addBtn = document.createElement("button");
    this.addBtn.textContent = "+";
    this.addBtn.title = "Add a box of the chosen type at the board centre";
    Object.assign(this.addBtn.style, BTN_STYLE, { right: "236px", width: "44px", fontSize: "20px" });
    this.addBtn.addEventListener("click", () => {
      this.addBox(this.typeSel.value);
      this.addBtn.blur();
    });

    document.body.append(this.typeSel, this.addBtn, this.exportBtn);

    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = () => (this.drag = null);
    this.onKey = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (this.selected) {
          e.preventDefault();
          this.deleteRect(this.selected);
        }
      } else if (e.key === "Escape") {
        this.selected = null;
      }
    };
    window.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("keydown", this.onKey);
  }

  // ---- coordinate plumbing -------------------------------------------------
  private toWorld(e: PointerEvent): { x: number; y: number } {
    const cam = this.match.camera;
    return {
      x: (e.clientX - cam.vw / 2) / cam.pixelZoom + cam.center.x,
      y: (e.clientY - cam.vh / 2) / cam.pixelZoom + cam.center.y,
    };
  }

  /** Edge-grab threshold in world units (~10 screen px). */
  private edgeTh(): number {
    return Math.max(0.06, 10 / this.match.camera.pixelZoom);
  }

  private hitTest(wx: number, wy: number): { rect: EditRect; mode: DragMode } | null {
    const th = this.edgeTh();
    let best: { rect: EditRect; mode: DragMode; score: number } | null = null;
    for (const r of this.rects) {
      const inX = wx > r.x0 - th && wx < r.x1 + th;
      const inY = wy > r.y0 - th && wy < r.y1 + th;
      if (!inX || !inY) continue;
      const l = Math.abs(wx - r.x0) < th;
      const rr = Math.abs(wx - r.x1) < th;
      const t = Math.abs(wy - r.y0) < th;
      const b = Math.abs(wy - r.y1) < th;
      const inside = wx > r.x0 + th && wx < r.x1 - th && wy > r.y0 + th && wy < r.y1 - th;
      if (!l && !rr && !t && !b && !inside) continue;
      const mode: DragMode = { l, r: rr, t, b, move: inside };
      const area = (r.x1 - r.x0) * (r.y1 - r.y0);
      // prefer edge grabs over interior moves, then the smallest box
      const score = area - (mode.move ? 0 : 1e6);
      if (!best || score < best.score) best = { rect: r, mode, score };
    }
    return best ? { rect: best.rect, mode: best.mode } : null;
  }

  private pointerDown(e: PointerEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "BUTTON" || tag === "SELECT" || tag === "OPTION") return;
    const w = this.toWorld(e);
    const hit = this.hitTest(w.x, w.y);
    this.selected = hit?.rect ?? null;
    if (!hit) return;
    e.preventDefault();
    this.drag = {
      rect: hit.rect,
      mode: hit.mode,
      startWx: w.x,
      startWy: w.y,
      orig: { x0: hit.rect.x0, y0: hit.rect.y0, x1: hit.rect.x1, y1: hit.rect.y1 },
    };
  }

  private pointerMove(e: PointerEvent) {
    const w = this.toWorld(e);
    if (!this.drag) {
      this.hover = this.hitTest(w.x, w.y);
      const m = this.hover?.mode;
      document.body.style.cursor = !m
        ? ""
        : m.move
          ? "move"
          : (m.l || m.r) && (m.t || m.b)
            ? "nwse-resize"
            : m.l || m.r
              ? "ew-resize"
              : "ns-resize";
      return;
    }
    const d = this.drag;
    const dx = w.x - d.startWx;
    const dy = w.y - d.startWy;
    const r = d.rect;
    const MIN = 0.15;
    if (d.mode.move) {
      const wdt = d.orig.x1 - d.orig.x0;
      const hgt = d.orig.y1 - d.orig.y0;
      r.x0 = d.orig.x0 + dx;
      r.x1 = r.x0 + wdt;
      r.y0 = d.orig.y0 + dy;
      r.y1 = r.y0 + hgt;
    } else {
      if (d.mode.l) r.x0 = Math.min(d.orig.x0 + dx, r.x1 - MIN);
      if (d.mode.r) r.x1 = Math.max(d.orig.x1 + dx, r.x0 + MIN);
      if (d.mode.t) r.y0 = Math.min(d.orig.y0 + dy, r.y1 - MIN);
      if (d.mode.b) r.y1 = Math.max(d.orig.y1 + dy, r.y0 + MIN);
    }
    this.applyToPhysics(r);
  }

  /** Push the edited box into the live Rapier world (and its rendering). */
  private applyToPhysics(r: EditRect) {
    r.body.setTranslation(new RAPIER.Vector2((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), true);
    // setShape (not setHalfExtents): it also replaces the collider's cached
    // JS-side shape, which refreshOneWay and the debug overlay read
    r.collider.setShape(new RAPIER.Cuboid((r.x1 - r.x0) / 2, (r.y1 - r.y0) / 2));
    this.match.physics.refreshOneWay(r.collider);
    if (r.gfx) drawThemedBox(r.gfx, r.x0, r.y0, r.x1, r.y1, this.match.board.theme);
  }

  // ---- add / delete ----------------------------------------------------------
  private addBox(type: string) {
    const b = this.match.board.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    this.match.board.solidRect(this.match.arena, cx - 1.6, cy - 0.35, cx + 1.6, cy + 0.35, {
      oneWay: type.includes("oneway"),
      visible: type.includes("visible"),
    });
    const fresh = this.match.board.editRects[this.match.board.editRects.length - 1];
    this.rects.push(fresh);
    this.selected = fresh;
  }

  private deleteRect(r: EditRect) {
    this.match.physics.dropOneWay(r.collider.handle);
    this.match.physics.world.removeRigidBody(r.body); // takes the collider with it
    r.gfx?.destroy();
    const bi = this.match.board.editRects.indexOf(r);
    if (bi >= 0) this.match.board.editRects.splice(bi, 1);
    const ri = this.rects.indexOf(r);
    if (ri >= 0) this.rects.splice(ri, 1);
    if (this.selected === r) this.selected = null;
    if (this.hover?.rect === r) this.hover = null;
    if (this.drag?.rect === r) this.drag = null;
  }

  // ---- export ---------------------------------------------------------------
  private export() {
    const board = this.match.board;
    const platforms = this.rects.map((r, i) => {
      const a = board.pxOf(r.x0, r.y0);
      const b = board.pxOf(r.x1, r.y1);
      return {
        index: i,
        oneWay: r.oneWay,
        visible: r.visible,
        px: [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)],
        world: [+r.x0.toFixed(3), +r.y0.toFixed(3), +r.x1.toFixed(3), +r.y1.toFixed(3)],
      };
    });
    const json = JSON.stringify({ board: this.boardId, arenaPx: [1672, 941], platforms }, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `platforms_${this.boardId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Redraw every frame (boxes shift, camera moves, goats interfere). */
  update() {
    const g = this.gfx;
    g.clear();
    const th = this.edgeTh();
    for (const r of this.rects) {
      const active = this.drag?.rect === r;
      const hovered = !active && this.hover?.rect === r;
      const isSel = this.selected === r;
      const base = r.oneWay ? 0xffee33 : 0x33ff88;
      const color = active || isSel ? 0x00eaff : hovered ? 0xffffff : base;
      g.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0).fill({ color: base, alpha: active ? 0.16 : 0.07 });
      g.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0).stroke({
        width: th * (isSel ? 0.75 : 0.5),
        color,
        alpha: 0.95,
      });
      // corner + edge-midpoint handles
      const hs = th * 0.8;
      const cx = (r.x0 + r.x1) / 2;
      const cy = (r.y0 + r.y1) / 2;
      for (const [hx, hy] of [
        [r.x0, r.y0], [r.x1, r.y0], [r.x0, r.y1], [r.x1, r.y1],
        [cx, r.y0], [cx, r.y1], [r.x0, cy], [r.x1, cy],
      ]) {
        g.rect(hx - hs / 2, hy - hs / 2, hs, hs).fill({ color, alpha: 0.9 });
      }
    }
  }

  destroy() {
    window.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    document.body.style.cursor = "";
    this.exportBtn.remove();
    this.addBtn.remove();
    this.typeSel.remove();
    this.gfx.destroy();
  }
}
