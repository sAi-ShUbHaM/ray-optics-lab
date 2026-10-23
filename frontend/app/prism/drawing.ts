import { tcol } from "@/lib/canvasTheme";
// Canvas drawing for the Prism and Dispersion page.
// Pure functions only: no React, so they are easy to test on their own.

// ============================================================
// TYPES
// ============================================================

export type Point = [number, number];
type MapFn = (p: Point) => Point;

export type PrismRay = {
  wavelength_nm: number;
  color: string;
  n: number;
  deviation: number | null;
  emerged: boolean;
  events: string[];
  points: Point[];
  screen_y: number | null;
};

export type PrismResult = {
  valid: boolean;
  apex_angle: number;
  n_d: number;
  abbe_number: number;
  cauchy_c0: number;
  cauchy_c1: number;
  incidence_angle: number;
  entry_fraction: number;
  prism: { apex: Point; left: Point; right: Point; height: number };
  incident_start: Point;
  entry_point: Point;
  screen_x: number;
  rays: PrismRay[];
  reference: {
    deviation: number | null;
    emerged: boolean;
    events: string[];
    angles: { theta1: number; r1: number; r2: number; theta4: number } | null;
    normals: { point: Point; direction: Point }[];
  };
  angular_dispersion: number | null;
  screen_spread: number | null;
  min_deviation: number | null;
  min_deviation_incidence: number | null;
  thin_prism_deviation: number;
  critical_angle: number | null;
  curve: Point[];
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
  ctx.setLineDash(dashed ? [6, 4] : []);
  ctx.stroke();
  ctx.restore();
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  p: Point,
  color: string,
  radius = 3
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

type LegendItem = {
  label: string;
  color: string;
  dashed: boolean;
  width?: number;
  colors?: string[]; // when present, drawn as a gradient bar
};

function drawLegendStrip(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  items: LegendItem[]
) {
  const width = ctx.canvas.width;

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

  let x = 380;
  const y = 33;

  for (const item of items) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 26, y);

    if (item.colors && item.colors.length > 1) {
      const gradient = ctx.createLinearGradient(x, 0, x + 26, 0);
      item.colors.forEach((c, i) => gradient.addColorStop(i / (item.colors!.length - 1), c));
      ctx.strokeStyle = gradient;
    } else {
      ctx.strokeStyle = item.color;
    }

    ctx.lineWidth = item.width ?? (item.dashed ? 2 : 3);
    ctx.setLineDash(item.dashed ? [6, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = tcol("#222");
    ctx.font = "12px Arial";
    ctx.fillText(item.label, x + 33, y + 4);
    x += 33 + ctx.measureText(item.label).width + 22;
  }

  ctx.restore();
}

// ============================================================
// PRISM DIAGRAM
// ============================================================

export function drawPrism(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: PrismResult,
  showNormals: boolean
) {
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, width, height);

  // ----- view: fit the prism, the incident beam, the rays and the screen -----
  const H = result.prism.height;
  let xMin = Math.min(result.incident_start[0], result.prism.left[0]) - 2;
  let xMax = result.screen_x + 6;
  let yMin = -3;
  let yMax = H + 3;

  for (const ray of result.rays) {
    for (const p of ray.points) {
      yMin = Math.min(yMin, p[1]);
      yMax = Math.max(yMax, p[1]);
    }
  }
  for (const p of [result.incident_start, result.entry_point]) {
    yMin = Math.min(yMin, p[1] - 1);
    yMax = Math.max(yMax, p[1] + 1);
  }

  // very steep rays must not shrink the whole picture
  yMin = Math.max(yMin, -30);
  yMax = Math.min(yMax, 40);

  const usableHeight = height - LEGEND_BAND - 50;
  const scale = Math.min((width - 60) / (xMax - xMin), usableHeight / (yMax - yMin));

  const offsetX = (width - scale * (xMax - xMin)) / 2;
  const offsetY = LEGEND_BAND + (height - LEGEND_BAND - scale * (yMax - yMin)) / 2 - 10;

  const map: MapFn = (p) => [
    offsetX + (p[0] - xMin) * scale,
    offsetY + (yMax - p[1]) * scale,
  ];

  drawGrid(ctx, width, height, map, scale, xMin, xMax, yMin, yMax);

  // ----- screen -----
  drawPolyline(
    ctx,
    map,
    [
      [result.screen_x, yMin],
      [result.screen_x, yMax],
    ],
    tcol("#bbb"),
    4,
    false
  );
  ctx.save();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "right";
  // put the label at whichever end of the screen is farther from the spectrum
  const hits = result.rays
    .map((ray) => ray.screen_y)
    .filter((y): y is number => y !== null);
  const hitMean = hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : 0;
  const labelAtBottom = hitMean > (yMin + yMax) / 2;

  const screenLabel = map([result.screen_x, labelAtBottom ? yMin : yMax]);
  drawHaloText(
    ctx,
    "Screen",
    screenLabel[0] - 8,
    screenLabel[1] + (labelAtBottom ? -8 : 16),
    tcol("#777")
  );
  ctx.restore();

  // ----- prism -----
  const { apex, left, right } = result.prism;
  const a = map(apex);
  const l = map(left);
  const r = map(right);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(l[0], l[1]);
  ctx.lineTo(r[0], r[1]);
  ctx.closePath();
  ctx.fillStyle = tcol("rgba(14, 116, 144, 0.12)");
  ctx.fill();
  ctx.strokeStyle = tcol("#0e7490");
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.font = "bold 13px Arial";
  ctx.textAlign = "center";
  drawHaloText(ctx, `A = ${fmt(result.apex_angle, 1)}°`, a[0], a[1] - 10, tcol("#0e7490"));
  ctx.restore();

  // ----- normals at the reference ray's surface hits -----
  if (showNormals) {
    for (const item of result.reference.normals) {
      const [px, py] = item.point;
      const [nx, ny] = item.direction;
      drawPolyline(
        ctx,
        map,
        [
          [px - nx * 3, py - ny * 3],
          [px + nx * 3, py + ny * 3],
        ],
        tcol("#666"),
        1.2,
        true
      );
    }
  }

  // ----- undeviated path (what would happen without the prism) -----
  const dx = result.entry_point[0] - result.incident_start[0];
  const dy = result.entry_point[1] - result.incident_start[1];
  if (dx > 1e-9) {
    const t = (result.screen_x - result.entry_point[0]) / dx;
    drawPolyline(
      ctx,
      map,
      [
        result.entry_point,
        [result.entry_point[0] + dx * t, result.entry_point[1] + dy * t],
      ],
      tcol("#999"),
      1.3,
      true
    );
  }

  // ----- incident beam -----
  const mono = result.rays.length === 1;
  const incidentColor = mono ? result.rays[0].color : tcol("#333");
  drawPolyline(
    ctx,
    map,
    [result.incident_start, result.entry_point],
    incidentColor,
    mono ? 3 : 4,
    false
  );
  drawDirectionArrow(ctx, map, result.incident_start, result.entry_point, incidentColor);

  ctx.save();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "left";
  const startLabel = map(result.incident_start);
  drawHaloText(
    ctx,
    mono ? `${fmt(result.rays[0].wavelength_nm, 0)} nm light` : "White light",
    startLabel[0] + 4,
    startLabel[1] - 10,
    tcol("#333")
  );
  ctx.restore();

  // ----- rays, one per wavelength (skip the shared incident segment) -----
  for (const ray of result.rays) {
    drawPolyline(ctx, map, ray.points.slice(1), ray.color, 2.2, false);

    for (const p of ray.points.slice(1, -1)) {
      drawDot(ctx, map, p, ray.color, 2.6);
    }
  }

  // ----- spots on the screen -----
  for (const ray of result.rays) {
    if (ray.screen_y !== null) {
      drawDot(ctx, map, [result.screen_x, ray.screen_y], ray.color, 5);
    }
  }

  const reached = result.rays.filter((ray) => ray.screen_y !== null);
  if (reached.length >= 2) {
    const first = reached[0];
    const last = reached[reached.length - 1];

    ctx.save();
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "left";
    const p1 = map([result.screen_x, first.screen_y as number]);
    const p2 = map([result.screen_x, last.screen_y as number]);

    if (Math.abs(p1[1] - p2[1]) < 14) {
      // the colours land on (almost) the same spot: one label, not two on top of each other
      drawHaloText(ctx, "all colours overlap (no visible spread)", p1[0] + 10, p1[1] + 4, tcol("#444"));
    } else {
      drawHaloText(ctx, `${fmt(first.wavelength_nm, 0)} nm`, p1[0] + 10, p1[1] + 4, tcol("#444"));
      drawHaloText(ctx, `${fmt(last.wavelength_nm, 0)} nm`, p2[0] + 10, p2[1] + 4, tcol("#444"));
    }
    ctx.restore();
  }

  // ----- notes -----
  const notes: string[] = [];
  const trapped = result.rays.filter((ray) => !ray.emerged).length;

  if (!result.reference.emerged) {
    notes.push("The reference ray does not leave the prism (it stays trapped).");
  } else if (trapped > 0 && trapped < result.rays.length) {
    notes.push(
      "Some colours are totally internally reflected: the critical angle depends on wavelength."
    );
  } else if (trapped === result.rays.length) {
    notes.push("None of the rays leave the prism.");
  }

  if (result.reference.events.some((e) => e.startsWith("Total internal reflection"))) {
    notes.push("Total internal reflection occurs inside the prism.");
  }

  ctx.save();
  ctx.fillStyle = tcol("#b45309");
  ctx.font = "13px Arial";
  ctx.textAlign = "left";
  notes.forEach((text, i) => {
    ctx.fillText(text, 20, height - 14 - (notes.length - 1 - i) * 18);
  });
  ctx.restore();

  // ----- legend -----
  const items: LegendItem[] = [
    { label: mono ? "Light" : "White light", color: incidentColor, dashed: false },
    {
      label: mono ? "Refracted ray" : "Refracted rays (by wavelength)",
      color: result.rays[0].color,
      colors: mono ? undefined : result.rays.map((ray) => ray.color),
      dashed: false,
    },
    { label: "Undeviated path", color: tcol("#999"), dashed: true },
  ];
  if (showNormals) {
    items.push({ label: "Surface normals", color: tcol("#666"), dashed: true });
  }

  drawLegendStrip(ctx, "Prism and dispersion", "Snell's law at every surface", items);
}

