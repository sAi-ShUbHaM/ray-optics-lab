"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { API_BASE } from "@/lib/config";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme, tcol, themedColor, canvasFont } from "@/lib/canvasTheme";

// ============================================================
// TYPES
// ============================================================

type Point = [number, number];
type MirrorType = "concave" | "convex";
type Mode = "textbook" | "exact";

// Textbook principal ray, built by the backend (paraxial construction).
type TextbookRay = {
  name: string;
  type: string; // "parallel" | "focal" | "pole" | "centre"
  description: string;
  incident: Point[];
  incident_extension: Point[] | null;
  reflected: Point[];
  backward_extension: Point[] | null;
  hit_point: Point;
};

type MirrorResult = {
  valid: boolean;
  mirror_type: MirrorType;
  radius: number;
  focal_length: number;
  object_distance: number;
  object_height: number;
  image_distance: number | null;
  signed_image_distance: number | null;
  image_height: number | null;
  magnification: number | null;
  image_type: string;
  orientation: string;
  size: string;
  object_position: string;
  image_position: string;
  image_at_infinity: boolean;
  object_point: Point;
  object_base: Point;
  image_point: Point | null;
  image_base: Point | null;
  center: Point;
  focus: Point;
  principal_rays: TextbookRay[];
};

// Exact ray, traced in the browser with the law of reflection.
type ExactRay = {
  name: string;
  type: string;
  color: string;
  drawn: boolean; // false when the ray cannot travel towards the mirror
  hit: Point | null; // null when the ray misses the mirror
  incidentEnd: Point; // where the incident segment stops
  reflectedDirection: Point | null;
  reflectedEnd: Point | null;
  virtualExtensionEnd: Point | null;
  missDistance: number | null; // paraxial image tip -> reflected line
  status: string;
};

const RAY_COLORS: Record<string, string> = {
  parallel: "#e67e00",
  focal: "#16a34a",
  pole: "#7c3aed",
  centre: "#0891b2",
};

// ============================================================
// PURE GEOMETRY (no React, no canvas)
// ============================================================

// Half-height of the drawn mirror. Exact rays that strike the sphere
// beyond this height miss the physical mirror.
function mirrorHalfHeight(R: number): number {
  return Math.min(0.9 * R, 10);
}

function centerOf(type: MirrorType, R: number): Point {
  return [type === "concave" ? -R : R, 0];
}

function focusOf(type: MirrorType, R: number): Point {
  return [type === "concave" ? -R / 2 : R / 2, 0];
}

// x-position of the mirror surface at height y.
//   Concave: sphere centre at (-R, 0), right-hand branch.
//   Convex:  sphere centre at (+R, 0), left-hand branch.
function surfaceX(y: number, type: MirrorType, R: number): number {
  const root = Math.sqrt(Math.max(0, R * R - y * y));
  return type === "concave" ? -R + root : R - root;
}

function normalize(v: Point): Point {
  const length = Math.hypot(v[0], v[1]);
  if (length < 1e-12) return [-1, 0];
  return [v[0] / length, v[1] / length];
}

// Law of reflection: d' = d - 2 (d . n) n   (n is a unit normal)
function reflect(direction: Point, normal: Point): Point {
  const d = normalize(direction);
  const n = normalize(normal);
  const dot = d[0] * n[0] + d[1] * n[1];
  return normalize([d[0] - 2 * dot * n[0], d[1] - 2 * dot * n[1]]);
}

// Nearest forward intersection of a ray with the reflecting branch of
// the sphere. Returns null if there is none. Whether the point lies
// within the physical mirror aperture is checked by the caller.
function raySphereHit(
  origin: Point,
  direction: Point,
  type: MirrorType,
  R: number
): Point | null {
  const d = normalize(direction);
  const [cx, cy] = centerOf(type, R);

  const ox = origin[0] - cx;
  const oy = origin[1] - cy;

  // |o + t d - c|^2 = R^2 with |d| = 1  ->  t^2 + b t + c0 = 0
  const b = 2 * (ox * d[0] + oy * d[1]);
  const c0 = ox * ox + oy * oy - R * R;
  const discriminant = b * b - 4 * c0;

  if (discriminant < 0) return null;

  const root = Math.sqrt(discriminant);
  const ts = [(-b - root) / 2, (-b + root) / 2]
    .filter((t) => t > 1e-9)
    .sort((t1, t2) => t1 - t2);

  for (const t of ts) {
    const point: Point = [origin[0] + t * d[0], origin[1] + t * d[1]];
    const side = point[0] - cx;

    // Concave mirror = right branch of the circle (x >= centre x).
    // Convex mirror  = left branch of the circle  (x <= centre x).
    const onMirrorBranch = type === "concave" ? side >= 0 : side <= 0;

    if (onMirrorBranch) return point;
  }

  return null;
}

