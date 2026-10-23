import { tcol } from "@/lib/canvasTheme";
// Canvas drawing for the Glass Slab and Apparent Depth page.
// Pure functions only: no React, so they are easy to test on their own.

// ============================================================
// TYPES
// ============================================================

export type Point = [number, number];
type MapFn = (p: Point) => Point;

export type SlabRay = {
  entry_height: number;
  points: Point[]; // start, entry hit, (inner hits), end
  events: string[];
  status: string;
  exit_side: "left" | "right" | null;
};

export type SlabResult = {
  valid: boolean;
  incident_angle: number;
  thickness: number;
  n_slab: number;
  n_in: number;
  n_out: number;
  same_media: boolean;
  rays: SlabRay[];
  status: string;
  events: string[];
  theta1: number;
  theta2: number | null;
  theta3: number | null;
  deviation: number | null;
  lateral_displacement: number | null;
  lateral_displacement_formula: number | null;
  path_length: number | null;
  optical_path: number | null;
  critical_angle_entry: number | null;
  apparent_shift: number;
  apparent_thickness: number;
};

export type ApparentRay = {
  angle_in: number;
  angle_out: number | null;
  hit: Point;
  status: string;
  tir: boolean;
  points: Point[]; // object, hit, end
  back_extension: Point[] | null;
  apparent_depth: number | null;
  caustic: Point | null;
};

export type ApparentDepthResult = {
  valid: boolean;
  depth: number;
  n_below: number;
  n_above: number;
  max_angle: number;
  critical_angle: number | null;
  paraxial_apparent_depth: number;
  ratio: number;
  apparent_shift: number;
  widest_apparent_depth: number | null;
  widest_angle: number | null;
  tir_ray_count: number;
  rays: ApparentRay[];
  caustic_curve: Point[];
};

export function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "∞";
  return Number(value.toFixed(digits)).toString();
}

// ============================================================
// HELPERS
// ============================================================

const LEGEND_BAND = 52; // pixels reserved at the top for the legend strip

const ORANGE = "#e67e00";
const PURPLE = "#7c3aed";
const BLUE = "#1671d9";
const RED = "#dc2626";
const GREEN = "#16a34a";
const MAGENTA = "#c026d3";