// ============================================================
// DEVIATION CURVE
// ============================================================

export function drawDeviationCurve(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: PrismResult
) {
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, width, height);

  const left = 64;
  const right = 24;
  const top = 36;
  const bottom = 52;

  const curve = result.curve;

  ctx.textAlign = "left";
  ctx.fillStyle = tcol("#111");
  ctx.font = "bold 14px Arial";
  ctx.fillText("Deviation versus angle of incidence (at n of the D line)", 16, 22);

  ctx.font = "12px Arial";
  ctx.fillStyle = tcol("#666");
  ctx.textAlign = "right";
  ctx.fillText(
    "Left end of the curve: total internal reflection begins at the second face",
    width - 16,
    22
  );
  ctx.textAlign = "left";

  if (curve.length < 2) {
    ctx.fillStyle = tcol("#b45309");
    ctx.font = "13px Arial";
    ctx.fillText("No light can pass through this prism for any incidence angle.", 16, height / 2);
    return;
  }

  const xs = curve.map((p) => p[0]);
  const ys = curve.map((p) => p[1]);

  const xMin = Math.min(...xs, result.incidence_angle) - 2;
  const xMax = Math.max(...xs, result.incidence_angle) + 2;
  const yLo = Math.min(...ys);
  const yHi = Math.max(...ys);
  const yMin = Math.floor((yLo - (yHi - yLo) * 0.15) / 5) * 5;
  const yMax = Math.ceil((yHi + (yHi - yLo) * 0.1) / 5) * 5;

  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const px = (x: number) => left + ((x - xMin) / (xMax - xMin)) * plotW;
  const py = (y: number) => top + (1 - (y - yMin) / (yMax - yMin)) * plotH;

  // grid + axis labels
  ctx.font = "12px Arial";
  ctx.strokeStyle = tcol("#eee");
  ctx.fillStyle = tcol("#555");
  ctx.lineWidth = 1;

  const xStep = xMax - xMin > 120 ? 30 : 10;
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    ctx.beginPath();
    ctx.moveTo(px(x), top);
    ctx.lineTo(px(x), top + plotH);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(`${x}°`, px(x), top + plotH + 18);
  }

  const yStep = yMax - yMin > 60 ? 20 : 10;
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    ctx.beginPath();
    ctx.moveTo(left, py(y));
    ctx.lineTo(left + plotW, py(y));
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(`${y}°`, left - 8, py(y) + 4);
  }

  ctx.strokeStyle = tcol("#555");
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + plotH);
  ctx.lineTo(left + plotW, top + plotH);
  ctx.stroke();

  ctx.fillStyle = tcol("#333");
  ctx.font = "13px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Angle of incidence θ₁", left + plotW / 2, height - 10);

  ctx.save();
  ctx.translate(16, top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Deviation δ", 0, 0);
  ctx.restore();

  // curve
  ctx.beginPath();
  curve.forEach((p, i) => {
    if (i === 0) ctx.moveTo(px(p[0]), py(p[1]));
    else ctx.lineTo(px(p[0]), py(p[1]));
  });
  ctx.strokeStyle = tcol("#0e7490");
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // minimum deviation
  if (result.min_deviation !== null && result.min_deviation_incidence !== null) {
    const mx = px(result.min_deviation_incidence);
    const my = py(result.min_deviation);

    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = tcol("#e11d48");
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx, top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.beginPath();
    ctx.arc(mx, my, 5, 0, Math.PI * 2);
    ctx.fillStyle = tcol("#e11d48");
    ctx.fill();

    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    drawHaloText(
      ctx,
      `minimum δ = ${fmt(result.min_deviation, 1)}° at θ₁ = ${fmt(
        result.min_deviation_incidence,
        1
      )}°`,
      mx,
      my - 34,
      tcol("#e11d48")
    );
  }

  // current setting
  const x0 = px(result.incidence_angle);
  const current = result.reference.angles !== null ? result.reference.deviation : null;

  if (current !== null) {
    ctx.beginPath();
    ctx.arc(x0, py(current), 6, 0, Math.PI * 2);
    ctx.fillStyle = tcol("#1671d9");
    ctx.fill();
    ctx.strokeStyle = tcol("#fff");
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = "bold 12px Arial";
    ctx.textAlign = "left";
    drawHaloText(
      ctx,
      `now: δ = ${fmt(current, 1)}°`,
      x0 + 10,
      py(current) + 20,
      tcol("#1671d9")
    );
  } else {
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = tcol("#b45309");
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, top);
    ctx.lineTo(x0, top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = "bold 12px Arial";
    ctx.textAlign = "left";
    drawHaloText(ctx, "now: no simple pass (total internal reflection)", x0 + 8, top + 18, tcol("#b45309"));
  }
}
