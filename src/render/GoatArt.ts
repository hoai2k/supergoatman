import type { Palette } from "../config";
import { lerpV, type Vec2 } from "../core/math";

/**
 * The goat, drawn in the spirit of Super Bunny Man: ONE smooth plush capsule
 * body (no separate head), stubby limbs, a simple friendly face — and, instead
 * of the bunny's tall ears, a pair of curved goat horns. Recoloured per player.
 *
 * Local frame: +X = head end (face + horns), -X = leg end, +Y = belly/front.
 * Boards spawn goats at angle -pi/2 so they stand upright with horns up. The
 * body is drawn at a FIXED anchor in every frame; only the limbs move, so the
 * torso stays put while a leg snaps out for a kick.
 */

export const ART_PPU = 160;
export const ART_W = 384;
export const ART_H = 236;
export const ANCHOR_PX = { x: 176, y: 110 };
export const ANCHOR = { x: ANCHOR_PX.x / ART_W, y: ANCHOR_PX.y / ART_H };

// body capsule (kept close to the physics collider so hitboxes stay tight)
const BODY_HL = 0.28; // half length along X
const BODY_R = 0.3; // radius (half height)

const HORN_LIGHT = "#efdcaa";
const HORN_MID = "#cdae72";
const HORN_DARK = "#9c7d44";
const HOOF = "#fbfbf7";
const OUTLINE = "rgba(35,22,38,0.55)";

function hex(n: number): string {
  return "#" + (n & 0xffffff).toString(16).padStart(6, "0");
}
function P(x: number, y: number): [number, number] {
  return [ANCHOR_PX.x + x * ART_PPU, ANCHOR_PX.y + y * ART_PPU];
}

function limb(
  ctx: CanvasRenderingContext2D,
  hip: Vec2,
  foot: Vec2,
  width: number,
  color: string,
  dark: string,
) {
  const [hx, hy] = P(hip.x, hip.y);
  const [fx, fy] = P(foot.x, foot.y);
  const w = width * ART_PPU;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(fx, fy);
  ctx.stroke();
  // shaded underside
  ctx.strokeStyle = dark;
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = w * 0.55;
  ctx.beginPath();
  ctx.moveTo(hx, hy + w * 0.16);
  ctx.lineTo(fx, fy + w * 0.16);
  ctx.stroke();
  ctx.globalAlpha = 1;
  // hoof
  ctx.fillStyle = HOOF;
  ctx.beginPath();
  ctx.arc(fx, fy, w * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.arc(fx, fy + w * 0.18, w * 0.46, 0, Math.PI);
  ctx.fill();
}

function bodyPath(ctx: CanvasRenderingContext2D, grow: number) {
  const hl = BODY_HL;
  const r = BODY_R + grow;
  const [x, y] = P(-hl - r, -r);
  const w = (2 * hl + 2 * r) * ART_PPU;
  const h = 2 * r * ART_PPU;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r * ART_PPU);
}