// Where an unreflected ray should stop on screen.
function missEnd(origin: Point, d: Point, reach: number): Point {
  if (d[0] > 1e-9) {
    const t = (0 - origin[0]) / d[0];
    if (t > 0) return [origin[0] + t * d[0], origin[1] + t * d[1]];
  }
  return [origin[0] + reach * d[0], origin[1] + reach * d[1]];
}

function traceExactRay(
  name: string,
  type: string,
  origin: Point,
  direction: Point,
  result: MirrorResult,
  reach: number
): ExactRay {
  const color = tcol(RAY_COLORS[type] ?? "#1671d9");
  const R = result.radius;
  const mirrorType = result.mirror_type;
  const d = normalize(direction);

  const base = {
    name,
    type,
    color,
    reflectedDirection: null,
    reflectedEnd: null,
    virtualExtensionEnd: null,
    missDistance: null,
  };

  // A ray that does not move towards +x can never reach the mirror
  // (for example the focal ray when the object sits exactly at F).
  if (d[0] < 1e-9) {
    return {
      ...base,
      drawn: false,
      hit: null,
      incidentEnd: origin,
      status:
        "Not drawn: this ray would run parallel to the mirror plane (object exactly at F or C)",
    };
  }

  const hit = raySphereHit(origin, d, mirrorType, R);

  if (!hit) {
    return {
      ...base,
      drawn: true,
      hit: null,
      incidentEnd: missEnd(origin, d, reach),
      status: "Misses the sphere",
    };
  }

  const aperture = mirrorHalfHeight(R);

  if (Math.abs(hit[1]) > aperture + 1e-9) {
    return {
      ...base,
      drawn: true,
      hit: null,
      incidentEnd: missEnd(origin, d, reach),
      status: `Misses the mirror edge (would hit at y = ${hit[1].toFixed(
        2
      )}, mirror reaches |y| = ${aperture.toFixed(2)})`,
    };
  }

  // Normal = radius direction at the hit point.
  const [cx, cy] = centerOf(mirrorType, R);
  const normal = normalize([hit[0] - cx, hit[1] - cy]);
  const reflectedDirection = reflect(d, normal);

  const reflectedEnd: Point = [
    hit[0] + reflectedDirection[0] * reach,
    hit[1] + reflectedDirection[1] * reach,
  ];

  // Backward extension along the reflected ray (virtual-image side).
  const virtualExtensionEnd: Point | null =
    result.image_type === "Virtual"
      ? [
          hit[0] - reflectedDirection[0] * reach,
          hit[1] - reflectedDirection[1] * reach,
        ]
      : null;

  // Perpendicular distance from the paraxial image tip to the
  // (infinite) reflected line: 0 would mean "passes through the tip".
  let missDistance: number | null = null;
  if (result.image_point) {
    const vx = result.image_point[0] - hit[0];
    const vy = result.image_point[1] - hit[1];
    missDistance = Math.abs(
      vx * reflectedDirection[1] - vy * reflectedDirection[0]
    );
  }

  return {
    ...base,
    drawn: true,
    hit,
    incidentEnd: hit,
    reflectedDirection,
    reflectedEnd,
    virtualExtensionEnd,
    missDistance,
    status: "OK",
  };
}

