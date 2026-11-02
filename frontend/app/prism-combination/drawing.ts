import { canvasFont, tcol } from "@/lib/canvasTheme";

export type Pt = [number, number];

export type Step = {
  surface: string;
  n_before: number;
  n_after: number;
  incidence_angle: number;
  refraction_angle: number;
  bend: number;
  direction_angle: number;
};

export type AloneSummary = {
  mean_deviation: number | null;
  angular_dispersion: number | null;
};

export type CombinationResult = {
  valid: boolean;
  arrangement: "same" | "opposite";
  cemented: boolean;
  gap: number;
  incidence_angle: number;
  prism_1: { apex_angle: number; n_d: number; abbe_number: number };
  prism_2: { apex_angle: number; n_d: number; abbe_number: number };
  outlines: { prism: number; polygon: Pt[]; apex: Pt; apex_angle: number; turned_over: boolean }[];
  faces: { name: string; point: Pt; normal_angle: number; segment: [Pt, Pt] }[];
  incident_start: Pt;
  entry_point: Pt;
  screen_x: number;
  rays: {
    wavelength_nm: number;
    color: string;
    n1: number;
    n2: number;
    deviation: number | null;
    emerged: boolean;
    events: string[];
    points: Pt[];
    screen_y: number | null;
  }[];
  reference: {
    deviation: number | null;
    emerged: boolean;
    events: string[];
    inside_faces: boolean;
    steps: Step[];
  };
  summary: {
    mean_deviation: number | null;
    deviation_f: number | null;
    deviation_c: number | null;
    angular_dispersion: number | null;
    first_alone: AloneSummary;
    second_alone: AloneSummary;
    dispersion_left: number | null;
    screen_spread: number | null;
    thin_mean_deviation: number;
    thin_angular_dispersion: number;
    ideal_apex_achromatic: number;
    ideal_apex_direct_vision: number;
    all_emerged: boolean;
  };
  curve: {
    wavelength_nm: number;
    color: string;
    pair: number | null;
    first_alone: number | null;
    second_alone: number | null;
  }[];
};

type MapFn = (p: Pt) => Pt;

function fmt(x: number, digits = 2) {
  const s = x.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

function halo(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  font: string,
  align: CanvasTextAlign = "left",
  keepInside = true,
) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  if (keepInside) {
    const w = ctx.measureText(text).width;
    const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
    const limit = Math.max(6, ctx.canvas.width - 6 - w);
    x += Math.min(Math.max(left, 6), limit) - left;
    y = Math.min(Math.max(y, 12), ctx.canvas.height - 10);
  }
  ctx.lineWidth = 4;
  ctx.strokeStyle = tcol("#fff");
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function polyline(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  points: Pt[],
  color: string,
  width: number,
  dash: number[] = [],
) {
  if (points.length < 2) return;
  ctx.beginPath();
  points.forEach((pt, i) => {
    const [x, y] = map(pt);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.setLineDash([]);
}

// ---------------------------------------------------------------------
// The two prisms and the light
// ---------------------------------------------------------------------

export const LAYOUT_CANVAS_WIDTH = 900;
const MARGIN = { left: 24, right: 24, top: 28, bottom: 28 };
const MIN_HEIGHT = 300;
const MAX_HEIGHT = 620;

function layoutView(data: CombinationResult, W: number, maxHeight = MAX_HEIGHT) {
  const xs: number[] = [data.entry_point[0] - 7, data.screen_x + 2];
  const ys: number[] = [];
  for (const o of data.outlines) for (const p of o.polygon) { xs.push(p[0]); ys.push(p[1]); }
  for (const r of data.rays) for (const p of r.points) if (p[0] >= xs[0]) ys.push(p[1]);
  ys.push(-4, 4);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys) - 1;
  const yMax = Math.max(...ys) + 1;
  const scale = Math.min(
    (W - MARGIN.left - MARGIN.right) / (xMax - xMin),
    (maxHeight - MARGIN.top - MARGIN.bottom) / (yMax - yMin),
    60,
  );
  return { xMin, xMax, yMin, yMax, scale };
}

export function layoutCanvasHeight(data: CombinationResult, W = LAYOUT_CANVAS_WIDTH) {
  const v = layoutView(data, W);
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round((v.yMax - v.yMin) * v.scale + MARGIN.top + MARGIN.bottom)));
}

