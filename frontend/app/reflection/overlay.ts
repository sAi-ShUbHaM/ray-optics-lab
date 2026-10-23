import { canvasFont, tcol } from "@/lib/canvasTheme";
import type { ReflectionVectors, Vec } from "./vectors";
import { fmt } from "./vectors";

type Point = [number, number];
type ToCanvas = (p: Point) => Point;

/** Filled arrowhead. `dir` is a physics-space direction (y up). */
export function arrowHead(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  dir: Vec,
  color: string,
  size = 15,
) {
  // physics y is up, canvas y is down
  const len = Math.hypot(dir[0], dir[1]) || 1;
  const ux = dir[0] / len;
  const uy = -dir[1] / len;
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

/** Arc between two physics-space angles (radians), drawn on the short side. */
function arcBetween(
  ctx: CanvasRenderingContext2D,
  c: Point,
  radius: number,
  a1: number,
  a2: number,
) {
  const diff = wrapPi(a2 - a1);
  ctx.beginPath();
  // canvas angles run the other way (y is flipped)
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
  ctx.strokeStyle = tcol("#f8fafc");
  ctx.lineJoin = "round";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * Direction arrowheads on the rays, the unit vectors d̂, n̂, r̂, and the angles
 * of incidence and reflection measured from the normal.
 */
export function drawVectorOverlay(
  ctx: CanvasRenderingContext2D,
  toCanvas: ToCanvas,
  hit: Point,
  v: ReflectionVectors,
) {
  const blue = tcol("#2563eb");
  const red = tcol("#dc2626");
  const ink = tcol("#111827");
  const grey = tcol("#64748b");

  const at = (dir: Vec, dist: number, lateral = 0): Point =>
    toCanvas([
      hit[0] + dir[0] * dist + v.m[0] * lateral,
      hit[1] + dir[1] * dist + v.m[1] * lateral,
    ]);

  ctx.save();
  ctx.setLineDash([]);

  // unit-vector arrowheads: incident (towards the mirror), normal, reflected
  arrowHead(ctx, at(v.d, -1.5), v.d, blue);
  arrowHead(ctx, at(v.r, 1.9), v.r, red);
  arrowHead(ctx, at(v.n, 2.2), v.n, grey, 13);

  // labels sit on the outer side of each ray, away from the angle between them
  const sideIn = Math.sign(-(v.d[0] * v.m[0] + v.d[1] * v.m[1])) || 1;
  const sideOut = Math.sign(v.r[0] * v.m[0] + v.r[1] * v.m[1]) || -1;
  const vecFont = canvasFont(19, "mono", 700);
  const p1 = at(v.d, -2.15, sideIn * 0.45);
  label(ctx, "d\u0302", p1[0], p1[1], blue, vecFont);
  const p2 = at(v.r, 2.45, sideOut * 0.45);
  label(ctx, "r\u0302", p2[0], p2[1], red, vecFont);
  const p3 = at(v.n, 2.6, 0.35);
  label(ctx, "n\u0302", p3[0], p3[1], grey, vecFont);

  // angles measured from the normal on the side the ray arrives from
  const c = toCanvas(hit);
  const aN = Math.atan2(v.nIn[1], v.nIn[0]);
  const aSource = Math.atan2(-v.d[1], -v.d[0]);
  const aRefl = Math.atan2(v.r[1], v.r[0]);
  const radius = 62;
  const angleFont = canvasFont(15, "mono", 400);

  const tiny = Math.abs(wrapPi(aSource - aN)) < 0.06;
  ctx.lineWidth = 2;

  ctx.strokeStyle = blue;
  const midI = tiny ? aN : arcBetween(ctx, c, radius, aN, aSource);
  ctx.strokeStyle = red;
  const midR = tiny ? aN : arcBetween(ctx, c, radius + 9, aN, aRefl);

  const place = (mid: number, extra: number, shiftX: number): Point => [
    c[0] + Math.cos(mid) * (radius + extra) + shiftX,
    c[1] - Math.sin(mid) * (radius + extra),
  ];
  const li = place(midI, 34, tiny ? -52 : 0);
  label(ctx, `i = ${fmt(v.incidenceDeg, 1)}\u00b0`, li[0], li[1], blue, angleFont);
  const lr = place(midR, 52, tiny ? 52 : 0);
  label(ctx, `r = ${fmt(v.reflectionDeg, 1)}\u00b0`, lr[0], lr[1], red, angleFont);

  // hit point on top
  ctx.beginPath();
  ctx.arc(c[0], c[1], 6, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.restore();
}