// Four exact rays from the object tip: parallel, via F, via P, via C.
// Only the pole ray and the centre ray are exact textbook rules on a
// sphere; the parallel and focal rays are paraxial rules and drift
// away from them for steep rays (spherical aberration).
//
// "Via F" and "via C" mean: the ray travels along the line through the
// object tip and that point. If the point lies in front of the object
// (object closer to the mirror than F or C) the ray is drawn coming
// FROM that point, otherwise it would travel away from the mirror.
function buildExactRays(result: MirrorResult): ExactRay[] {
  const { extentX, extentY } = getView(result);
  const reach = extentX + extentY;

  const O = result.object_point;
  const F = focusOf(result.mirror_type, result.radius);
  const C = centerOf(result.mirror_type, result.radius);
  const P: Point = [0, 0];

  // Direction from O towards `target`, flipped if needed so the ray
  // travels towards the mirror (+x).
  function towardMirror(target: Point): Point {
    const v: Point = [target[0] - O[0], target[1] - O[1]];
    return v[0] < 0 ? [-v[0], -v[1]] : v;
  }

  const aims: [string, string, Point][] = [
    ["Parallel ray", "parallel", [1, 0]],
    ["Focal ray", "focal", towardMirror(F)],
    ["Pole ray", "pole", towardMirror(P)],
    ["Centre ray", "centre", towardMirror(C)],
  ];

  return aims.map(([name, type, direction]) =>
    traceExactRay(name, type, O, direction, result, reach)
  );
}

function getView(result: MirrorResult) {
  const imageX = result.signed_image_distance ?? 0;
  const imageY = result.image_height ?? 0;

  const wantX = Math.max(
    result.object_distance + 8,
    Math.abs(imageX) + 8,
    result.radius * 1.6,
    24
  );

  const wantY = Math.max(
    result.object_height + 5,
    Math.abs(imageY) + 5,
    result.radius * 0.9,
    12
  );

  // Cap the view so an image near infinity does not shrink the diagram.
  const extentX = Math.min(wantX, 90);
  const extentY = Math.min(wantY, 45);

  return {
    extentX,
    extentY,
    imageOutOfView: wantX > extentX || wantY > extentY,
  };
}

// ============================================================
// CANVAS DRAWING
// ============================================================

type MapFn = (p: Point) => Point;

function drawDiagram(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: MirrorResult,
  mode: Mode,
  exactRays: ExactRay[]
) {
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, width, height);

  const { extentX, extentY, imageOutOfView } = getView(result);

  const scale = Math.min(
    (width - 100) / (2 * extentX),
    (height - 100) / (2 * extentY)
  );

  const map: MapFn = (p) => [
    width / 2 + p[0] * scale,
    height / 2 - p[1] * scale,
  ];

  drawGrid(ctx, width, height, scale, extentX, extentY);

  // Principal axis
  drawPolyline(
    ctx,
    map,
    [
      [-extentX, 0],
      [extentX, 0],
    ],
    tcol("#555"),
    1.5,
    false
  );

  // The textbook model reflects at the plane x = 0, so show that plane.
  if (mode === "textbook") {
    drawPolyline(
      ctx,
      map,
      [
        [0, -extentY],
        [0, extentY],
      ],
      tcol("#b8b8b8"),
      1.2,
      true
    );

    const label = map([0.6, extentY - 1.4]);
    ctx.fillStyle = tcol("#888");
    ctx.font = canvasFont(12, "sans", 400);
    ctx.fillText("paraxial plane x = 0", label[0], label[1]);
  }

  drawMirror(ctx, map, result);

  // Pole, focus and centre of curvature
  drawReference(ctx, map, "P", 0);
  drawReference(ctx, map, "F", result.focus[0]);
  drawReference(ctx, map, "C", result.center[0]);

  // Object
  drawArrow(
    ctx,
    map,
    result.object_base,
    result.object_point,
    tcol("#111"),
    false,
    "Object"
  );

  // Rays
  if (mode === "textbook") {
    drawTextbookRays(ctx, map, result);
  } else {
    drawExactRays(ctx, map, result, exactRays);
  }

  // Image calculated with the mirror equation
  if (result.image_point && result.image_base) {
    drawArrow(
      ctx,
      map,
      result.image_base,
      result.image_point,
      tcol("#222"),
      result.image_type === "Virtual",
      mode === "textbook" ? "Image" : "Image (paraxial)"
    );
  }

  // Notes at the bottom of the canvas
  ctx.fillStyle = tcol("#b45309");
  ctx.font = canvasFont(13, "sans", 400);

  if (result.image_at_infinity) {
    ctx.fillText(
      "Object at F: reflected rays are parallel, so the image is at infinity.",
      20,
      height - 16
    );
  } else if (imageOutOfView) {
    ctx.fillText(
      "The image lies partly outside this view (see the numbers below).",
      20,
      height - 16
    );
  }

  drawLegend(ctx, mode, result, exactRays);
}