export function drawLayout(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: CombinationResult,
) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, W, H);

  const v = layoutView(data, W, Math.max(H, MIN_HEIGHT));
  const offX = MARGIN.left + (W - MARGIN.left - MARGIN.right - (v.xMax - v.xMin) * v.scale) / 2;
  const offY = MARGIN.top + (H - MARGIN.top - MARGIN.bottom - (v.yMax - v.yMin) * v.scale) / 2;
  const map: MapFn = (p) => [offX + (p[0] - v.xMin) * v.scale, offY + (v.yMax - p[1]) * v.scale];

  // the prisms
  const tints = [tcol("rgba(22, 113, 217, 0.14)"), tcol("rgba(22, 163, 74, 0.10)")];
  data.outlines.forEach((o, i) => {
    ctx.beginPath();
    o.polygon.forEach((pt, k) => {
      const [x, y] = map(pt);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = tints[i % 2];
    ctx.fill();
    ctx.strokeStyle = tcol("#777");
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();

    // the prism's number, near the middle of the triangle
    const cx = o.polygon.reduce((sum, p) => sum + p[0], 0) / o.polygon.length;
    const cy = o.polygon.reduce((sum, p) => sum + p[1], 0) / o.polygon.length;
    const [tx, ty] = map([cx, cy]);
    halo(ctx, `${o.prism}`, tx, ty, tcol("#555"), canvasFont(22, "sans", 700), "center");

    // the apex angle, written at the apex (side by side when both prisms share an apex)
    const [ax, ay] = map(o.apex);
    const [bx, by] = map(data.outlines[1 - i]?.apex ?? o.apex);
    const sharedApex = data.outlines.length > 1 && Math.hypot(ax - bx, ay - by) < 15;
    const dx = sharedApex ? (i === 0 ? -28 : 28) : 0;
    halo(ctx, `${fmt(o.apex_angle, 1)}°`, ax + dx, ay + (o.turned_over ? 22 : -20), tcol("#777"), canvasFont(14, "mono", 400), "center");
  });

  // faces: dashed normals for the d-line ray are shown as small ticks at the hit points
  // the incident light
  const incident: Pt[] = [data.incident_start, data.entry_point];
  polyline(ctx, map, incident, tcol("#111"), 3.2);
  const [ix, iy] = map([data.entry_point[0] - 3.2, data.entry_point[1]]);
  halo(ctx, "white light", ix - 4, iy - 18, tcol("#555"), canvasFont(15, "sans", 500), "center");

  // the screen
  const [sx, sTop] = map([data.screen_x, v.yMax]);
  const [, sBottom] = map([data.screen_x, v.yMin]);
  ctx.beginPath();
  ctx.moveTo(sx, sTop);
  ctx.lineTo(sx, sBottom);
  ctx.strokeStyle = tcol("#555");
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.stroke();
  halo(ctx, "screen", sx - 8, sTop + 14, tcol("#555"), canvasFont(15, "sans", 500), "right");

  // the coloured rays
  for (const ray of data.rays) {
    polyline(ctx, map, ray.points, ray.color, 2.2);
  }
  for (const ray of data.rays) {
    if (ray.screen_y !== null) {
      const [x, y] = map([data.screen_x, ray.screen_y]);
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = ray.color;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = tcol("#111");
      ctx.stroke();
    }
  }

  // rays that did not get through
  const lost = data.rays.filter((r) => !r.emerged);
  if (lost.length > 0) {
    const ray = lost[0];
    const [x, y] = map(ray.points[ray.points.length - 2] ?? data.entry_point);
    ctx.strokeStyle = tcol("#dc2626");
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 8);
    ctx.lineTo(x + 8, y + 8);
    ctx.moveTo(x + 8, y - 8);
    ctx.lineTo(x - 8, y + 8);
    ctx.stroke();
    halo(ctx, ray.events[ray.events.length - 1] ?? "not transmitted", x, y - 24, tcol("#dc2626"), canvasFont(15, "mono", 700), "center");
  }

  // the mean deviation, written beside the emerging beam
  const dev = data.summary.mean_deviation;
  const mid = data.rays[Math.floor(data.rays.length / 2)];
  if (dev !== null && mid && mid.emerged) {
    const p = mid.points[mid.points.length - 1];
    const q = mid.points[mid.points.length - 2];
    const [x, y] = map([(p[0] + q[0]) / 2 - (p[0] - q[0]) * 0.12, (p[1] + q[1]) / 2 - (p[1] - q[1]) * 0.12]);
    halo(ctx, `δ = ${fmt(dev)}°`, x, y - 22, tcol("#e67e00"), canvasFont(17, "mono", 700), "center");
  }
}

