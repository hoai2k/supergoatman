import { Graphics } from "pixi.js";
import { RAPIER } from "../core/rapier";
import type { Match } from "../core/Match";
import { drawThemedBox, type EditRect, type HazardZone } from "../boards/Board";

type DragMode = { l: boolean; r: boolean; t: boolean; b: boolean; move: boolean };
/** Anything the surveyor can grab: a collider-backed box or a lethal zone. */
type EditItem = EditRect | HazardZone;
type Bounds = { x0: number; y0: number; x1: number; y1: number };

const isBox = (it: EditItem): it is EditRect => "collider" in it;

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
 * down (minus the arena shell) AND every lethal hazard zone becomes a
 * live-editable box: drag an edge or corner to resize, drag the middle to
 * move, click to select, Delete to remove. "+" adds a fresh item of the
 * chosen type at the board's centre — including "visible" boxes rendered in
 * the board's terrain colours and fresh hazard zones. Wheel zooms about the
 * cursor, dragging empty space pans, ⤢ refits the whole board.
 * "⬇ export platforms" downloads a JSON of the tuned platforms AND hazards
 * (arena-art pixels + world units, in build order) for the board's source.
 */
export class BoxEditor {
  gfx = new Graphics();
  private rects: EditRect[];
  private zones: HazardZone[];
  private hover: { item: EditItem; mode: DragMode } | null = null;
  private selected: EditItem | null = null;
  private drag: {
    item: EditItem;
    mode: DragMode;
    startWx: number;
    startWy: number;
    orig: Bounds;
  } | null = null;
  private pan: { lastX: number; lastY: number } | null = null;
  private exportBtn: HTMLButtonElement;
  private addBtn: HTMLButtonElement;
  private fitBtn: HTMLButtonElement;
  private typeSel: HTMLSelectElement;
  private onDown: (e: PointerEvent) => void;
  private onMove: (e: PointerEvent) => void;
  private onUp: () => void;
  private onKey: (e: KeyboardEvent) => void;
  private onWheel: (e: WheelEvent) => void;