function drawTextbookRays(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  result: MirrorResult
) {
  for (const ray of result.principal_rays) {
    const color = tcol(RAY_COLORS[ray.type] ?? "#1671d9");

    drawPolyline(ctx, map, ray.incident, color, 2.2, false);

    if (ray.incident_extension) {
      drawPolyline(ctx, map, ray.incident_extension, color, 1.6, true);
    }

    drawPolyline(ctx, map, ray.reflected, color, 2.5, false);

    if (ray.backward_extension) {
      drawPolyline(ctx, map, ray.backward_extension, tcol("#777"), 1.6, true);
    }

    drawDirectionArrow(ctx, map, ray.incident[0], ray.incident[1], color, 30);
    drawDirectionArrow(ctx, map, ray.reflected[0], ray.reflected[1], color, 12);
    drawHitDot(ctx, map, ray.hit_point);
  }
}

function drawExactRays(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  result: MirrorResult,
  rays: ExactRay[]
) {
  for (const ray of rays) {
    if (!ray.drawn) continue;

    const origin = result.object_point;

    // A ray that misses the mirror is shown grey and dashed.
    if (!ray.hit || !ray.reflectedEnd) {
      drawPolyline(ctx, map, [origin, ray.incidentEnd], tcol("#aaa"), 1.6, true);
      continue;
    }

    drawPolyline(ctx, map, [origin, ray.hit], ray.color, 2.2, false);
    drawPolyline(ctx, map, [ray.hit, ray.reflectedEnd], ray.color, 2.5, false);

    if (ray.virtualExtensionEnd) {
      drawPolyline(
        ctx,
        map,
        [ray.hit, ray.virtualExtensionEnd],
        tcol("#777"),
        1.6,
        true
      );
    }

    drawDirectionArrow(ctx, map, origin, ray.hit, ray.color, 30);
    drawDirectionArrow(ctx, map, ray.hit, ray.reflectedEnd, ray.color, 12);
    drawHitDot(ctx, map, ray.hit);
  }
}

function drawHitDot(ctx: CanvasRenderingContext2D, map: MapFn, p: Point) {
  const c = map(p);
  ctx.beginPath();
  ctx.arc(c[0], c[1], 4.5, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#e11d48");
  ctx.fill();
}

// Small triangle that shows which way a ray travels.
function drawDirectionArrow(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  from: Point,
  to: Point,
  color: string,
  maxWorldDistance: number
) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (length < 1e-9) return;

  const fraction = Math.min(0.5, maxWorldDistance / length);
  const middle: Point = [
    from[0] + (to[0] - from[0]) * fraction,
    from[1] + (to[1] - from[1]) * fraction,
  ];

  const a = map(from);
  const b = map(to);
  const m = map(middle);

  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 40) return;

  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const size = 10;
  const tip: [number, number] = [
    m[0] + 5 * Math.cos(angle),
    m[1] + 5 * Math.sin(angle),
  ];

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tip[0], tip[1]);
  ctx.lineTo(
    tip[0] - size * Math.cos(angle - Math.PI / 7),
    tip[1] - size * Math.sin(angle - Math.PI / 7)
  );
  ctx.lineTo(
    tip[0] - size * Math.cos(angle + Math.PI / 7),
    tip[1] - size * Math.sin(angle + Math.PI / 7)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  extentX: number,
  extentY: number
) {
  const step = scale > 28 ? 1 : scale > 14 ? 2 : 5;

  ctx.strokeStyle = tcol("#eee");
  ctx.lineWidth = 1;

  // Start on a multiple of `step` so grid lines pass through x = 0, y = 0.
  for (let x = Math.ceil(-extentX / step) * step; x <= extentX; x += step) {
    const px = width / 2 + x * scale;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }

  for (let y = Math.ceil(-extentY / step) * step; y <= extentY; y += step) {
    const py = height / 2 - y * scale;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }
}

