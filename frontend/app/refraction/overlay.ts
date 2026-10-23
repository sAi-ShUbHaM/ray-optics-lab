import { canvasFont, tcol } from "@/lib/canvasTheme";
import { fmt, type RefractionVectors, type Vec } from "./vectors";

type Point = [number, number];
type ToCanvas = (p: Point) => Point;

function arrowHead(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  dir: Vec,
  color: string,
  size = 15,
) {
  const len = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / len;
  const uy = -dir[1] / len; // physics y is up, canvas y is down
  const px = -uy;
  const py = ux;
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(tip[0] - ux * size + px * size * 0.42, tip[1] - uy * size + py * size * 0.42);
  ctx.lineTo(tip[0] - ux * size - px * size * 0.42, tip[1] - uy * size - py * size * 0.42);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function wrapPi(x: number) {
  let v = x;
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v <= -Math.PI) v += 2 * Math.PI;
  return v;
}

function arcBetween(
  ctx: CanvasRenderingContext2D,
  c: Point,
  radius: number,
  a1: number,
  a2: number,
) {
  const diff = wrapPi(a2 - a1);
  ctx.beginPath();
  ctx.arc(c[0], c[1], radius, -a1, -(a1 + diff), diff > 0);
  ctx.stroke();
  return a1 + diff / 2;
}

function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  font: string,
) {
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.strokeStyle = tcol("#f8fafc");
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * Direction arrowheads, the unit vectors d̂, t̂ (or r̂ on total internal
 * reflection) and n̂, and the angles measured from the normal.
 */
export function drawRefractionOverlay(
  ctx: CanvasRenderingContext2D,
  toCanvas: ToCanvas,
  hit: Point,
  v: RefractionVectors,
) {
  const blue = tcol("#2563eb");
  const red = tcol("#dc2626");
  const grey = tcol("#64748b");
  const ink = tcol("#111827");

  const out: Vec = v.t ?? v.r ?? [0, 1];
  const mark = v.t ? "t\u0302" : "r\u0302";

  const at = (dir: Vec, dist: number, lateral = 0): Point =>
    toCanvas([hit[0] + dir[0] * dist + lateral, hit[1] + dir[1] * dist]);

  ctx.save();
  ctx.setLineDash([]);

  arrowHead(ctx, at(v.d, -1.5), v.d, blue);
  arrowHead(ctx, at(out, 1.9), out, red);
  arrowHead(ctx, at(v.n, 2.5), v.n, grey, 13);

  // labels sit on the outer side of each ray, away from the normal
  const sideIn = v.d[0] > 1e-9 ? -1 : v.d[0] < -1e-9 ? 1 : -1;
  const sideOut = out[0] >= 0 ? 1 : -1;
  const vecFont = canvasFont(19, "mono", 700);
  const p1 = at(v.d, -2.15, sideIn * 0.45);
  label(ctx, "d\u0302", p1[0], p1[1], blue, vecFont);
  const p2 = at(out, 2.45, sideOut * 0.45);
  label(ctx, mark, p2[0], p2[1], red, vecFont);
  const p3 = at(v.n, 2.9, 0.35);
  label(ctx, "n\u0302", p3[0], p3[1], grey, vecFont);

  // angles from the normal
  const c = toCanvas(hit);
  const aBack = Math.atan2(-1, 0); // normal pointing back into medium 1
  const aFwd = Math.atan2(1, 0); // normal pointing on into medium 2
  const aSource = Math.atan2(-v.d[1], -v.d[0]);
  const aOut = Math.atan2(out[1], out[0]);
  const radius = 62;
  const angleFont = canvasFont(15, "mono", 400);
  ctx.lineWidth = 2;

  const tinyIn = Math.abs(wrapPi(aSource - aBack)) < 0.06;
  ctx.strokeStyle = blue;
  const midI = tinyIn ? aBack : arcBetween(ctx, c, radius, aBack, aSource);
  const li: Point = [
    c[0] + Math.cos(midI) * (radius + 34) + (tinyIn ? -52 : 0),
    c[1] - Math.sin(midI) * (radius + 34),
  ];
  label(ctx, `\u03b8\u2081 = ${fmt(v.theta1Deg, 1)}\u00b0`, li[0], li[1], blue, angleFont);

  // outgoing angle: from the forward normal (refraction) or the back normal (reflection)
  const aRef = v.t ? aFwd : aBack;
  const tinyOut = Math.abs(wrapPi(aOut - aRef)) < 0.06;
  ctx.strokeStyle = red;
  const midO = tinyOut ? aRef : arcBetween(ctx, c, radius + (v.t ? 0 : 9), aRef, aOut);
  const lo: Point = [
    c[0] + Math.cos(midO) * (radius + (v.t ? 34 : 52)) + (tinyOut ? 52 : 0),
    c[1] - Math.sin(midO) * (radius + (v.t ? 34 : 52)),
  ];
  const outAngle = v.t ? (v.theta2Deg ?? 0) : v.theta1Deg;
  const outName = v.t ? "\u03b8\u2082" : "\u03b8\u1d63";
  label(ctx, `${outName} = ${fmt(outAngle, 1)}\u00b0`, lo[0], lo[1], red, angleFont);

  ctx.beginPath();
  ctx.arc(c[0], c[1], 6, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.restore();
}