// ---------------------------------------------------------------------
// Graph: how the deviation changes with colour
// ---------------------------------------------------------------------

export const GRAPH_CANVAS_SIZE = { width: 900, height: 400 };

type SeriesKey = "pair" | "first_alone" | "second_alone";

const SERIES: { key: SeriesKey; label: string; width: number; dash: number[] }[] = [
  { key: "pair", label: "the pair", width: 4, dash: [] },
  { key: "first_alone", label: "prism 1 alone", width: 2.6, dash: [8, 5] },
  { key: "second_alone", label: "prism 2 alone", width: 2.6, dash: [3, 4] },
];

function seriesColor(key: SeriesKey) {
  return tcol(key === "pair" ? "#e67e00" : key === "first_alone" ? "#1671d9" : "#16a34a");
}

/** The mean (yellow-light) deviation of each curve, which the graph subtracts. */
function referenceValue(data: CombinationResult, key: SeriesKey) {
  if (key === "pair") return data.summary.mean_deviation;
  if (key === "first_alone") return data.summary.first_alone.mean_deviation;
  return data.summary.second_alone.mean_deviation;
}

export function drawGraph(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: CombinationResult,
) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, W, H);

  const m = { l: 74, r: 24, t: 58, b: 78 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;

  // every curve is drawn relative to its own value for yellow light, in arcminutes
  const rel = (key: SeriesKey) => {
    const ref = referenceValue(data, key);
    return data.curve.map((c) => {
      const v = c[key];
      return v === null || ref === null ? null : (v - ref) * 60;
    });
  };
  const all = SERIES.map((s) => rel(s.key));
  const values = all.flat().filter((v): v is number => v !== null);
  if (values.length === 0) {
    halo(ctx, "no ray gets through at these settings", W / 2, H / 2, tcol("#dc2626"), canvasFont(18, "sans", 500), "center");
    return;
  }
  let lo = Math.min(...values, 0);
  let hi = Math.max(...values, 0);
  if (hi - lo < 0.05) { lo -= 0.1; hi += 0.1; }
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;

  const X = (nm: number) => m.l + ((nm - 400) / 300) * pw;
  const Y = (v: number) => m.t + ph - ((v - lo) / (hi - lo)) * ph;
  const tick = canvasFont(14, "mono", 400);
  const span = hi - lo;
  const digits = span < 0.5 ? 2 : span < 30 ? 1 : 0;

  // grid
  ctx.lineWidth = 1;
  for (let nm = 400; nm <= 700; nm += 50) {
    ctx.strokeStyle = tcol("#eee");
    ctx.beginPath();
    ctx.moveTo(X(nm), m.t);
    ctx.lineTo(X(nm), m.t + ph);
    ctx.stroke();
    halo(ctx, `${nm}`, X(nm), m.t + ph + 40, tcol("#555"), tick, "center");
  }
  for (let k = 0; k <= 5; k++) {
    const v = lo + (span * k) / 5;
    ctx.strokeStyle = tcol("#eee");
    ctx.beginPath();
    ctx.moveTo(m.l, Y(v));
    ctx.lineTo(m.l + pw, Y(v));
    ctx.stroke();
    halo(ctx, fmt(v, digits), m.l - 8, Y(v), tcol("#555"), tick, "right");
  }
  // zero line: the yellow (sodium D) light
  ctx.strokeStyle = tcol("#999");
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(m.l, Y(0));
  ctx.lineTo(m.l + pw, Y(0));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = tcol("#777");
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m.l, m.t, pw, ph);

  // the colours of the spectrum along the wavelength axis
  const stripY = m.t + ph + 8;
  for (let i = 0; i < data.curve.length - 1; i++) {
    const a = X(data.curve[i].wavelength_nm);
    const b = X(data.curve[i + 1].wavelength_nm);
    ctx.fillStyle = data.curve[i].color;
    ctx.fillRect(a, stripY, b - a + 1, 12);
  }

  // curves
  SERIES.forEach((s, idx) => {
    ctx.beginPath();
    let started = false;
    data.curve.forEach((c, i) => {
      const v = all[idx][i];
      if (v === null) { started = false; return; }
      const x = X(c.wavelength_nm);
      const y = Y(v);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = seriesColor(s.key);
    ctx.lineWidth = s.width;
    ctx.setLineDash(s.dash);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // legend above the plot: each curve and how much it moves between blue and red
  const colW = pw / SERIES.length;
  SERIES.forEach((s, idx) => {
    const v = all[idx].filter((x): x is number => x !== null);
    const change = v.length ? Math.max(...v) - Math.min(...v) : null;
    const x0 = m.l + idx * colW;
    ctx.beginPath();
    ctx.moveTo(x0 + 4, 20);
    ctx.lineTo(x0 + 38, 20);
    ctx.strokeStyle = seriesColor(s.key);
    ctx.lineWidth = s.width;
    ctx.setLineDash(s.dash);
    ctx.stroke();
    ctx.setLineDash([]);
    halo(ctx, s.label, x0 + 46, 20, tcol("#111"), canvasFont(15, "sans", 600));
    if (change !== null) {
      halo(ctx, `moves ${fmt(change, change < 1 ? 2 : 1)}′`, x0 + 46, 40, tcol("#555"), canvasFont(14, "mono", 400));
    }
  });

  halo(ctx, "Wavelength (nm)", m.l + pw / 2, H - 12, tcol("#111"), canvasFont(16, "sans", 500), "center");
  ctx.save();
  ctx.translate(20, m.t + ph / 2);
  ctx.rotate(-Math.PI / 2);
  halo(ctx, "Deviation compared with yellow light (arcminutes)", 0, 0, tcol("#111"), canvasFont(15, "sans", 500), "center", false);
  ctx.restore();
}

// ---------------------------------------------------------------------
// The emerging colours, with their directions magnified
// ---------------------------------------------------------------------
// The colours leave the prisms at angles that differ by only a few arcminutes,
// far too little to see. This view draws the angle of each colour around its
// own mean direction, magnified by the same factor for both panels.

export const MAGNIFIED_CANVAS_SIZE = { width: 900, height: 300 };

export function magnificationFactor(data: CombinationResult) {
  // the widest fan of the two panels decides how far the angles can be magnified
  let widest = 1e-9;
  for (const [key, mean] of [
    ["first_alone", data.summary.first_alone.mean_deviation],
    ["pair", data.summary.mean_deviation],
  ] as const) {
    if (mean === null) continue;
    for (const c of data.curve) {
      const v = c[key];
      if (v !== null) widest = Math.max(widest, Math.abs(v - mean));
    }
  }
  return Math.max(1, Math.min(4000, 9 / widest));
}

export function drawMagnified(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: CombinationResult,
) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, W, H);

  const K = magnificationFactor(data);
  const panels: { key: SeriesKey; title: string; mean: number | null; spread: number | null }[] = [
    { key: "first_alone", title: "Prism 1 alone", mean: data.summary.first_alone.mean_deviation, spread: data.summary.first_alone.angular_dispersion },
    { key: "pair", title: "The pair", mean: data.summary.mean_deviation, spread: data.summary.angular_dispersion },
  ];

  const panelW = W / 2;
  panels.forEach((panel, idx) => {
    const x0 = idx * panelW + 40;
    const x1 = (idx + 1) * panelW - 30;
    const y0 = H / 2 + 14;
    halo(ctx, panel.title, idx * panelW + 24, 22, tcol("#111"), canvasFont(17, "sans", 700));
    halo(
      ctx,
      panel.mean === null ? "no ray gets through" : `mean deviation ${fmt(panel.mean)}°   F–C ${fmt(Math.abs(panel.spread ?? 0) * 60, 1)}′`,
      idx * panelW + 24,
      44,
      tcol("#555"),
      canvasFont(14, "mono", 400),
    );

    // the mean direction
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.strokeStyle = tcol("#999");
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (panel.mean === null) return;
    // every colour: its angle relative to the mean, times K (positive = bent further down)
    data.curve.forEach((c, i) => {
      if (i % 2 !== 0) return;
      const v = c[panel.key];
      if (v === null) return;
      const angle = ((v - panel.mean!) * K * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y0 + (x1 - x0) * Math.tan(angle));
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.stroke();
    });
    ctx.beginPath();
    ctx.arc(x0, y0, 5, 0, Math.PI * 2);
    ctx.fillStyle = tcol("#111");
    ctx.fill();
  });

  // divider and the magnification
  ctx.beginPath();
  ctx.moveTo(W / 2, 14);
  ctx.lineTo(W / 2, H - 40);
  ctx.strokeStyle = tcol("#ddd");
  ctx.lineWidth = 1;
  ctx.stroke();
  halo(
    ctx,
    `Angles around each mean direction are magnified × ${K >= 10 ? Math.round(K) : fmt(K, 1)} (same for both)`,
    W / 2,
    H - 18,
    tcol("#555"),
    canvasFont(14, "sans", 500),
    "center",
  );
}