function drawMirror(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  result: MirrorResult
) {
  const R = result.radius;
  const aperture = mirrorHalfHeight(R);
  const points: Point[] = [];

  for (let i = 0; i <= 120; i++) {
    const y = aperture - (2 * aperture * i) / 120;
    points.push([surfaceX(y, result.mirror_type, R), y]);
  }

  drawPolyline(ctx, map, points, tcol("#111"), 5, false);

  // Hatching marks the NON-reflecting back of the mirror.
  // The reflecting side faces the object (left), so for BOTH concave
  // and convex mirrors the back is on the right.
  ctx.strokeStyle = tcol("#555");
  ctx.lineWidth = 1.2;

  for (let i = 5; i < points.length - 3; i += 8) {
    const p = map(points[i]);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(p[0] + 10, p[1] - 7);
    ctx.stroke();
  }

  ctx.fillStyle = tcol("#111");
  ctx.font = canvasFont(15, "sans", 700);

  const label = map([
    result.mirror_type === "concave" ? -1.5 : 1.5,
    aperture + 1.5,
  ]);

  ctx.fillText(
    result.mirror_type === "concave" ? "Concave mirror" : "Convex mirror",
    label[0],
    label[1]
  );
}

function drawReference(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  name: string,
  x: number
) {
  const p = map([x, 0]);

  ctx.beginPath();
  ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#111");
  ctx.fill();

  ctx.font = canvasFont(14, "sans", 700);
  ctx.fillText(name, p[0] - 5, p[1] + 20);
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  base: Point,
  tip: Point,
  color: string,
  dashed: boolean,
  label: string
) {
  const a = map(base);
  const b = map(tip);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash(dashed ? [7, 5] : []);
  ctx.stroke();

  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const size = 11;

  ctx.beginPath();
  ctx.moveTo(...b);
  ctx.lineTo(
    b[0] - size * Math.cos(angle - Math.PI / 6),
    b[1] - size * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    b[0] - size * Math.cos(angle + Math.PI / 6),
    b[1] - size * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.setLineDash([]);
  ctx.font = canvasFont(14, "sans", 700);
  ctx.fillText(label, b[0] + 7, b[1] - 8);
  ctx.restore();
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  points: Point[],
  color: string,
  lineWidth: number,
  dashed: boolean
) {
  if (points.length < 2) return;

  ctx.save();
  ctx.beginPath();

  const first = map(points[0]);
  ctx.moveTo(first[0], first[1]);

  for (let i = 1; i < points.length; i++) {
    const p = map(points[i]);
    ctx.lineTo(p[0], p[1]);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.setLineDash(dashed ? [7, 5] : []);
  ctx.stroke();
  ctx.restore();
}

function drawLegend(
  ctx: CanvasRenderingContext2D,
  mode: Mode,
  result: MirrorResult,
  exactRays: ExactRay[]
) {
  const entries: { color: string; label: string }[] =
    mode === "textbook"
      ? result.principal_rays.map((ray) => ({
          color: tcol(RAY_COLORS[ray.type] ?? "#1671d9"),
          label: ray.name,
        }))
      : exactRays
          .filter((ray) => ray.drawn)
          .map((ray) => ({ color: ray.color, label: ray.name }));

  const title =
    mode === "textbook"
      ? "Textbook (paraxial) rays"
      : "Exact spherical reflection";

  const subtitle =
    mode === "textbook"
      ? "Reflect at the plane x = 0"
      : "Law of reflection on the sphere";

  const rowHeight = 20;
  const boxHeight = 62 + entries.length * rowHeight + 2 * rowHeight;
  const boxWidth = 260;

  ctx.save();
  ctx.fillStyle = tcol("rgba(255,255,255,0.95)");
  ctx.strokeStyle = tcol("#ddd");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(16, 16, boxWidth, boxHeight, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = tcol("#111");
  ctx.font = canvasFont(13, "sans", 700);
  ctx.fillText(title, 28, 38);

  ctx.fillStyle = tcol("#666");
  ctx.font = canvasFont(12, "sans", 400);
  ctx.fillText(subtitle, 28, 56);

  let y = 80;

  for (const entry of entries) {
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(56, y);
    ctx.strokeStyle = entry.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.fillStyle = tcol("#222");
    ctx.font = canvasFont(12, "sans", 400);
    ctx.fillText(entry.label, 64, y + 4);
    y += rowHeight;
  }

  // Dashed grey: backward extension / virtual side
  ctx.beginPath();
  ctx.moveTo(28, y);
  ctx.lineTo(56, y);
  ctx.strokeStyle = tcol("#777");
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = tcol("#222");
  ctx.fillText("Backward extension (virtual)", 64, y + 4);
  y += rowHeight;

  // Red dot: where the ray reflects
  ctx.beginPath();
  ctx.arc(42, y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#e11d48");
  ctx.fill();
  ctx.fillStyle = tcol("#222");
  ctx.fillText(
    mode === "textbook" ? "Reflection point (plane)" : "Reflection point (sphere)",
    64,
    y + 4
  );

  ctx.restore();
}

function fmt(value: number | null | undefined) {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "∞";
  return Number(value.toFixed(2)).toString();
}

// ============================================================
// PAGE COMPONENT
// ============================================================

export default function MirrorImagePage() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [mirrorType, setMirrorType] = useState<MirrorType>("concave");
  const [radius, setRadius] = useState(10);
  const [objectDistance, setObjectDistance] = useState(30);
  const [objectHeight, setObjectHeight] = useState(5);
  const [mode, setMode] = useState<Mode>("textbook");

  const [data, setData] = useState<MirrorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function simulate() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_BASE}/simulate/mirror-image`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mirror_type: mirrorType,
              radius,
              object_distance: objectDistance,
              object_height: objectHeight,
            }),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          let message = `Backend returned ${response.status}`;

          try {
            const body = await response.json();
            if (typeof body?.detail === "string") message = body.detail;
          } catch {
            // The body was not JSON; keep the status message.
          }

          throw new Error(message);
        }

        const result: MirrorResult = await response.json();

        if (!result.valid) {
          throw new Error("Invalid simulation result.");
        }

        setData(result);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        console.error(err);

        setError(
          err instanceof TypeError
            ? "Backend connection failed. Check that FastAPI is running."
            : err instanceof Error
            ? err.message
            : "Unknown error."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    simulate();

    return () => controller.abort();
  }, [mirrorType, radius, objectDistance, objectHeight]);

  // Exact rays depend only on the backend result, not on the mode.
  const exactRays = useMemo(
    () => (data ? buildExactRays(data) : []),
    [data]
  );

  useEffect(() => {
    setCanvasTheme(theme);
    if (!data || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    drawDiagram(ctx, canvasRef.current, data, mode, exactRays);
  }, [data, mode, exactRays, theme]);

  return (
    <main style={styles.page}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(1.625rem, 1.2rem + 1.4vw, 2.125rem)", fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 8, color: "var(--text)" }}>
          Spherical Mirror — Image Formation
        </h1>

        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          Switch between the textbook construction and an exact spherical
          reflection.
        </p>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Controls</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Mirror type
              <select
                value={mirrorType}
                onChange={(e) => setMirrorType(e.target.value as MirrorType)}
                style={styles.select}
              >
                <option value="concave">Concave</option>
                <option value="convex">Convex</option>
              </select>
            </label>

            <label style={styles.label}>
              Radius: {radius}
              <input
                type="range"
                min="4"
                max="20"
                step="1"
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Object distance: {objectDistance}
              <input
                type="range"
                min="5"
                max="60"
                step="1"
                value={objectDistance}
                onChange={(e) => setObjectDistance(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Object height: {objectHeight}
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={objectHeight}
                onChange={(e) => setObjectHeight(Number(e.target.value))}
              />
            </label>

            <div style={styles.label}>
              Ray model
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setMode("textbook")}
                  style={
                    mode === "textbook"
                      ? styles.modeButtonActive
                      : styles.modeButton
                  }
                >
                  Textbook (paraxial)
                </button>
                <button
                  type="button"
                  onClick={() => setMode("exact")}
                  style={
                    mode === "exact"
                      ? styles.modeButtonActive
                      : styles.modeButton
                  }
                >
                  Exact spherical
                </button>
              </div>
            </div>
          </div>

          {loading && <p>Updating simulation...</p>}
          {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>
            Ray diagram —{" "}
            {mode === "textbook"
              ? "Textbook (paraxial) rays"
              : "Exact spherical reflection"}
          </h2>
          <canvas role="img" aria-label="Ray diagram for spherical mirror image formation"
            ref={canvasRef}
            width={1200}
            height={650}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
          />
        </section>

        {data && (
          <>
            <section style={styles.results}>
              <ResultCard title="Image type" value={data.image_type} />
              <ResultCard title="Orientation" value={data.orientation} />
              <ResultCard title="Size" value={data.size} />
              <ResultCard
                title="Image distance"
                value={fmt(data.image_distance)}
              />
              <ResultCard
                title="Image height"
                value={fmt(data.image_height)}
              />
              <ResultCard
                title="Magnification"
                value={fmt(data.magnification)}
              />
              <ResultCard title="Image position" value={data.image_position} />
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>
                {mode === "textbook" ? "Principal rays" : "Exact ray diagnostics"}
              </h2>

              {mode === "textbook" ? (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Ray</th>
                      <th style={styles.th}>Construction</th>
                      <th style={styles.th}>Reflection point (x, y)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.principal_rays.map((ray) => (
                      <tr key={ray.type}>
                        <td style={styles.td}>
                          <span
                            style={{
                              color: themedColor(theme, RAY_COLORS[ray.type] ?? "#1671d9"),
                              fontWeight: "bold",
                            }}
                          >
                            {ray.name}
                          </span>
                        </td>
                        <td style={styles.td}>{ray.description}</td>
                        <td style={styles.td}>
                          ({fmt(ray.hit_point[0])}, {fmt(ray.hit_point[1])})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Ray</th>
                      <th style={styles.th}>Hit point (x, y)</th>
                      <th style={styles.th}>Reflected direction</th>
                      <th style={styles.th}>
                        Paraxial image tip to reflected ray
                      </th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exactRays.map((ray) => (
                      <tr key={ray.type}>
                        <td style={styles.td}>
                          <span style={{ color: ray.color, fontWeight: "bold" }}>
                            {ray.name}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {ray.hit
                            ? `(${fmt(ray.hit[0])}, ${fmt(ray.hit[1])})`
                            : "—"}
                        </td>
                        <td style={styles.td}>
                          {ray.reflectedDirection
                            ? `(${ray.reflectedDirection[0].toFixed(
                                3
                              )}, ${ray.reflectedDirection[1].toFixed(3)})`
                            : "—"}
                        </td>
                        <td style={styles.td}>
                          {ray.missDistance == null
                            ? "—"
                            : fmt(ray.missDistance)}
                        </td>
                        <td style={styles.td}>{ray.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Physics</h2>
              <p>Mirror formula: 1/f = 1/v + 1/u</p>
              <p>Magnification: m = hᵢ/hₒ = −v/u</p>
              <p>Signed focal length: {fmt(data.focal_length)}</p>
              <p>
                Signed image distance: {fmt(data.signed_image_distance)}{" "}
                (negative = real image in front of the mirror, positive =
                virtual image behind it)
              </p>

              {mode === "textbook" ? (
                <p>
                  <strong>Textbook model:</strong> the paraxial rule assumes
                  rays stay close to the axis, so every ray is drawn
                  reflecting at the plane x = 0. That is why all reflected rays
                  (or their dashed extensions) pass through the image tip given
                  by the mirror equation. This is a schematic construction, not
                  a trace of the real spherical surface.
                </p>
              ) : (
                <p>
                  <strong>Exact model:</strong> each ray is intersected with
                  the real sphere, reflected using the local normal, and drawn
                  in its true direction. Nothing forces these rays through the
                  paraxial image tip. Only the pole ray and the centre ray are
                  exact textbook rules on a sphere; the parallel and focal rays
                  drift away from F because of spherical aberration, mostly
                  when the ray strikes far from the axis. Try a smaller object
                  height or a larger radius and watch the last-but-one column
                  of the table shrink.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function ResultCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={styles.card}>
      <div style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 7 }}>
        {title}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    padding: "28px clamp(16px, 3vw, 32px)",
    background: "transparent",
    color: "var(--text)",
    fontFamily: "var(--font-sans)",
  },
  panel: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 22,
  },
  heading: {
    marginTop: 0,
    marginBottom: 18,
  },
  controls: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 24,
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    fontWeight: 500,
  },
  select: {
    padding: 10,
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--text)",
  },
  modeButton: {
    flex: 1,
    padding: "10px 8px",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--text)",
    cursor: "pointer",
    fontWeight: "normal",
  },
  modeButtonActive: {
    flex: 1,
    padding: "10px 8px",
    border: "1px solid var(--text)",
    borderRadius: 8,
    background: "var(--text)",
    color: "var(--bg)",
    cursor: "pointer",
    fontWeight: "bold",
  },
  results: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 14,
    marginTop: 20,
  },
  card: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 18,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  },
  th: {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "2px solid var(--border)",
    color: "var(--text-secondary)",
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "top",
  },
};
