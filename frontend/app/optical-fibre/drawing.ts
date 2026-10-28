import { canvasFont, tcol } from "@/lib/canvasTheme";

export type Pt = [number, number];

export type FibreRay = {
  points: Pt[];
  reflections: Pt[];
  guided: boolean;
  leaks: boolean;
  leak: {
    point: Pt;
    wall: string;
    incidence_deg: number;
    refracted_deg: number;
  } | null;
  truncated: boolean;
  reflection_count: number;
};

export type FibreResult = {
  valid: boolean;
  fibre: {
    n_core: number;
    n_cladding: number;
    n_outside: number;
    core_diameter_um: number;
    length_m: number;
    half_width: number;
    cladding_drawn: number;
  };
  numbers: {
    critical_angle: number;
    numerical_aperture: number;
    acceptance_angle: number;
    acceptance_cone: number;
    all_angles_accepted: boolean;
    max_axial_angle: number;
    relative_index_difference: number;
    modal_dispersion_ns: number;
    modal_dispersion_ns_per_km: number;
    wavelength_nm: number;
    v_number: number;
    single_mode: boolean;
    estimated_modes: number;
    single_mode_cutoff_diameter_um: number;
  };
  selected: {
    entry_angle: number;
    refracted_angle: number | null;
    wall_incidence: number | null;
    margin_deg: number | null;
    guided_in_straight_fibre: boolean;
    enters: boolean;
    inside_acceptance_cone: boolean;
    reflections_total: number;
    path_length_m: number | null;
    path_stretch: number | null;
    travel_time_ns: number | null;
    delay_vs_axial_ns: number | null;
  };
  path: FibreRay | null;
  fan: {
    entry_angle: number;
    guided: boolean;
    points: Pt[];
    inside_acceptance_cone: boolean;
  }[];
  sweep: { entry_angle: number; wall_incidence: number | null; guided: boolean }[];
  bend: {
    bent: boolean;
    radius_diameters: number | null;
    angle_deg: number | null;
    minimum_radius_diameters: number;
    minimum_radius_um: number;
    centre_ray_minimum_radius_diameters: number;
  };
  outline: {
    core_upper: Pt[];
    core_lower: Pt[];
    clad_upper: Pt[];
    clad_lower: Pt[];
  };
  bounds: { x_min: number; x_max: number; y_min: number; y_max: number };
};

const RAD = Math.PI / 180;
const OUTSIDE_LENGTH = 2.8; // how far the incoming rays are drawn, in core diameters
const CONE_RADIUS = 2.6;    // radius of the drawn acceptance cone, in core diameters