  constructor(
    private match: Match,
    private boardId: string,
  ) {
    this.gfx.zIndex = 10000;
    match.world.addChild(this.gfx);
    this.rects = match.board.editRects.filter((r) => !r.shell);
    this.zones = match.board.hazardZones; // live — additions/removals count

    // ---- toolbar: [type ▾][+][⤢]  [⬇ export platforms] -----------------
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
      ["hazard", "hazard"],
    ]) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = label;
      this.typeSel.appendChild(o);
    }
    Object.assign(this.typeSel.style, BTN_STYLE, { right: "348px", cursor: "pointer" });

    this.addBtn = document.createElement("button");
    this.addBtn.textContent = "+";
    this.addBtn.title = "Add an item of the chosen type at the board centre";
    Object.assign(this.addBtn.style, BTN_STYLE, { right: "292px", width: "44px", fontSize: "20px" });
    this.addBtn.addEventListener("click", () => {
      this.addItem(this.typeSel.value);
      this.addBtn.blur();
    });

    this.fitBtn = document.createElement("button");
    this.fitBtn.textContent = "⤢";
    this.fitBtn.title = "Fit the whole board (Home / 0)";
    Object.assign(this.fitBtn.style, BTN_STYLE, { right: "236px", width: "44px", fontSize: "18px" });
    this.fitBtn.addEventListener("click", () => {
      this.match.camera.manual = false;
      this.fitBtn.blur();
    });

    document.body.append(this.typeSel, this.addBtn, this.fitBtn, this.exportBtn);

    this.onDown = (e) => this.pointerDown(e);
    this.onMove = (e) => this.pointerMove(e);
    this.onUp = () => {
      this.drag = null;
      this.pan = null;
    };
    this.onKey = (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (this.selected) {
          e.preventDefault();
          this.deleteItem(this.selected);
        }
      } else if (e.key === "Escape") {
        this.selected = null;
      } else if (e.key === "Home" || e.key === "0") {
        this.match.camera.manual = false; // back to the full-board view
      }
    };
    this.onWheel = (e) => this.wheel(e);
    window.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("wheel", this.onWheel, { passive: false });
  }

  // ---- unified bounds over boxes and zones ---------------------------------
  private bounds(it: EditItem): Bounds {
    return isBox(it)
      ? { x0: it.x0, y0: it.y0, x1: it.x1, y1: it.y1 }
      : { x0: it.minX, y0: it.minY, x1: it.maxX, y1: it.maxY };
  }

  private setBounds(it: EditItem, b: Bounds) {
    if (isBox(it)) {
      it.x0 = b.x0;
      it.y0 = b.y0;
      it.x1 = b.x1;
      it.y1 = b.y1;
      this.applyToPhysics(it);
    } else {
      it.minX = b.x0;
      it.minY = b.y0;
      it.maxX = b.x1;
      it.maxY = b.y1;
    }
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

  /** Wheel / trackpad pinch: zoom about the cursor. */
  private wheel(e: WheelEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "SELECT" || tag === "BUTTON") return;
    e.preventDefault();
    const cam = this.match.camera;
    const ppu = cam.pixelZoom / cam.zoom;
    const b = this.match.board.bounds;
    const fit = Math.min(cam.vw / ((b.maxX - b.minX) * ppu), cam.vh / ((b.maxY - b.minY) * ppu));
    const factor = Math.min(1.3, Math.max(0.75, Math.exp(-e.deltaY * 0.0014)));
    const z = Math.min(8, Math.max(fit * 0.55, cam.zoom * factor));
    const pzOld = cam.pixelZoom;
    const pzNew = ppu * z;
    // keep the world point under the cursor pinned while the scale changes
    const wx = (e.clientX - cam.vw / 2) / pzOld + cam.center.x;
    const wy = (e.clientY - cam.vh / 2) / pzOld + cam.center.y;
    cam.manual = true;
    cam.setView(wx - (e.clientX - cam.vw / 2) / pzNew, wy - (e.clientY - cam.vh / 2) / pzNew, z);
  }

  private hitTest(wx: number, wy: number): { item: EditItem; mode: DragMode } | null {
    const th = this.edgeTh();
    let best: { item: EditItem; mode: DragMode; score: number } | null = null;
    for (const it of [...this.rects, ...this.zones] as EditItem[]) {
      const r = this.bounds(it);
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
      // prefer edge grabs over interior moves, then the smallest item
      const score = area - (mode.move ? 0 : 1e6);
      if (!best || score < best.score) best = { item: it, mode, score };
    }
    return best ? { item: best.item, mode: best.mode } : null;
  }

  private pointerDown(e: PointerEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "BUTTON" || tag === "SELECT" || tag === "OPTION") return;
    const w = this.toWorld(e);
    const hit = this.hitTest(w.x, w.y);
    this.selected = hit?.item ?? null;
    if (!hit) {
      // empty space: grab the board itself and drag the view around
      this.pan = { lastX: e.clientX, lastY: e.clientY };
      document.body.style.cursor = "grabbing";
      return;
    }
    e.preventDefault();
    this.drag = {
      item: hit.item,
      mode: hit.mode,
      startWx: w.x,
      startWy: w.y,
      orig: this.bounds(hit.item),
    };
  }

  private pointerMove(e: PointerEvent) {
    if (this.pan) {
      const cam = this.match.camera;
      cam.manual = true;
      cam.setView(
        cam.center.x - (e.clientX - this.pan.lastX) / cam.pixelZoom,
        cam.center.y - (e.clientY - this.pan.lastY) / cam.pixelZoom,
        cam.zoom,
      );
      this.pan.lastX = e.clientX;
      this.pan.lastY = e.clientY;
      return;
    }
    const w = this.toWorld(e);
    if (!this.drag) {
      this.hover = this.hitTest(w.x, w.y);
      const m = this.hover?.mode;
      document.body.style.cursor = !m
        ? "grab"
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
    const b: Bounds = this.bounds(d.item);
    const MIN = 0.15;
    if (d.mode.move) {
      const wdt = d.orig.x1 - d.orig.x0;
      const hgt = d.orig.y1 - d.orig.y0;
      b.x0 = d.orig.x0 + dx;
      b.x1 = b.x0 + wdt;
      b.y0 = d.orig.y0 + dy;
      b.y1 = b.y0 + hgt;
    } else {
      if (d.mode.l) b.x0 = Math.min(d.orig.x0 + dx, b.x1 - MIN);
      if (d.mode.r) b.x1 = Math.max(d.orig.x1 + dx, b.x0 + MIN);
      if (d.mode.t) b.y0 = Math.min(d.orig.y0 + dy, b.y1 - MIN);
      if (d.mode.b) b.y1 = Math.max(d.orig.y1 + dy, b.y0 + MIN);
    }
    this.setBounds(d.item, b);
  }

  /** Push an edited box into the live Rapier world (and its rendering). */
  private applyToPhysics(r: EditRect) {
    r.body.setTranslation(new RAPIER.Vector2((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2), true);
    // setShape (not setHalfExtents): it also replaces the collider's cached
    // JS-side shape, which refreshOneWay and the debug overlay read
    r.collider.setShape(new RAPIER.Cuboid((r.x1 - r.x0) / 2, (r.y1 - r.y0) / 2));
    this.match.physics.refreshOneWay(r.collider);
    if (r.gfx) drawThemedBox(r.gfx, r.x0, r.y0, r.x1, r.y1, this.match.board.theme);
  }

  // ---- add / delete ----------------------------------------------------------
  private addItem(type: string) {
    const b = this.match.board.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    if (type === "hazard") {
      const zone: HazardZone = {
        minX: cx - 1.6,
        minY: cy - 0.35,
        maxX: cx + 1.6,
        maxY: cy + 0.35,
        label: ["SKEWERED", "POKED", "PERFORATED"],
        fx: "impact",
        sfx: "thud",
      };
      this.match.board.hazardZones.push(zone);
      this.selected = zone;
      return;
    }
    this.match.board.solidRect(this.match.arena, cx - 1.6, cy - 0.35, cx + 1.6, cy + 0.35, {
      oneWay: type.includes("oneway"),
      visible: type.includes("visible"),
    });
    const fresh = this.match.board.editRects[this.match.board.editRects.length - 1];
    this.rects.push(fresh);
    this.selected = fresh;
  }

  private deleteItem(it: EditItem) {
    if (isBox(it)) {
      this.match.physics.dropOneWay(it.collider.handle);
      this.match.physics.world.removeRigidBody(it.body); // takes the collider with it
      it.gfx?.destroy();
      const bi = this.match.board.editRects.indexOf(it);
      if (bi >= 0) this.match.board.editRects.splice(bi, 1);
      const ri = this.rects.indexOf(it);
      if (ri >= 0) this.rects.splice(ri, 1);
    } else {
      const zi = this.zones.indexOf(it);
      if (zi >= 0) this.zones.splice(zi, 1);
    }
    if (this.selected === it) this.selected = null;
    if (this.hover?.item === it) this.hover = null;
    if (this.drag?.item === it) this.drag = null;
  }

  // ---- export ---------------------------------------------------------------
  private export() {
    const board = this.match.board;
    const rect = (bnds: Bounds) => {
      const a = board.pxOf(bnds.x0, bnds.y0);
      const b = board.pxOf(bnds.x1, bnds.y1);
      return {
        px: [Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y)],
        world: [+bnds.x0.toFixed(3), +bnds.y0.toFixed(3), +bnds.x1.toFixed(3), +bnds.y1.toFixed(3)],
      };
    };
    const platforms = this.rects.map((r, i) => ({
      index: i,
      oneWay: r.oneWay,
      visible: r.visible,
      ...rect(this.bounds(r)),
    }));
    const hazards = this.zones.map((z, i) => ({
      index: i,
      labels: z.label,
      ...rect(this.bounds(z)),
    }));
    const json = JSON.stringify(
      { board: this.boardId, arenaPx: [1672, 941], platforms, hazards },
      null,
      2,
    );
    const blob = new Blob([json], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `platforms_${this.boardId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /** Redraw every frame (items shift, camera moves, goats interfere). */
  update() {
    const g = this.gfx;
    g.clear();
    const th = this.edgeTh();
    for (const it of [...this.rects, ...this.zones] as EditItem[]) {
      const r = this.bounds(it);
      const active = this.drag?.item === it;
      const hovered = !active && this.hover?.item === it;
      const isSel = this.selected === it;
      const base = isBox(it) ? (it.oneWay ? 0xffee33 : 0x33ff88) : 0xff3355;
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
    window.removeEventListener("wheel", this.onWheel);
    document.body.style.cursor = "";
    this.match.camera.manual = false;
    this.exportBtn.remove();
    this.addBtn.remove();
    this.fitBtn.remove();
    this.typeSel.remove();
    this.gfx.destroy();
  }
}
