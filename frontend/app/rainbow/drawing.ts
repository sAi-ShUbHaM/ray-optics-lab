import { tcol } from "@/lib/canvasTheme";
// Canvas drawing for the Rainbow page.
// Pure functions only: no React, so they are easy to test on their own.

// ============================================================
// TYPES
// ============================================================

export type Point = [number, number];
type MapFn = (p: Point) => Point;

export type DropRay = {
  wavelength_nm: number;
  color: string;
  n: number;
  refraction_angle: number;
  points: Point[]; // start, entry, reflection(s), exit, end
  deviation: number;
  angle_from_antisolar: number;
  weight: number;
};

export type Bow = {
  wavelength_nm: number;
  color: string;
  n: number;
  incidence_angle: number;
  impact_parameter: number;
  deviation: number;
  angle: number;
  weight: number;
};

export type Curve = {
  wavelength_nm: number;
  color: string;
  points: Point[]; // [impact parameter, deviation]
};

export type RainbowResult = {
  valid: boolean;
  n_d: number;
  abbe_number: number;
  cauchy_c0: number;
  cauchy_c1: number;
  internal_reflections: number;
  impact_parameter: number;
  incidence_angle: number;
  droplet: DropRay[];
  primary: Bow[];
  secondary: Bow[];
  alexander_band: [number, number] | null;
  curves: Curve[];
  histogram: {
    angle_min: number;
    angle_max: number;
    bin_width: number;
    centres: number[];
    series: {
      wavelength_nm: number;
      color: string;
      primary: number[];
      secondary: number[];
    }[];
  };
  critical_angle: number;
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
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
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

function clearCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

type LegendItem = {
  label: string;
  color: string;
  dashed: boolean;
  colors?: string[]; // when present, drawn as a gradient bar
};

function drawLegendStrip(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  items: LegendItem[]
) {
  const width = ctx.canvas.width;
  const startX = 380;
  const available = width - startX - 24;

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

    if (item.colors && item.colors.length > 1) {
      const gradient = ctx.createLinearGradient(x, 0, x + 26, 0);
      item.colors.forEach((c, i) =>
        gradient.addColorStop(i / (item.colors!.length - 1), c)
      );
      ctx.strokeStyle = gradient;
    } else {
      ctx.strokeStyle = item.color;
    }

    ctx.lineWidth = item.dashed ? 2 : 3;
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

// Axes for the two graphs.
type PlotArea = {
  left: number;
  top: number;
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

function plotX(a: PlotArea, x: number) {
  return a.left + ((x - a.xMin) / (a.xMax - a.xMin)) * a.width;
}

function plotY(a: PlotArea, y: number) {
  return a.top + (1 - (y - a.yMin) / (a.yMax - a.yMin)) * a.height;
}

function drawAxes(
  ctx: CanvasRenderingContext2D,
  a: PlotArea,
  xStep: number,
  yStep: number,
  xLabel: string,
  yLabel: string,
  xSuffix: string,
  ySuffix: string
) {
  ctx.save();
  ctx.font = "12px Arial";
  ctx.strokeStyle = tcol("#eee");
  ctx.fillStyle = tcol("#555");
  ctx.lineWidth = 1;

  for (let x = Math.ceil(a.xMin / xStep) * xStep; x <= a.xMax + 1e-9; x += xStep) {
    ctx.beginPath();
    ctx.moveTo(plotX(a, x), a.top);
    ctx.lineTo(plotX(a, x), a.top + a.height);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(`${Number(x.toFixed(2))}${xSuffix}`, plotX(a, x), a.top + a.height + 18);
  }

  for (let y = Math.ceil(a.yMin / yStep) * yStep; y <= a.yMax + 1e-9; y += yStep) {
    ctx.beginPath();
    ctx.moveTo(a.left, plotY(a, y));
    ctx.lineTo(a.left + a.width, plotY(a, y));
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(`${Number(y.toFixed(2))}${ySuffix}`, a.left - 8, plotY(a, y) + 4);
  }

  ctx.strokeStyle = tcol("#555");
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(a.left, a.top);
  ctx.lineTo(a.left, a.top + a.height);
  ctx.lineTo(a.left + a.width, a.top + a.height);
  ctx.stroke();

  ctx.fillStyle = tcol("#333");
  ctx.font = "13px Arial";
  ctx.textAlign = "center";
  ctx.fillText(xLabel, a.left + a.width / 2, a.top + a.height + 42);

  ctx.translate(16, a.top + a.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

// ============================================================
// 1. LIGHT INSIDE ONE RAINDROP
// ============================================================

export function drawDroplet(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: RainbowResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const k = result.internal_reflections;

  // ----- view: the unit circle, the incident ray and every outgoing ray -----
  let xMin = -1.3;
  let xMax = 1.3;
  let yMin = -1.3;
  let yMax = 1.3;

  for (const ray of result.droplet) {
    for (const p of ray.points) {
      xMin = Math.min(xMin, p[0]);
      xMax = Math.max(xMax, p[0]);
      yMin = Math.min(yMin, p[1]);
      yMax = Math.max(yMax, p[1]);
    }
  }
  xMin = Math.max(xMin - 0.2, -4);
  xMax = Math.min(xMax + 0.2, 4);
  yMin = Math.max(yMin - 0.2, -4);
  yMax = Math.min(yMax + 0.2, 4);

  const scale = Math.min(
    (width - 60) / (xMax - xMin),
    (height - LEGEND_BAND - 50) / (yMax - yMin)
  );
  const offsetX = (width - scale * (xMax - xMin)) / 2;
  const offsetY = LEGEND_BAND + (height - LEGEND_BAND - scale * (yMax - yMin)) / 2 - 6;

  const map: MapFn = (p) => [
    offsetX + (p[0] - xMin) * scale,
    offsetY + (yMax - p[1]) * scale,
  ];

  // ----- the drop -----
  const centre = map([0, 0]);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centre[0], centre[1], scale, 0, Math.PI * 2);
  ctx.fillStyle = tcol("rgba(120, 190, 240, 0.18)");
  ctx.fill();
  ctx.strokeStyle = tcol("#0e7490");
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // axis through the centre, parallel to the sunlight
  drawPolyline(ctx, map, [[xMin, 0], [xMax, 0]], tcol("#ccc"), 1.2, true);

  // ----- normals at every surface hit of the middle colour -----
  const middle = result.droplet[Math.floor(result.droplet.length / 2)];
  for (const p of middle.points.slice(1, -1)) {
    drawPolyline(
      ctx,
      map,
      [
        [p[0] * 0.8, p[1] * 0.8],
        [p[0] * 1.35, p[1] * 1.35],
      ],
      tcol("#777"),
      1.2,
      true
    );
  }

  // ----- incident sunlight (white) -----
  const start = middle.points[0];
  const entry = middle.points[1];
  drawPolyline(ctx, map, [start, entry], tcol("#333"), 4, false);
  drawDirectionArrow(ctx, map, start, entry, tcol("#333"));

  ctx.save();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "left";
  const sunLabel = map(start);
  drawHaloText(ctx, "Sunlight (white)", sunLabel[0] + 4, sunLabel[1] - 10, tcol("#333"));
  ctx.restore();

  // ----- the coloured rays (violet is bent most) -----
  for (const ray of result.droplet) {
    drawPolyline(ctx, map, ray.points.slice(1), ray.color, 2.2, false);
  }
  drawDirectionArrow(
    ctx,
    map,
    middle.points[middle.points.length - 2],
    middle.points[middle.points.length - 1],
    middle.color
  );

  for (const ray of result.droplet) {
    for (const p of ray.points.slice(1, -1)) {
      drawDot(ctx, map, p, ray.color, 3);
    }
  }

  // ----- angle labels -----
  ctx.save();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "center";

  const entryScreen = map(entry);
  drawHaloText(
    ctx,
    `i = ${fmt(result.incidence_angle, 1)}°`,
    entryScreen[0] - 46,
    entryScreen[1] - 14,
    tcol("#333")
  );

  const innerStart = middle.points[1];
  const innerEnd = middle.points[2];
  const innerMid = map([(innerStart[0] + innerEnd[0]) / 2, (innerStart[1] + innerEnd[1]) / 2]);
  drawHaloText(ctx, `r = ${fmt(middle.refraction_angle, 1)}°`, innerMid[0], innerMid[1] + 20, tcol("#0e7490"));

  const reflections = middle.points.slice(2, -2);
  reflections.forEach((p, idx) => {
    const s = map([p[0] * 1.0, p[1] * 1.0]);
    const label = k === 1 ? "reflection" : `reflection ${idx + 1}`;
    drawHaloText(ctx, label, s[0] + p[0] * 52, s[1] - p[1] * 30, tcol("#555"));
  });

  const exitPoint = middle.points[middle.points.length - 2];
  const exitScreen = map(exitPoint);
  drawHaloText(
    ctx,
    `D = ${fmt(middle.deviation, 1)}°`,
    exitScreen[0] + exitPoint[0] * 46,
    exitScreen[1] - exitPoint[1] * 34 - 8,
    tcol("#222")
  );
  ctx.restore();

  // ----- notes -----
  const notes: string[] = [];
  notes.push(
    `Angle from the anti-solar point for the ${fmt(middle.wavelength_nm, 0)} nm ray: ${fmt(
      middle.angle_from_antisolar,
      1
    )}° (violet ${fmt(result.droplet[0].angle_from_antisolar, 1)}°, red ${fmt(
      result.droplet[result.droplet.length - 1].angle_from_antisolar,
      1
    )}°).`
  );
  drawNotes(ctx, height, notes);

  const items: LegendItem[] = [
    { label: "Sunlight", color: tcol("#333"), dashed: false },
    {
      label: "Dispersed rays (violet to red)",
      color: tcol("#999"),
      colors: result.droplet.map((r) => r.color),
      dashed: false,
    },
    { label: "Normals", color: tcol("#777"), dashed: true },
  ];

  drawLegendStrip(
    ctx,
    k === 1 ? "Raindrop: primary bow" : "Raindrop: secondary bow",
    `${k} internal reflection${k > 1 ? "s" : ""}, Snell's law at each surface`,
    items
  );
}

// ============================================================
// 2. DEVIATION VERSUS IMPACT PARAMETER
// ============================================================

export function drawDeviationGraph(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: RainbowResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  let lo = Infinity;
  let hi = -Infinity;
  for (const curve of result.curves) {
    for (const p of curve.points) {
      lo = Math.min(lo, p[1]);
      hi = Math.max(hi, p[1]);
    }
  }

  const pad = (hi - lo) * 0.08;
  const area: PlotArea = {
    left: 70,
    top: 44,
    width: width - 70 - 30,
    height: height - 44 - 62,
    xMin: 0,
    xMax: 1,
    yMin: Math.floor((lo - pad) / 10) * 10,
    yMax: Math.ceil((hi + pad) / 10) * 10,
  };

  ctx.fillStyle = tcol("#111");
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  ctx.fillText(
    "Total deviation D against the height b at which the ray hits the drop",
    16,
    24
  );

  drawAxes(
    ctx,
    area,
    0.1,
    (area.yMax - area.yMin) > 120 ? 20 : 10,
    "Impact parameter b (= sin i, 0 at the centre, 1 at the edge)",
    "Deviation D",
    "",
    "°"
  );

  // curves
  for (const curve of result.curves) {
    ctx.beginPath();
    curve.points.forEach((p, i) => {
      const x = plotX(area, p[0]);
      const y = plotY(area, p[1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = curve.color;
    ctx.lineWidth = 2.6;
    ctx.stroke();
  }

  // minimum of every curve (the rainbow ray): a dot on the curve and a
  // key in the empty top-right corner
  ctx.save();

  // white backing so the dashed line of the chosen ray does not cut through the key
  const keyRight = area.left + area.width - 4;
  ctx.fillStyle = tcol("rgba(255,255,255,0.92)");
  ctx.beginPath();
  ctx.roundRect(keyRight - 232, area.top + 18, 232, 82, 6);
  ctx.fill();
  ctx.strokeStyle = tcol("#ddd");
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = "bold 12px Arial";
  ctx.textAlign = "right";
  ctx.fillStyle = tcol("#444");
  ctx.fillText("Minimum deviation (the rainbow ray)", area.left + area.width - 12, area.top + 36);

  result.curves.forEach((curve, idx) => {
    let best = curve.points[0];
    for (const p of curve.points) {
      if (p[1] < best[1]) best = p;
    }

    const x = plotX(area, best[0]);
    const y = plotY(area, best[1]);

    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = curve.color;
    ctx.fill();
    ctx.strokeStyle = tcol("#fff");
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const rowY = area.top + 56 + idx * 18;
    const text = `${fmt(curve.wavelength_nm, 0)} nm:  D = ${fmt(best[1], 1)}°`;
    ctx.font = "12px Arial";
    ctx.textAlign = "right";
    ctx.fillStyle = tcol("#222");
    const textRight = area.left + area.width - 12;
    ctx.fillText(text, textRight, rowY);

    ctx.beginPath();
    ctx.arc(textRight - ctx.measureText(text).width - 12, rowY - 4, 5, 0, Math.PI * 2);
    ctx.fillStyle = curve.color;
    ctx.fill();
  });
  ctx.restore();

  // the ray chosen with the slider
  const bx = plotX(area, result.impact_parameter);
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = tcol("#1671d9");
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(bx, area.top);
  ctx.lineTo(bx, area.top + area.height);
  ctx.stroke();
  ctx.setLineDash([]);

  const mid = result.curves[1];
  const near = mid.points.reduce((a, p) =>
    Math.abs(p[0] - result.impact_parameter) < Math.abs(a[0] - result.impact_parameter) ? p : a
  );
  ctx.beginPath();
  ctx.arc(bx, plotY(area, near[1]), 6, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#1671d9");
  ctx.fill();
  ctx.strokeStyle = tcol("#fff");
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = "bold 12px Arial";
  const labelLeft = bx > area.left + area.width * 0.6;
  ctx.textAlign = labelLeft ? "right" : "left";
  drawHaloText(
    ctx,
    `chosen ray: b = ${fmt(result.impact_parameter, 3)}`,
    bx + (labelLeft ? -10 : 10),
    area.top + area.height - 10,
    tcol("#1671d9")
  );

  ctx.font = "12px Arial";
  ctx.fillStyle = tcol("#666");
  ctx.textAlign = "right";
  ctx.fillText(
    "Near the minimum many rays leave in almost the same direction: that is the bow.",
    width - 16,
    24
  );
}

// ============================================================
// 3. BRIGHTNESS VERSUS ANGLE
// ============================================================

export function drawBrightness(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: RainbowResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const h = result.histogram;

  const area: PlotArea = {
    left: 70,
    top: 44,
    width: width - 70 - 30,
    height: height - 44 - 62,
    xMin: h.angle_min,
    xMax: h.angle_max,
    yMin: 0,
    yMax: 1.1,
  };

  ctx.fillStyle = tcol("#111");
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  ctx.fillText("Brightness of the sky against the angle from the anti-solar point", 16, 24);

  const span = h.angle_max - h.angle_min;
  drawAxes(
    ctx,
    area,
    span > 60 ? 10 : 5,
    0.25,
    "Angle from the anti-solar point",
    "Relative brightness",
    "°",
    ""
  );

  // Alexander's dark band
  if (result.alexander_band) {
    const [a0, a1] = result.alexander_band;
    ctx.fillStyle = tcol("rgba(30, 40, 90, 0.12)");
    ctx.fillRect(plotX(area, a0), area.top, plotX(area, a1) - plotX(area, a0), area.height);

    ctx.font = "bold 12px Arial";
    ctx.textAlign = "center";
    drawHaloText(
      ctx,
      "Alexander's dark band",
      (plotX(area, a0) + plotX(area, a1)) / 2,
      area.top + area.height / 2,
      tcol("#334")
    );
  }

  // one line per colour, for both orders
  for (const series of h.series) {
    for (const key of ["primary", "secondary"] as const) {
      const values = series[key];

      ctx.beginPath();
      values.forEach((v, i) => {
        const x = plotX(area, h.centres[i]);
        const y = plotY(area, Math.min(v, area.yMax));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // labels for the two bows
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";

  if (result.primary.length) {
    const angles = result.primary.map((b) => b.angle);
    const x = plotX(area, (Math.min(...angles) + Math.max(...angles)) / 2);
    drawHaloText(ctx, "primary bow", x - 40, area.top + 14, tcol("#333"));
  }
  if (result.secondary.length) {
    const angles = result.secondary.map((b) => b.angle);
    const x = plotX(area, (Math.min(...angles) + Math.max(...angles)) / 2);
    drawHaloText(ctx, "secondary bow (fainter)", x + 40, area.top + 14, tcol("#333"));
  }

  ctx.font = "12px Arial";
  ctx.fillStyle = tcol("#666");
  ctx.textAlign = "right";
  ctx.fillText(
    "Geometric optics with Fresnel reflection losses. Real bows also show faint supernumerary bands (wave optics).",
    width - 16,
    24
  );
}

// ============================================================
// 4. THE RAINBOW IN THE SKY
// ============================================================

export function drawSky(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: RainbowResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const groundY = height - 90;
  const cx = width / 2;

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, groundY);
  sky.addColorStop(0, tcol("#9fcdf6"));
  sky.addColorStop(1, tcol("#eaf5ff"));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, groundY);

  // ground
  ctx.fillStyle = tcol("#86a874");
  ctx.fillRect(0, groundY, width, height - groundY);

  // angular scale: fit the outermost bow
  const allAngles = [...result.primary, ...result.secondary].map((b) => b.angle);
  const largest = Math.max(...allAngles, 10) + 4;
  const scale = Math.min((groundY - 40) / largest, (width / 2 - 40) / largest);

  function arc(angleDeg: number, lineWidth: number, color: string) {
    ctx.beginPath();
    ctx.arc(cx, groundY, angleDeg * scale, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  // Alexander's dark band
  if (result.alexander_band) {
    const [a0, a1] = result.alexander_band;
    ctx.save();
    arc((a0 + a1) / 2, (a1 - a0) * scale, tcol("rgba(25, 35, 90, 0.22)"));
    ctx.restore();
  }

  // the bows: one arc per sampled colour
  function drawBow(rows: Bow[], alpha: number) {
    if (rows.length < 2) return;

    const angles = rows.map((r) => r.angle);
    const spread = (Math.max(...angles) - Math.min(...angles)) / (rows.length - 1);
    const lineWidth = Math.max(3, spread * scale * 1.15);

    ctx.save();
    ctx.globalAlpha = alpha;
    for (const row of rows) {
      arc(row.angle, lineWidth, row.color);
    }
    ctx.restore();
  }

  const meanWeight = (rows: Bow[]) =>
    rows.length ? rows.reduce((s, r) => s + r.weight, 0) / rows.length : 0;
  const ratio = meanWeight(result.primary) > 0
    ? meanWeight(result.secondary) / meanWeight(result.primary)
    : 0;
  const secondaryAlpha = Math.min(0.75, Math.max(0.25, Math.sqrt(ratio)));

  drawBow(result.secondary, secondaryAlpha);
  drawBow(result.primary, 0.9);

  // labels: the inner bow is named inside its arc, the outer bow above its arc
  ctx.save();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "center";

  const range = (rows: Bow[]) =>
    `${fmt(Math.min(...rows.map((r) => r.angle)), 1)}° to ${fmt(
      Math.max(...rows.map((r) => r.angle)),
      1
    )}°`;

  type Labelled = { text: string; inner: number; outer: number };
  const bows: Labelled[] = [];

  if (result.primary.length) {
    const a = result.primary.map((r) => r.angle);
    bows.push({
      text: `Primary bow ${range(result.primary)} (red outside)`,
      inner: Math.min(...a),
      outer: Math.max(...a),
    });
  }
  if (result.secondary.length) {
    const a = result.secondary.map((r) => r.angle);
    bows.push({
      text: `Secondary bow ${range(result.secondary)} (violet outside)`,
      inner: Math.min(...a),
      outer: Math.max(...a),
    });
  }
  bows.sort((p, q) => p.outer - q.outer);

  if (bows[0]) {
    // Place the label far enough below the top of the arc that the whole text
    // fits inside the circle: the chord at depth d must be wider than the text.
    const radius = bows[0].inner * scale;
    const halfText = ctx.measureText(bows[0].text).width / 2 + 12;
    const depth =
      radius > halfText
        ? Math.max(34, radius - Math.sqrt(radius * radius - halfText * halfText) + 16)
        : Math.max(radius - 24, 20);
    drawHaloText(ctx, bows[0].text, cx, groundY - radius + depth, tcol("#223"));
  }
  if (bows[1]) {
    drawHaloText(ctx, bows[1].text, cx, Math.max(groundY - bows[1].outer * scale - 14, 22), tcol("#223"));
  }

  if (result.alexander_band) {
    const [a0, a1] = result.alexander_band;
    if ((a1 - a0) * scale > 22) {
      drawHaloText(ctx, "Alexander's dark band", cx, groundY - ((a0 + a1) / 2) * scale + 4, tcol("#223"));
    }
  } else {
    drawHaloText(ctx, "The two bows overlap: there is no dark band", cx, groundY - 14, tcol("#92400e"));
  }
  ctx.restore();

  // anti-solar point
  ctx.beginPath();
  ctx.arc(cx, groundY, 5, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#111");
  ctx.fill();

  ctx.save();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "center";
  ctx.fillStyle = tcol("#fff");
  ctx.fillText("Anti-solar point", cx, groundY + 24);
  ctx.font = "12px Arial";
  ctx.fillText("(the direction opposite to the sun)", cx, groundY + 42);

  ctx.textAlign = "left";
  ctx.font = "bold 14px Arial";
  ctx.fillText("Sun is behind you. You look away from it.", 24, groundY + 34);
  ctx.restore();

  ctx.save();
  ctx.font = "13px Arial";
  ctx.fillStyle = tcol("#444");
  ctx.textAlign = "right";
  ctx.fillText("View of the sky, seen by an observer with the sun behind", width - 20, 24);
  ctx.restore();
}