function drawHaloText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
) {
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = tcol("#fff");
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawPolyline(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  points: Point[],
  color: string,
  lineWidth: number,
  dashed: boolean,
  dash: number[] = [6, 4]
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
  ctx.setLineDash(dashed ? dash : []);
  ctx.stroke();
  ctx.restore();
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  p: Point,
  color: string,
  radius = 3.5
) {
  const c = map(p);
  ctx.beginPath();
  ctx.arc(c[0], c[1], radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawDirectionArrow(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  from: Point,
  to: Point,
  color: string
) {
  const a = map(from);
  const b = map(to);
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 36) return;

  const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const size = 10;
  const tip: Point = [mid[0] + 5 * Math.cos(angle), mid[1] + 5 * Math.sin(angle)];

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
  map: MapFn,
  scale: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
) {
  const step = scale > 28 ? 1 : scale > 12 ? 2 : 5;

  ctx.strokeStyle = tcol("#eee");
  ctx.lineWidth = 1;

  for (let x = Math.ceil(xMin / step) * step; x <= xMax; x += step) {
    const px = map([x, 0])[0];
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }

  for (let y = Math.ceil(yMin / step) * step; y <= yMax; y += step) {
    const py = map([0, y])[1];
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }
}

type LegendItem = { label: string; color: string; dashed: boolean; width?: number };

function drawLegendStrip(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  items: LegendItem[]
) {
  const width = ctx.canvas.width;
  const startX = 330;
  const available = width - startX - 24;

  // measure the items at the normal size; shrink the text and gaps if they do not fit
  function needed(fontSize: number, gap: number) {
    ctx.font = `${fontSize}px Arial`;
    return items.reduce(
      (sum, item) => sum + 33 + ctx.measureText(item.label).width + gap,
      0
    );
  }

  let fontSize = 12;
  let gap = 22;
  if (needed(fontSize, gap) > available) {
    fontSize = 11;
    gap = 12;
  }

  ctx.save();
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, width, LEGEND_BAND);

  ctx.strokeStyle = tcol("#ddd");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(12, 8, width - 24, LEGEND_BAND - 14, 8);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.font = "bold 13px Arial";
  ctx.fillStyle = tcol("#111");
  ctx.fillText(title, 26, 24);

  ctx.font = "12px Arial";
  ctx.fillStyle = tcol("#666");
  ctx.fillText(subtitle, 26, 42);

  let x = startX;
  const y = 33;

  for (const item of items) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 26, y);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.width ?? (item.dashed ? 2 : 3);
    ctx.setLineDash(item.dashed ? [6, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = tcol("#222");
    ctx.font = `${fontSize}px Arial`;
    ctx.fillText(item.label, x + 33, y + 4);
    x += 33 + ctx.measureText(item.label).width + gap;
  }

  ctx.restore();
}

function drawNotes(ctx: CanvasRenderingContext2D, height: number, notes: string[]) {
  ctx.save();
  ctx.fillStyle = tcol("#b45309");
  ctx.font = "13px Arial";
  ctx.textAlign = "left";
  notes.forEach((text, i) => {
    ctx.fillText(text, 20, height - 14 - (notes.length - 1 - i) * 18);
  });
  ctx.restore();
}

function clearCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// A view that fits [xMin, xMax] x [yMin, yMax] with equal scales, centred.
function makeView(
  canvas: HTMLCanvasElement,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
) {
  const width = canvas.width;
  const height = canvas.height;
  const scale = Math.min(
    (width - 60) / (xMax - xMin),
    (height - LEGEND_BAND - 50) / (yMax - yMin)
  );

  const offsetX = (width - scale * (xMax - xMin)) / 2;
  const offsetY =
    LEGEND_BAND + (height - LEGEND_BAND - scale * (yMax - yMin)) / 2 - 8;

  const map: MapFn = (p) => [
    offsetX + (p[0] - xMin) * scale,
    offsetY + (yMax - p[1]) * scale,
  ];

  return { scale, map };
}

// ============================================================
// GLASS SLAB DIAGRAM
// ============================================================

export function drawSlab(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: SlabResult
) {
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const t = result.thickness;
  const xl = -t / 2;
  const xr = t / 2;

  // ----- view: fit every ray point, the slab and some margin -----
  let xMin = xl - 6;
  let xMax = xr + 6;
  let yMin = -7;
  let yMax = 7;

  for (const ray of result.rays) {
    for (const p of ray.points) {
      xMin = Math.min(xMin, p[0]);
      xMax = Math.max(xMax, p[0]);
      yMin = Math.min(yMin, p[1] - 1);
      yMax = Math.max(yMax, p[1] + 1);
    }
  }
  yMin = Math.max(yMin, -30);
  yMax = Math.min(yMax, 30);

  const { scale, map } = makeView(canvas, xMin, xMax, yMin, yMax);
  const width = canvas.width;

  drawGrid(ctx, width, height, map, scale, xMin, xMax, yMin, yMax);

  // ----- slab (extends over the whole height of the view) -----
  const slabTopLeft = map([xl, yMax]);
  const slabBottomRight = map([xr, yMin]);

  ctx.save();
  ctx.fillStyle = tcol("rgba(14, 116, 144, 0.14)");
  ctx.fillRect(
    slabTopLeft[0],
    slabTopLeft[1],
    slabBottomRight[0] - slabTopLeft[0],
    slabBottomRight[1] - slabTopLeft[1]
  );
  ctx.strokeStyle = tcol("#0e7490");
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(slabTopLeft[0], slabTopLeft[1]);
  ctx.lineTo(slabTopLeft[0], slabBottomRight[1]);
  ctx.moveTo(slabBottomRight[0], slabTopLeft[1]);
  ctx.lineTo(slabBottomRight[0], slabBottomRight[1]);
  ctx.stroke();

  // medium labels
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  const labelY = slabTopLeft[1] + 28;
  drawHaloText(ctx, `n = ${fmt(result.n_in, 2)}`, (slabTopLeft[0] + 20) / 2 + 10, labelY, tcol("#444"));
  drawHaloText(
    ctx,
    `Slab n = ${fmt(result.n_slab, 2)}`,
    (slabTopLeft[0] + slabBottomRight[0]) / 2,
    labelY,
    tcol("#0e7490")
  );
  drawHaloText(
    ctx,
    `n = ${fmt(result.n_out, 2)}`,
    (slabBottomRight[0] + width) / 2 - 20,
    labelY,
    tcol("#444")
  );
  ctx.restore();

  // ----- the central ray carries the annotations -----
  const centre = result.rays[Math.floor(result.rays.length / 2)];
  const reflectedAtEntry = centre.events[0]?.startsWith("Total internal") ?? false;

  // normals at the surface hits of the central ray
  const hits = centre.points.slice(1, reflectedAtEntry ? 2 : -1);
  for (const hit of hits) {
    drawPolyline(
      ctx,
      map,
      [
        [hit[0] - 4, hit[1]],
        [hit[0] + 4, hit[1]],
      ],
      tcol("#666"),
      1.2,
      true
    );
  }

  // undeviated path (what the ray would do with no slab)
  if (!reflectedAtEntry && centre.points.length >= 2) {
    const start = centre.points[0];
    const entry = centre.points[1];
    const dx = entry[0] - start[0];
    const dy = entry[1] - start[1];
    if (dx > 1e-9) {
      const k = (xMax - entry[0]) / dx;
      drawPolyline(ctx, map, [entry, [xMax, entry[1] + dy * k]], tcol("#999"), 1.3, true);
    }
  }

  // ----- the rays -----
  result.rays.forEach((ray) => {
    const pts = ray.points;
    const tirAtEntry = ray.events[0]?.startsWith("Total internal") ?? false;

    // segment 0: incident
    drawPolyline(ctx, map, [pts[0], pts[1]], tcol(ORANGE), 2.3, false);
    drawDirectionArrow(ctx, map, pts[0], pts[1], tcol(ORANGE));

    if (tirAtEntry) {
      drawPolyline(ctx, map, [pts[1], pts[2]], tcol(RED), 2.3, false);
      drawDirectionArrow(ctx, map, pts[1], pts[2], tcol(RED));
      return;
    }

    // inner segments
    for (let i = 1; i < pts.length - 2; i++) {
      drawPolyline(ctx, map, [pts[i], pts[i + 1]], tcol(PURPLE), 2.3, false);
    }
    if (pts.length >= 4) {
      drawDirectionArrow(ctx, map, pts[1], pts[2], tcol(PURPLE));
    }

    // last segment: emergent
    const last = pts.length - 1;
    drawPolyline(ctx, map, [pts[last - 1], pts[last]], tcol(ORANGE), 2.3, false);
    drawDirectionArrow(ctx, map, pts[last - 1], pts[last], tcol(ORANGE));

    for (const p of pts.slice(1, -1)) {
      drawDot(ctx, map, p, tcol("#333"), 3);
    }
  });

  // ----- angle labels on the central ray -----
  ctx.save();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "center";
  const up = result.incident_angle >= 0;

  if (!reflectedAtEntry && centre.points.length >= 4) {
    const entry = map(centre.points[1]);
    const exit = map(centre.points[2]);

    // The beam travels up-and-right when up is true, so the free space is
    // above-left of the entry point and below-right of the other two.
    drawHaloText(ctx, `θ₁ = ${fmt(result.theta1, 1)}°`, entry[0] - 56, entry[1] + (up ? -16 : 26), tcol(ORANGE));
    if (result.theta2 !== null) {
      drawHaloText(ctx, `θ₂ = ${fmt(result.theta2, 1)}°`, entry[0] + 56, entry[1] + (up ? 28 : -16), tcol(PURPLE));
    }
    if (result.theta3 !== null && centre.exit_side === "right") {
      drawHaloText(ctx, `θ₃ = ${fmt(result.theta3, 1)}°`, exit[0] + 56, exit[1] + (up ? 28 : -16), tcol(ORANGE));
    }
  }
  ctx.restore();

  // ----- lateral displacement: the perpendicular between the two parallel lines -----
  if (
    result.lateral_displacement !== null &&
    result.lateral_displacement > 0.02 &&
    centre.points.length >= 4
  ) {
    const start = centre.points[0];
    const entry = centre.points[1];
    const out = centre.points[centre.points.length - 2];

    const ux = entry[0] - start[0];
    const uy = entry[1] - start[1];
    const len = Math.hypot(ux, uy);
    const dir: Point = [ux / len, uy / len];

    // foot of the perpendicular from the exit point onto the undeviated line
    const w: Point = [out[0] - entry[0], out[1] - entry[1]];
    const along = w[0] * dir[0] + w[1] * dir[1];
    const foot: Point = [entry[0] + dir[0] * along, entry[1] + dir[1] * along];

    drawPolyline(ctx, map, [foot, out], tcol(MAGENTA), 2.5, false);
    drawDot(ctx, map, foot, tcol(MAGENTA), 4);

    ctx.save();
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "left";
    const mid = map([(foot[0] + out[0]) / 2, (foot[1] + out[1]) / 2]);
    drawHaloText(ctx, `d = ${fmt(result.lateral_displacement, 2)}`, mid[0] + 12, mid[1] + 22, tcol(MAGENTA));
    ctx.restore();
  }

  // ----- notes -----
  const notes: string[] = [];
  if (result.status !== "Transmitted") {
    notes.push(`${result.status}.`);
  }
  if (result.status === "Reflected at the entry face" && result.critical_angle_entry !== null) {
    notes.push(
      `The incident angle is beyond the critical angle for this boundary (${fmt(
        result.critical_angle_entry,
        1
      )}°).`
    );
  }
  if (!result.same_media && result.status === "Transmitted") {
    notes.push("Different media on the two sides: the emergent ray is no longer parallel to the incident ray.");
  }
  drawNotes(ctx, height, notes);

  const items: LegendItem[] = [
    { label: "Incident / emergent ray", color: tcol(ORANGE), dashed: false },
    { label: "Ray inside the slab", color: tcol(PURPLE), dashed: false },
    { label: "Undeviated path", color: tcol("#999"), dashed: true },
    { label: "Normals", color: tcol("#666"), dashed: true },
  ];
  if (result.lateral_displacement !== null && result.lateral_displacement > 0.02) {
    items.push({ label: "Lateral displacement d", color: tcol(MAGENTA), dashed: false });
  }

  drawLegendStrip(ctx, "Glass slab", "Snell's law at both faces", items);
}

// ============================================================
// APPARENT DEPTH DIAGRAM
// ============================================================

const TOP_Y = 14; // matches the backend

export function drawApparentDepth(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: ApparentDepthResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const h = result.depth;

  // ----- view -----
  const xr = Math.min(Math.max(h * 1.3, 10), 40);
  const xMin = -xr;
  const xMax = xr;
  const yMin = -(h + 4);
  const yMax = TOP_Y + 5;

  const { scale, map } = makeView(canvas, xMin, xMax, yMin, yMax);

  drawGrid(ctx, width, height, map, scale, xMin, xMax, yMin, yMax);

  // ----- lower medium (fills the whole width of the canvas) -----
  const surfaceY = map([0, 0])[1];
  const bottomY = map([0, yMin])[1];

  ctx.save();
  ctx.fillStyle = tcol("rgba(56, 150, 230, 0.16)");
  ctx.fillRect(0, surfaceY, width, bottomY - surfaceY);

  ctx.beginPath();
  ctx.moveTo(0, surfaceY);
  ctx.lineTo(width, surfaceY);
  ctx.strokeStyle = tcol("#0e7490");
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  drawHaloText(ctx, `Upper medium  n = ${fmt(result.n_above, 2)}`, 16, surfaceY - 12, tcol("#444"));
  drawHaloText(ctx, `Lower medium  n = ${fmt(result.n_below, 2)}`, 16, surfaceY + 24, tcol("#0e7490"));
  ctx.restore();

  // vertical axis through the object
  drawPolyline(ctx, map, [[0, yMin], [0, yMax]], tcol("#bbb"), 1.2, true);

  // ----- caustic: where the eye places the object for each viewing direction -----
  if (result.caustic_curve.length > 1) {
    drawPolyline(ctx, map, result.caustic_curve, tcol(PURPLE), 2, true, [2, 4]);
  }

  // ----- rays -----
  const obj: Point = [0, -h];

  for (const ray of result.rays) {
    const [objPt, hit, end] = ray.points;

    if (ray.tir) {
      drawPolyline(ctx, map, [objPt, hit], tcol(BLUE), 1.8, false);
      drawPolyline(ctx, map, [hit, end], tcol(RED), 1.8, true);
      drawDot(ctx, map, hit, tcol(RED), 3.5);
      continue;
    }

    drawPolyline(ctx, map, [objPt, hit], tcol(BLUE), 1.9, false);
    drawPolyline(ctx, map, [hit, end], tcol(ORANGE), 2.1, false);
    drawDirectionArrow(ctx, map, hit, end, tcol(ORANGE));

    if (ray.back_extension) {
      drawPolyline(ctx, map, ray.back_extension, tcol("#888"), 1.2, true);
    }
    drawDot(ctx, map, hit, tcol("#333"), 2.8);

    if (ray.caustic) {
      drawDot(ctx, map, ray.caustic, tcol(PURPLE), 3.4);
    }
  }

  // ----- the object -----
  drawDot(ctx, map, obj, tcol("#111"), 7);
  ctx.save();
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  const objScreen = map(obj);
  drawHaloText(ctx, `Object, real depth = ${fmt(h, 1)}`, objScreen[0] + 14, objScreen[1] + 5, tcol("#111"));
  ctx.restore();

  // ----- the apparent position for near-vertical viewing -----
  const apparent: Point = [0, -result.paraxial_apparent_depth];
  drawDot(ctx, map, apparent, tcol(GREEN), 7);
  ctx.save();
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  const appScreen = map(apparent);
  drawHaloText(
    ctx,
    `Apparent depth (near vertical) = ${fmt(result.paraxial_apparent_depth, 2)}`,
    appScreen[0] + 14,
    appScreen[1] + 5,
    tcol(GREEN)
  );
  ctx.restore();

  // ----- observer -----
  const eye = map([0, TOP_Y + 2.5]);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(eye[0], eye[1], 22, 11, 0, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#fff");
  ctx.fill();
  ctx.strokeStyle = tcol("#333");
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(eye[0], eye[1], 5.5, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#333");
  ctx.fill();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "left";
  drawHaloText(ctx, "Observer", eye[0] + 30, eye[1] + 4, tcol("#333"));
  ctx.restore();

  // ----- notes -----
  const notes: string[] = [];
  if (result.tir_ray_count > 0 && result.critical_angle !== null) {
    notes.push(
      `${result.tir_ray_count} ray${result.tir_ray_count > 1 ? "s are" : " is"} totally internally reflected (critical angle ${fmt(
        result.critical_angle,
        1
      )}°).`
    );
  }
  notes.push(
    "The rays do not meet at one point: the purple dotted curve is where the eye places the object for each viewing direction."
  );
  drawNotes(ctx, height, notes);

  const items: LegendItem[] = [
    { label: "Ray in lower medium", color: tcol(BLUE), dashed: false },
    { label: "Ray in upper medium", color: tcol(ORANGE), dashed: false },
    { label: "Backward extension", color: tcol("#888"), dashed: true },
    { label: "Apparent positions", color: tcol(PURPLE), dashed: true },
  ];
  if (result.tir_ray_count > 0) {
    items.push({ label: "Total internal reflection", color: tcol(RED), dashed: true });
  }

  drawLegendStrip(ctx, "Apparent depth", "Refraction at a flat surface", items);
}