function fmt(x: number, digits = 1) {
  const s = x.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

function unit(v: Pt): Pt {
  const n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
}

function wrapPi(x: number) {
  let v = x;
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v <= -Math.PI) v += 2 * Math.PI;
  return v;
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

  // nudge the label so that all of it stays on the canvas
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

function arrowHead(
  ctx: CanvasRenderingContext2D,
  tip: Pt,
  dirScreen: Pt,
  color: string,
  size = 11,
) {
  const [ux, uy] = unit(dirScreen);
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

type MapFn = (p: Pt) => Pt;

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

function band(ctx: CanvasRenderingContext2D, map: MapFn, upper: Pt[], lower: Pt[], fill: string) {
  ctx.beginPath();
  upper.forEach((pt, i) => {
    const [x, y] = map(pt);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  [...lower].reverse().forEach((pt) => {
    const [x, y] = map(pt);
    ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// ---------------------------------------------------------------------
// The fibre and its rays
// ---------------------------------------------------------------------

/** Logical drawing width. The canvas is shown at roughly this size, so the text
 *  sizes below are close to the sizes you read on screen. */
export const FIBRE_CANVAS_WIDTH = 900;

const MARGIN = { left: 28, right: 28, top: 46, bottom: 22 };

const MAX_FIBRE_HEIGHT = 760;
const MIN_FIBRE_HEIGHT = 280;

function fibreView(data: FibreResult, W: number, maxHeight = MAX_FIBRE_HEIGHT) {
  const o = data.outline;
  const all = [...o.core_upper, ...o.core_lower, ...o.clad_upper, ...o.clad_lower];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const cone = Math.min(data.numbers.acceptance_angle * RAD, Math.PI / 2);
  const xMin = Math.min(...xs, -OUTSIDE_LENGTH - 0.2);
  const xMax = Math.max(...xs) + 0.2;
  const yMin = Math.min(Math.min(...ys) - 0.7, -(CONE_RADIUS * Math.sin(cone) + 0.2));
  const yMax = Math.max(Math.max(...ys) + 0.7, CONE_RADIUS * Math.sin(cone) + 0.2);
  // the scale is limited by the width and by the tallest canvas we allow
  const scale = Math.min(
    (W - MARGIN.left - MARGIN.right) / (xMax - xMin),
    (maxHeight - MARGIN.top - MARGIN.bottom) / (yMax - yMin),
    110,
  );
  return { xMin, xMax, yMin, yMax, scale };
}

/** Height that fits the fibre without wasted space. A straight fibre is wide and
 *  short; a strong bend needs more height. */
export function fibreCanvasHeight(data: FibreResult, W = FIBRE_CANVAS_WIDTH) {
  const v = fibreView(data, W);
  const h = (v.yMax - v.yMin) * v.scale + MARGIN.top + MARGIN.bottom;
  return Math.max(MIN_FIBRE_HEIGHT, Math.min(MAX_FIBRE_HEIGHT, Math.round(h)));
}

export function drawFibre(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: FibreResult,
) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, W, H);

  const v = fibreView(data, W, Math.max(H, MIN_FIBRE_HEIGHT));
  const offX = MARGIN.left + (W - MARGIN.left - MARGIN.right - (v.xMax - v.xMin) * v.scale) / 2;
  const offY = MARGIN.top + (H - MARGIN.top - MARGIN.bottom - (v.yMax - v.yMin) * v.scale) / 2;
  const scale = v.scale;
  const map: MapFn = (p) => [offX + (p[0] - v.xMin) * scale, offY + (v.yMax - p[1]) * scale];

  const n = data.numbers;
  const f = data.fibre;
  const o = data.outline;

  // cladding, then core on top
  band(ctx, map, o.clad_upper, o.clad_lower, tcol("#eee"));
  band(ctx, map, o.core_upper, o.core_lower, tcol("rgba(22, 113, 217, 0.14)"));
  polyline(ctx, map, o.clad_upper, tcol("#bbb"), 1.4);
  polyline(ctx, map, o.clad_lower, tcol("#bbb"), 1.4);
  polyline(ctx, map, o.core_upper, tcol("#777"), 2);
  polyline(ctx, map, o.core_lower, tcol("#777"), 2);

  // axis
  const axis: Pt[] = o.core_upper.map((p, i) => [
    (p[0] + o.core_lower[i][0]) / 2,
    (p[1] + o.core_lower[i][1]) / 2,
  ]);
  polyline(ctx, map, [[-OUTSIDE_LENGTH, 0], ...axis], tcol("#999"), 1, [6, 6]);

  // acceptance cone at the entry face
  const cone = n.acceptance_angle * RAD;
  const coneEdge = (a: number): Pt => [-CONE_RADIUS * Math.cos(a), CONE_RADIUS * Math.sin(a)];
  const wedge: Pt[] = [[0, 0]];
  const steps = 40;
  for (let k = 0; k <= steps; k++) wedge.push(coneEdge(-cone + (2 * cone * k) / steps));
  ctx.beginPath();
  wedge.forEach((pt, i) => {
    const [x, y] = map(pt);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = tcol("rgba(22, 163, 74, 0.10)");
  ctx.fill();
  if (!n.all_angles_accepted) {
    polyline(ctx, map, [[0, 0], coneEdge(cone)], tcol("#16a34a"), 1.8, [7, 5]);
    polyline(ctx, map, [[0, 0], coneEdge(-cone)], tcol("#16a34a"), 1.8, [7, 5]);
  }
  // the end face
  polyline(ctx, map, [[0, -f.half_width - f.cladding_drawn], [0, f.half_width + f.cladding_drawn]], tcol("#555"), 2);

  // a fan of rays: guided ones in blue, lost ones in red
  const blue = tcol("#1671d9");
  const red = tcol("#dc2626");
  for (const ray of data.fan) {
    const a = ray.entry_angle * RAD;
    const source: Pt = [-OUTSIDE_LENGTH * Math.cos(a), -OUTSIDE_LENGTH * Math.sin(a)];
    polyline(ctx, map, [source, ...ray.points], ray.guided ? blue : red, 1.8, ray.guided ? [] : [8, 5]);
  }

  // the selected ray
  const orange = tcol("#e67e00");
  const path = data.path;
  if (path) {
    const a = data.selected.entry_angle * RAD;
    const start = path.points[0];
    const source: Pt = [start[0] - OUTSIDE_LENGTH * Math.cos(a), start[1] - OUTSIDE_LENGTH * Math.sin(a)];
    const pts: Pt[] = [source, ...path.points];
    polyline(ctx, map, pts, orange, 3.6);

    // direction arrows
    for (let i = 0; i < Math.min(pts.length - 1, 7); i++) {
      const q0 = map(pts[i]);
      const q1 = map(pts[i + 1]);
      if (Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) > 50) {
        arrowHead(ctx, [(q0[0] + q1[0]) / 2, (q0[1] + q1[1]) / 2], [q1[0] - q0[0], q1[1] - q0[1]], orange, 13);
      }
    }

    // reflection points
    for (const r of path.reflections.slice(0, 40)) {
      const [x, y] = map(r);
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = tcol("#fff");
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = orange;
      ctx.stroke();
    }

    // where the ray leaks out
    if (path.leak) {
      const [x, y] = map(path.leak.point);
      ctx.strokeStyle = red;
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8);
      ctx.lineTo(x + 8, y + 8);
      ctx.moveTo(x + 8, y - 8);
      ctx.lineTo(x - 8, y + 8);
      ctx.stroke();
      const above = path.leak.point[1] >= 0;
      halo(
        ctx,
        `leaks here: i = ${fmt(path.leak.incidence_deg)}° < θc`,
        Math.min(Math.max(x, 150), W - 150),
        y + (above ? -24 : 24),
        red,
        canvasFont(16, "mono", 700),
        "center",
      );
    }

    // entry angle
    const c = map(path.points[0]);
    const aSource = Math.atan2(-Math.sin(a), -Math.cos(a));
    const aLeft = Math.PI;
    const diff = wrapPi(aSource - aLeft);
    if (Math.abs(diff) > 0.03) {
      const r = 0.8 * scale;
      ctx.beginPath();
      ctx.arc(c[0], c[1], r, -aLeft, -(aLeft + diff), diff > 0);
      ctx.strokeStyle = orange;
      ctx.lineWidth = 2.2;
      ctx.stroke();
      halo(
        ctx,
        `θ₀ = ${fmt(data.selected.entry_angle)}°`,
        c[0] - 18,
        c[1] + (diff > 0 ? -34 : 34),
        orange,
        canvasFont(17, "mono", 700),
        "right",
      );
    }

    // the angle at the wall (straight fibre): written in the cladding, clear of the rays
    if (!data.bend.bent && path.reflections.length > 0 && data.selected.wall_incidence !== null) {
      const P = path.reflections[0];
      const [x, y] = map([P[0] + 1.5, P[1] + (P[1] > 0 ? 0.36 : -0.36)]);
      halo(
        ctx,
        `φ = ${fmt(data.selected.wall_incidence)}° ${data.selected.guided_in_straight_fibre ? "> θc" : "< θc"}`,
        x,
        y,
        orange,
        canvasFont(16, "mono", 700),
        "center",
      );
    }
  }

  // acceptance cone caption, top left
  halo(
    ctx,
    n.all_angles_accepted ? "every entry angle is accepted" : `acceptance cone 2θmax = ${fmt(n.acceptance_cone)}°`,
    MARGIN.left,
    22,
    tcol("#16a34a"),
    canvasFont(17, "sans", 700),
    "left",
  );
}

// ---------------------------------------------------------------------
// Graph: angle at the wall against entry angle
// ---------------------------------------------------------------------

export const SWEEP_CANVAS_SIZE = { width: 900, height: 360 };

export function drawSweep(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: FibreResult,
) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, W, H);

  const m = { l: 64, r: 22, t: 34, b: 58 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const X = (a: number) => m.l + ((a + 90) / 180) * pw;
  const Y = (v: number) => m.t + ph - (v / 90) * ph;

  const n = data.numbers;
  const tick = canvasFont(14, "mono", 400);

  // grid and ticks
  ctx.lineWidth = 1;
  for (let a = -90; a <= 90; a += 30) {
    ctx.strokeStyle = tcol(a === 0 ? "#bbb" : "#eee");
    ctx.beginPath();
    ctx.moveTo(X(a), m.t);
    ctx.lineTo(X(a), m.t + ph);
    ctx.stroke();
    halo(ctx, `${a}°`, X(a), m.t + ph + 18, tcol("#555"), tick, "center");
  }
  for (let v = 0; v <= 90; v += 15) {
    ctx.strokeStyle = tcol("#eee");
    ctx.beginPath();
    ctx.moveTo(m.l, Y(v));
    ctx.lineTo(m.l + pw, Y(v));
    ctx.stroke();
    halo(ctx, `${v}°`, m.l - 8, Y(v), tcol("#555"), tick, "right");
  }
  ctx.strokeStyle = tcol("#777");
  ctx.lineWidth = 1.5;
  ctx.strokeRect(m.l, m.t, pw, ph);

  // accepted region
  const a1 = n.all_angles_accepted ? 90 : n.acceptance_angle;
  ctx.fillStyle = tcol("rgba(22, 163, 74, 0.10)");
  ctx.fillRect(X(-a1), m.t, X(a1) - X(-a1), ph);
  if (!n.all_angles_accepted) {
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = tcol("#16a34a");
    ctx.lineWidth = 1.8;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(X(s * a1), m.t);
      ctx.lineTo(X(s * a1), m.t + ph);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    halo(ctx, `+θmax = ${fmt(a1)}°`, X(a1) + 8, m.t + 16, tcol("#16a34a"), canvasFont(15, "mono", 700));
    halo(ctx, "−θmax", X(-a1) - 8, m.t + 16, tcol("#16a34a"), canvasFont(15, "mono", 700), "right");
  }

  // critical angle
  ctx.setLineDash([9, 6]);
  ctx.strokeStyle = tcol("#7c3aed");
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(m.l, Y(n.critical_angle));
  ctx.lineTo(m.l + pw, Y(n.critical_angle));
  ctx.stroke();
  ctx.setLineDash([]);
  const farEnd = data.sweep.find((p) => p.entry_angle === 80)?.wall_incidence ?? 0;
  const labelAbove = farEnd < n.critical_angle;
  halo(
    ctx,
    `critical angle θc = ${fmt(n.critical_angle)}°`,
    m.l + pw - 10,
    Y(n.critical_angle) + (labelAbove ? -14 : 20),
    tcol("#7c3aed"),
    canvasFont(15, "mono", 700),
    "right",
  );

  // the curve, coloured by whether the ray is guided
  const pts = data.sweep.filter((s) => s.wall_incidence !== null);
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    ctx.beginPath();
    ctx.moveTo(X(p0.entry_angle), Y(p0.wall_incidence as number));
    ctx.lineTo(X(p1.entry_angle), Y(p1.wall_incidence as number));
    ctx.strokeStyle = tcol(p1.guided && p0.guided ? "#1671d9" : "#dc2626");
    ctx.lineWidth = 3.6;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  // the selected ray
  const s = data.selected;
  if (s.wall_incidence !== null) {
    const x = X(s.entry_angle);
    const y = Y(s.wall_incidence);
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = tcol("#e67e00");
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = tcol("#fff");
    ctx.stroke();
    halo(
      ctx,
      `selected ray: θ₀ = ${fmt(s.entry_angle)}°, φ = ${fmt(s.wall_incidence)}°`,
      m.l + 38,
      m.t + ph - 16,
      tcol("#e67e00"),
      canvasFont(15, "mono", 700),
    );
    ctx.beginPath();
    ctx.arc(m.l + 20, m.t + ph - 16, 7, 0, Math.PI * 2);
    ctx.fillStyle = tcol("#e67e00");
    ctx.fill();
  }

  // axis titles
  halo(ctx, "Entry angle θ₀ (degrees from the axis)", m.l + pw / 2, H - 14, tcol("#111"), canvasFont(16, "sans", 500), "center");
  ctx.save();
  ctx.translate(20, m.t + ph / 2);
  ctx.rotate(-Math.PI / 2);
  halo(ctx, "Angle at the wall φ (degrees)", 0, 0, tcol("#111"), canvasFont(16, "sans", 500), "center", false);
  ctx.restore();
}