export function renderGoat(pal: Palette, kick: number, grab: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = ART_W;
  cv.height = ART_H;
  const ctx = cv.getContext("2d")!;
  ctx.clearRect(0, 0, ART_W, ART_H);

  const body = hex(pal.body);
  const bodyDark = hex(pal.bodyDark);
  const bodyLight = hex(pal.bodyLight);
  const belly = hex(pal.belly);

  // ---- limb targets ----------------------------------------------------
  // legs (kick) live at the -X end and hang down (+Y); they sweep back on a kick
  const legNear = lerpV({ x: -0.12, y: 0.34 }, { x: -0.86, y: 0.16 }, kick);
  const legFar = lerpV({ x: -0.2, y: 0.33 }, { x: -0.92, y: 0.06 }, kick);
  // arms (grab) live at the +X end and reach forward (+X) on a grab
  const armNear = lerpV({ x: 0.22, y: 0.34 }, { x: 0.84, y: -0.02 }, grab);
  const armFar = lerpV({ x: 0.14, y: 0.33 }, { x: 0.86, y: 0.08 }, grab);

  // ---- far horn + far limbs (behind the body) --------------------------
  drawHorn(ctx, 0.28, -0.16, 0.9, true);
  limb(ctx, { x: -0.2, y: 0.12 }, legFar, 0.16, bodyDark, "#000");
  limb(ctx, { x: 0.16, y: 0.12 }, armFar, 0.16, bodyDark, "#000");

  // ---- tail ------------------------------------------------------------
  {
    const [tx, ty] = P(-0.4, -0.04);
    ctx.fillStyle = bodyLight;
    for (const [dx, dy, r] of [
      [0, 0, 0.12],
      [-0.05, -0.04, 0.09],
      [0.03, -0.06, 0.08],
    ] as const) {
      ctx.beginPath();
      ctx.arc(tx + dx * ART_PPU, ty + dy * ART_PPU, r * ART_PPU, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- body pill -------------------------------------------------------
  {
    // outline
    bodyPath(ctx, 0.02);
    ctx.fillStyle = OUTLINE;
    ctx.fill();
    // shaded fill
    const [cx, cy] = P(-0.02, 0);
    const g = ctx.createRadialGradient(cx - BODY_HL * ART_PPU * 0.4, cy - BODY_R * ART_PPU * 0.7, BODY_R * ART_PPU * 0.2, cx, cy, (BODY_HL + BODY_R) * ART_PPU * 1.15);
    g.addColorStop(0, bodyLight);
    g.addColorStop(0.55, body);
    g.addColorStop(1, bodyDark);
    bodyPath(ctx, 0);
    ctx.fillStyle = g;
    ctx.fill();
    // belly highlight (front-lower)
    const [bx, by] = P(0.05, 0.12);
    const bg = ctx.createRadialGradient(bx, by, 2, bx, by, 0.5 * ART_PPU);
    bg.addColorStop(0, belly);
    bg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    bodyPath(ctx, 0);
    ctx.clip();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(bx, by, 0.5 * ART_PPU, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // soft top rim light
    ctx.save();
    bodyPath(ctx, 0);
    ctx.clip();
    const [rx, ry] = P(0, -BODY_R);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(rx, ry + 0.03 * ART_PPU, (BODY_HL + BODY_R * 0.4) * ART_PPU, 0.09 * ART_PPU, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- near limbs (in front of the body) -------------------------------
  limb(ctx, { x: -0.06, y: 0.12 }, legNear, 0.18, body, bodyDark);
  limb(ctx, { x: 0.26, y: 0.12 }, armNear, 0.18, body, bodyDark);

  // ---- face ------------------------------------------------------------
  {
    // muzzle
    const [mx, my] = P(0.5, 0.06);
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(mx, my, 0.15 * ART_PPU, 0.13 * ART_PPU, 0, 0, Math.PI * 2);
    ctx.fill();
    // nostril + mouth
    ctx.fillStyle = "rgba(60,40,55,0.8)";
    ctx.beginPath();
    ctx.ellipse(mx + 0.08 * ART_PPU, my - 0.02 * ART_PPU, 0.02 * ART_PPU, 0.03 * ART_PPU, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(60,40,55,0.6)";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(mx + 0.06 * ART_PPU, my + 0.05 * ART_PPU);
    ctx.quadraticCurveTo(mx, my + 0.09 * ART_PPU, mx - 0.07 * ART_PPU, my + 0.05 * ART_PPU);
    ctx.stroke();
    // beard tuft
    ctx.fillStyle = "#f3ead6";
    ctx.beginPath();
    const [gx, gy] = P(0.47, 0.2);
    ctx.moveTo(gx - 0.06 * ART_PPU, gy);
    ctx.quadraticCurveTo(gx - 0.02 * ART_PPU, gy + 0.2 * ART_PPU, gx + 0.02 * ART_PPU, gy);
    ctx.quadraticCurveTo(gx + 0.08 * ART_PPU, gy + 0.14 * ART_PPU, gx + 0.09 * ART_PPU, gy - 0.02 * ART_PPU);
    ctx.fill();

    // floppy ear (below the horn)
    const [ex, ey] = P(0.26, -0.08);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(-0.7);
    ctx.fillStyle = bodyDark;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.14 * ART_PPU, 0.07 * ART_PPU, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = belly;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(0.01 * ART_PPU, 0, 0.09 * ART_PPU, 0.04 * ART_PPU, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    // eyes (two, cute 3/4 view looking forward)
    eye(ctx, 0.34, -0.09, 0.052);
    eye(ctx, 0.46, -0.07, 0.06);
  }

  // ---- near horn (in front) -------------------------------------------
  drawHorn(ctx, 0.34, -0.18, 1.0, false);

  return cv;
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const [ex, ey] = P(x, y);
  const rr = r * ART_PPU;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(ex, ey, rr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a1f2e";
  ctx.beginPath();
  ctx.arc(ex + rr * 0.25, ey + rr * 0.1, rr * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(ex + rr * 0.05, ey - rr * 0.25, rr * 0.24, 0, Math.PI * 2);
  ctx.fill();
}

function drawHorn(ctx: CanvasRenderingContext2D, baseX: number, baseY: number, scale: number, far: boolean) {
  // a ridged horn rising from the top of the head, sweeping up and back
  const [x0, y0] = P(baseX, baseY);
  const [x1, y1] = P(baseX - 0.02, baseY - 0.24 * scale);
  const [x2, y2] = P(baseX - 0.18 * scale, baseY - 0.34 * scale);
  const g = ctx.createLinearGradient(x0, y0, x2, y2);
  g.addColorStop(0, HORN_DARK);
  g.addColorStop(0.5, HORN_LIGHT);
  g.addColorStop(1, HORN_MID);
  ctx.strokeStyle = far ? HORN_MID : g;
  ctx.lineCap = "round";
  ctx.lineWidth = 0.12 * scale * ART_PPU;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(x1, y1, x2, y2);
  ctx.stroke();
  if (far) return;
  // ridges
  ctx.strokeStyle = "rgba(110,84,38,0.45)";
  ctx.lineWidth = 2;
  for (let t = 0.3; t < 0.92; t += 0.15) {
    const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * x1 + t * t * x2;
    const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * y1 + t * t * y2;
    ctx.beginPath();
    ctx.arc(px, py, 0.05 * scale * ART_PPU, -0.5, 2.4);
    ctx.stroke();
  }
}
