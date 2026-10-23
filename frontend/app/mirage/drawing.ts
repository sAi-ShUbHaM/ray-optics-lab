import { tcol } from "@/lib/canvasTheme";
// Canvas drawing for the Mirage page.
// Pure functions only: no React, so they are easy to test on their own.

// ============================================================
// TYPES
// ============================================================

export type Point = [number, number];
type MapFn = (p: Point) => Point;

export type MirageImage = {
  orientation: "Upright" | "Inverted";
  alpha_start_deg: number;
  alpha_end_deg: number;
  alpha_top_deg: number;
  alpha_bottom_deg: number;
  angular_height_deg: number;
  magnification: number;
  top_cut: boolean;
  bottom_cut: boolean;
  fold: boolean;
  visible_fraction: number;
  visible_from: number;
  visible_to: number;
  fan_edge: boolean;
  apparent_bottom: number;
  apparent_top: number;
};

export type MirageRay = {
  angle_deg: number;
  status: string;
  role: string; // "fan" | "image edge"
  height_at_object: number | null;
  points: Point[];
};

export type MirageResult = {
  valid: boolean;
  observer_height: number;
  object_distance: number;
  object_height: number;
  earth_curvature: boolean;
  surface_layer_difference: number;
  layer_thickness: number;
  lapse_rate: number;
  inversion_strength: number;
  inversion_height: number;
  inversion_thickness: number;
  fan: { min_deg: number; max_deg: number; samples: number; steps: number };
  geometric: {
    bottom_deg: number;
    top_deg: number;
    horizon_dip_deg: number;
    horizon_distance_km: number | null;
  };
  apparent_horizon_deg: number | null;
  images: MirageImage[];
  pattern: string;
  description: string;
  displacement_arcmin: number | null; // shift compared with ordinary air
  displacement_straight_arcmin: number | null; // shift compared with perfectly straight light
  ordinary_air_image_count: number;
  rays: MirageRay[];
  profile: {
    heights: number[];
    temperature_c: number[];
    n_minus_1_e6: number[];
    dn_dy_e7: number[];
    ducting_threshold_e7: number;
  };
  critical_angle_deg: number | null;
};

const EARTH_RADIUS = 6.371e6;

export function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "∞";
  return Number(value.toFixed(digits)).toString();
}

// ============================================================
// HELPERS
// ============================================================

const LEGEND_BAND = 52; // pixels reserved at the top for the legend strip

const UPRIGHT = "#e67e00";
const INVERTED = "#7c3aed";
const GREEN = "#16a34a";

function imageColor(image: MirageImage): string {
  return image.orientation === "Upright" ? tcol(UPRIGHT) : tcol(INVERTED);
}

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

function clearCanvas(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// "Nice" tick values (1, 2 or 5 times a power of ten) covering [min, max].
function niceTicks(min: number, max: number, target = 6): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];

  const rough = span / target;
  const power = Math.pow(10, Math.floor(Math.log10(rough)));
  const fraction = rough / power;
  const step = (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * power;

  const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9));
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) {
    const clean = Math.abs(v) < step * 1e-6 ? 0 : Number(v.toFixed(decimals));
    ticks.push(clean);
  }
  return ticks;
}

type LegendItem = { label: string; color: string; dashed: boolean };

function drawLegendStrip(
  ctx: CanvasRenderingContext2D,
  title: string,
  subtitle: string,
  items: LegendItem[]
) {
  const width = ctx.canvas.width;
  const startX = 330;
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
    ctx.strokeStyle = item.color;
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

function groundColor(result: MirageResult): string {
  if (result.surface_layer_difference > 0.5) return tcol("#c9a36b"); // hot ground
  if (result.surface_layer_difference < -0.5) return tcol("#6aa7d8"); // cold water
  return tcol("#8bb07c"); // ordinary ground
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: [number, number],
  to: [number, number],
  color: string,
  size = 10
) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(to[0], to[1]);
  ctx.lineTo(
    to[0] - size * Math.cos(angle - Math.PI / 6),
    to[1] - size * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    to[0] - size * Math.cos(angle + Math.PI / 6),
    to[1] - size * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

// ============================================================
// 1. THE RAYS
// ============================================================

export function drawRays(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: MirageResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const X = result.object_distance;
  const y0 = result.observer_height;
  const h = result.object_height;

  const left = 74;
  const right = 90;
  const top = LEGEND_BAND + 14;
  const bottom = 78;

  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const yMax = Math.max(1.5 * h, 2.5 * y0, 4);
  const groundPx = 0.05 * plotH; // a little room below y = 0 to draw the ground
  const scaleY = (plotH - groundPx) / yMax;
  const scaleX = plotW / X;

  const map: MapFn = (p) => [left + p[0] * scaleX, top + plotH - groundPx - p[1] * scaleY];

  const exaggeration = scaleY / scaleX;

  // ----- sky and plot frame -----
  const sky = ctx.createLinearGradient(0, top, 0, top + plotH);
  sky.addColorStop(0, tcol("#b8dcf8"));
  sky.addColorStop(1, tcol("#eef7ff"));
  ctx.fillStyle = sky;
  ctx.fillRect(left, top, plotW + 40, plotH - groundPx);

  // ----- the near-surface layer and the inversion layer -----
  const surfaceBand = Math.min(3 * result.layer_thickness, yMax);
  if (Math.abs(result.surface_layer_difference) > 0.5) {
    const hot = result.surface_layer_difference > 0;
    const bandPx = Math.max(surfaceBand * scaleY, 3);
    ctx.fillStyle = hot ? tcol("rgba(255, 90, 40, 0.22)") : tcol("rgba(40, 110, 230, 0.20)");
    ctx.fillRect(left, top + plotH - groundPx - bandPx, plotW + 40, bandPx);
  }

  if (result.inversion_strength > 0) {
    const y1 = Math.max(result.inversion_height - 1.5 * result.inversion_thickness, 0);
    const y2 = Math.min(result.inversion_height + 1.5 * result.inversion_thickness, yMax);
    if (y2 > y1) {
      const a = map([0, y2]);
      const b = map([0, y1]);
      ctx.fillStyle = tcol("rgba(255, 160, 0, 0.18)");
      ctx.fillRect(left, a[1], plotW + 40, b[1] - a[1]);
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "left";
      drawHaloText(ctx, "temperature inversion (warmer air above)", left + 10, a[1] + 14, tcol("#b45309"));
    }
  }

  // ----- ground / water -----
  const groundTop = map([0, 0])[1];
  ctx.fillStyle = groundColor(result);
  ctx.fillRect(left, groundTop, plotW + 40, groundPx + 6);

  // ----- clip everything that follows to the plot -----
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, plotW + 40, plotH);
  ctx.clip();

  // rays, drawn so that the important ones end up on top
  const order = { "Hits the ground": 0, "Passes above the object": 1, "Hits the object": 2 } as Record<
    string,
    number
  >;
  const rays = [...result.rays].sort((a, b) => {
    const ra = a.role === "image edge" ? 5 : order[a.status] ?? 1;
    const rb = b.role === "image edge" ? 5 : order[b.status] ?? 1;
    return ra - rb;
  });

  function edgeColor(angle: number): string | null {
    let best: MirageImage | null = null;
    let bestDistance = Infinity;
    for (const image of result.images) {
      for (const a of [image.alpha_start_deg, image.alpha_end_deg]) {
        const d = Math.abs(a - angle);
        if (d < bestDistance) {
          bestDistance = d;
          best = image;
        }
      }
    }
    return best ? imageColor(best) : null;
  }

  for (const ray of rays) {
    ctx.beginPath();
    ray.points.forEach((p, i) => {
      const c = map(p);
      if (i === 0) ctx.moveTo(c[0], c[1]);
      else ctx.lineTo(c[0], c[1]);
    });

    if (ray.role === "image edge") {
      ctx.strokeStyle = edgeColor(ray.angle_deg) ?? tcol("#333");
      ctx.lineWidth = 2.4;
    } else if (ray.status === "Hits the object") {
      ctx.strokeStyle = tcol("rgba(22, 163, 74, 0.85)");
      ctx.lineWidth = 1.6;
    } else if (ray.status === "Hits the ground") {
      ctx.strokeStyle = tcol("rgba(220, 38, 38, 0.35)");
      ctx.lineWidth = 1.1;
    } else {
      ctx.strokeStyle = tcol("rgba(80, 100, 140, 0.5)");
      ctx.lineWidth = 1.1;
    }
    ctx.stroke();
  }

  // apparent directions of the image edges: straight lines in real space,
  // which are parabolas in these flattened coordinates
  const drop = (x: number) => (result.earth_curvature ? (x * x) / (2 * EARTH_RADIUS) : 0);

  for (const image of result.images) {
    const color = imageColor(image);
    for (const angle of [image.alpha_bottom_deg, image.alpha_top_deg]) {
      const t = Math.tan((angle * Math.PI) / 180);
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const x = (i / 80) * X;
        const c = map([x, y0 + x * t + drop(x)]);
        if (i === 0) ctx.moveTo(c[0], c[1]);
        else ctx.lineTo(c[0], c[1]);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([7, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // apparent images: dashed arrows just beyond the object
  result.images.forEach((image, k) => {
    const color = imageColor(image);
    const x = X * (1 + 0.018 * (k + 1));
    const a = map([x, image.apparent_bottom]);
    const b = map([x, image.apparent_top]);

    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrowHead(ctx, a, b, color, 9);

    ctx.font = "bold 12px Arial";
    ctx.textAlign = "left";
    drawHaloText(ctx, `image ${k + 1}`, b[0] + 8, b[1] + (image.orientation === "Upright" ? 12 : -4), color);
  });

  // the real object
  const base = map([X, 0]);
  const tip = map([X, h]);
  ctx.beginPath();
  ctx.moveTo(base[0], base[1]);
  ctx.lineTo(tip[0], tip[1]);
  ctx.strokeStyle = tcol("#111");
  ctx.lineWidth = 3.5;
  ctx.stroke();
  drawArrowHead(ctx, base, tip, tcol("#111"), 11);

  ctx.font = "bold 13px Arial";
  ctx.textAlign = "right";
  drawHaloText(ctx, `Object (${fmt(h, 0)} m)`, base[0] - 10, tip[1] + 14, tcol("#111"));
  ctx.restore();

  // ----- the observer -----
  const eye = map([0, y0]);
  ctx.beginPath();
  ctx.arc(eye[0], eye[1], 6, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#111");
  ctx.fill();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "left";
  drawHaloText(ctx, `Observer (${fmt(y0, 1)} m)`, eye[0] + 10, eye[1] - 8, tcol("#111"));

  // ----- axes -----
  ctx.save();
  ctx.font = "12px Arial";
  ctx.fillStyle = tcol("#555");
  ctx.strokeStyle = tcol("#888");
  ctx.lineWidth = 1;

  const useKm = X >= 2000;
  const xTicks = niceTicks(0, useKm ? X / 1000 : X, 7);
  ctx.textAlign = "center";
  for (const t of xTicks) {
    const px = left + ((useKm ? t * 1000 : t) / X) * plotW;
    ctx.beginPath();
    ctx.moveTo(px, top + plotH);
    ctx.lineTo(px, top + plotH + 5);
    ctx.stroke();
    ctx.fillText(`${t}${useKm ? " km" : " m"}`, px, top + plotH + 20);
  }

  const yTicks = niceTicks(0, yMax, 6);
  ctx.textAlign = "right";
  for (const t of yTicks) {
    const py = map([0, t])[1];
    ctx.beginPath();
    ctx.moveTo(left - 5, py);
    ctx.lineTo(left, py);
    ctx.stroke();
    ctx.fillText(`${t} m`, left - 9, py + 4);
  }

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + plotH);
  ctx.stroke();

  ctx.fillStyle = tcol("#333");
  ctx.font = "13px Arial";
  ctx.textAlign = "center";
  ctx.fillText("Distance from the observer", left + plotW / 2, top + plotH + 42);

  ctx.translate(18, top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Height above the ground", 0, 0);
  ctx.restore();

  // ----- notes -----
  ctx.save();
  ctx.fillStyle = tcol("#b45309");
  ctx.font = "13px Arial";
  ctx.textAlign = "left";
  ctx.fillText(
    `Vertical scale exaggerated about ${Math.round(exaggeration).toLocaleString()} times. In real life these rays are almost horizontal.`,
    20,
    height - 12
  );
  ctx.restore();

  const hasUpright = result.images.some((image) => image.orientation === "Upright");
  const hasInverted = result.images.some((image) => image.orientation === "Inverted");

  const items: LegendItem[] = [
    { label: "Ray reaches the object", color: tcol(GREEN), dashed: false },
    { label: "Passes above it", color: tcol("#5a6a8c"), dashed: false },
    { label: "Hits the ground", color: tcol("#dc2626"), dashed: false },
  ];
  if (hasUpright) items.push({ label: "Image edge: upright", color: tcol(UPRIGHT), dashed: false });
  if (hasInverted) items.push({ label: "Image edge: inverted", color: tcol(INVERTED), dashed: false });
  if (result.images.length > 0) {
    items.push({ label: "Straight apparent direction", color: tcol("#777"), dashed: true });
  }
  drawLegendStrip(
    ctx,
    "Rays traced from the observer's eye",
    "Each ray bends towards the denser (cooler) air",
    items
  );
}

// ============================================================
// 2. WHAT THE OBSERVER SEES
// ============================================================

export function drawObserverView(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: MirageResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  // ----- elevation range -----
  const angles: number[] = [result.geometric.bottom_deg, result.geometric.top_deg];
  for (const image of result.images) {
    angles.push(image.alpha_bottom_deg, image.alpha_top_deg);
  }
  if (result.apparent_horizon_deg !== null) angles.push(result.apparent_horizon_deg);
  angles.push(result.geometric.horizon_dip_deg);

  let lo = Math.min(...angles);
  let hi = Math.max(...angles);
  const pad = Math.max((hi - lo) * 0.18, 0.004);
  lo -= pad;
  hi += pad;

  const inArcmin = hi - lo < 0.7;
  const unit = inArcmin ? 60 : 1;
  const unitLabel = inArcmin ? "arcminutes" : "degrees";

  const left = 96;
  const right = 24;
  const top = 92;
  const bottom = 40;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const py = (angleDeg: number) => top + (1 - (angleDeg - lo) / (hi - lo)) * plotH;

  // ----- sky above the horizon line, ground below it -----
  const horizon =
    result.apparent_horizon_deg !== null ? result.apparent_horizon_deg : result.geometric.horizon_dip_deg;
  const horizonY = Math.min(Math.max(py(horizon), top), top + plotH);

  const sky = ctx.createLinearGradient(0, top, 0, horizonY);
  sky.addColorStop(0, tcol("#a6d0f6"));
  sky.addColorStop(1, tcol("#eaf5ff"));
  ctx.fillStyle = sky;
  ctx.fillRect(left, top, plotW, horizonY - top);

  ctx.fillStyle = groundColor(result);
  ctx.fillRect(left, horizonY, plotW, top + plotH - horizonY);

  ctx.save();
  ctx.font = "12px Arial";
  ctx.textAlign = "right";
  ctx.fillStyle = tcol("#fff");
  drawHaloText(ctx, "nearer ground: these rays hit the surface before the object\u2019s distance", left + plotW - 10, Math.min(horizonY + 18, top + plotH - 6), tcol("#3b4a2f"));
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(left, horizonY);
  ctx.lineTo(left + plotW, horizonY);
  ctx.strokeStyle = tcol("rgba(40,50,30,0.6)");
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ----- elevation axis -----
  ctx.save();
  ctx.font = "12px Arial";
  ctx.fillStyle = tcol("#444");
  ctx.strokeStyle = tcol("#aaa");
  ctx.lineWidth = 1;
  ctx.textAlign = "right";

  for (const t of niceTicks(lo * unit, hi * unit, 7)) {
    const y = py(t / unit);
    ctx.beginPath();
    ctx.moveTo(left - 5, y);
    ctx.lineTo(left, y);
    ctx.stroke();
    ctx.fillText(`${t}`, left - 9, y + 4);

    ctx.save();
    ctx.strokeStyle = tcol("rgba(255,255,255,0.35)");
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + plotW, y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + plotH);
  ctx.stroke();

  ctx.fillStyle = tcol("#333");
  ctx.font = "13px Arial";
  ctx.textAlign = "center";
  ctx.translate(20, top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`Elevation above the horizontal (${unitLabel})`, 0, 0);
  ctx.restore();

  // ----- columns: where the object really is, then each image -----
  const columns = 1 + result.images.length;
  const columnX = (index: number) => left + plotW * ((index + 0.5) / Math.max(columns, 3));

  function drawBar(
    x: number,
    bottomDeg: number,
    topDeg: number,
    color: string,
    dashed: boolean,
    label: string,
    sub: string
  ) {
    const yb = py(bottomDeg);
    const yt = py(topDeg);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, yb);
    ctx.lineTo(x, yt);
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.setLineDash(dashed ? [8, 6] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    drawArrowHead(ctx, [x, yb], [x, yt], color, 14);

    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    drawHaloText(ctx, label, x, top - 12, color);
    ctx.font = "12px Arial";
    drawHaloText(ctx, sub, x, top + plotH + 18, tcol("#444"));
    ctx.restore();
  }

  // where the object would be without any refraction
  drawBar(
    columnX(0),
    result.geometric.bottom_deg,
    result.geometric.top_deg,
    tcol("#444"),
    true,
    "Without refraction",
    "(straight light)"
  );

  result.images.forEach((image, k) => {
    const x = columnX(k + 1);
    const color = imageColor(image);

    const stretched =
      image.magnification > 1.15
        ? `stretched ×${fmt(image.magnification, 1)}`
        : image.magnification < 0.85
        ? `squashed ×${fmt(image.magnification, 2)}`
        : "true size";

    drawBar(
      x,
      image.alpha_bottom_deg,
      image.alpha_top_deg,
      color,
      false,
      `Image ${k + 1}: ${image.orientation.toLowerCase()}`,
      stretched
    );

    // marks where part of the object cannot be seen
    ctx.save();
    ctx.font = "bold 11px Arial";
    ctx.textAlign = "left";
    const markers: [boolean, number, string][] = [
      [image.bottom_cut, image.alpha_bottom_deg, image.fold ? "fold: lower part hidden" : "lower part hidden"],
      [image.top_cut, image.alpha_top_deg, image.fold ? "fold: upper part hidden" : "upper part hidden"],
    ];
    for (const [flag, angle, text] of markers) {
      if (!flag) continue;
      const y = py(angle);
      ctx.beginPath();
      ctx.moveTo(x - 18, y);
      for (let i = 0; i < 6; i++) {
        ctx.lineTo(x - 18 + (i + 1) * 6, y + (i % 2 === 0 ? -4 : 4));
      }
      ctx.strokeStyle = tcol("#444");
      ctx.lineWidth = 1.5;
      ctx.stroke();
      drawHaloText(ctx, text, x + 22, y + (angle === image.alpha_bottom_deg ? 14 : -6), tcol("#444"));
    }
    ctx.restore();
  });

  if (result.images.length === 0) {
    ctx.save();
    ctx.font = "bold 15px Arial";
    ctx.textAlign = "center";
    drawHaloText(
      ctx,
      "No image of the object reaches the observer.",
      left + plotW / 2,
      top + plotH / 2,
      tcol("#92400e")
    );
    ctx.restore();
  }

  // ----- headline -----
  ctx.save();
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "left";
  ctx.fillStyle = tcol("#111");
  ctx.fillText(result.description, 16, 26);
  ctx.font = "12px Arial";
  ctx.fillStyle = tcol("#666");
  ctx.fillText(
    "Each bar is the object as the observer sees it, at its elevation in the sky. Arrows point to the top of the object.",
    16,
    44
  );
  ctx.restore();
}

// ============================================================
// 3. THE AIR COLUMN
// ============================================================

export function drawAirColumn(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: MirageResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const p = result.profile;
  const maxHeight = p.heights[p.heights.length - 1];

  const top = 54;
  const bottom = 56;
  const plotH = height - top - bottom;
  const panelW = (width - 3 * 70) / 2;

  const py = (y: number) => top + (1 - y / maxHeight) * plotH;

  function panel(
    x0: number,
    values: number[],
    color: string,
    title: string,
    xLabel: string,
    threshold: number | null
  ) {
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (threshold !== null) {
      lo = Math.min(lo, threshold);
      hi = Math.max(hi, threshold);
    }
    const margin = (hi - lo || 1) * 0.1;
    lo -= margin;
    hi += margin;

    const px = (v: number) => x0 + ((v - lo) / (hi - lo)) * panelW;

    ctx.save();
    ctx.font = "bold 13px Arial";
    ctx.fillStyle = tcol("#111");
    ctx.textAlign = "left";
    ctx.fillText(title, x0, 26);

    // shading where the ray bends down more sharply than the Earth curves
    if (threshold !== null) {
      ctx.fillStyle = tcol("rgba(220, 38, 38, 0.10)");
      ctx.fillRect(x0, top, px(threshold) - x0, plotH);
    }

    ctx.strokeStyle = tcol("#eee");
    ctx.fillStyle = tcol("#555");
    ctx.font = "12px Arial";
    ctx.lineWidth = 1;

    for (const t of niceTicks(lo, hi, 5)) {
      ctx.beginPath();
      ctx.moveTo(px(t), top);
      ctx.lineTo(px(t), top + plotH);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillText(`${t}`, px(t), top + plotH + 18);
    }
    for (const t of niceTicks(0, maxHeight, 5)) {
      ctx.beginPath();
      ctx.moveTo(x0, py(t));
      ctx.lineTo(x0 + panelW, py(t));
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(`${t} m`, x0 - 8, py(t) + 4);
    }

    ctx.strokeStyle = tcol("#555");
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, top);
    ctx.lineTo(x0, top + plotH);
    ctx.lineTo(x0 + panelW, top + plotH);
    ctx.stroke();

    // zero line for the gradient panel
    if (lo < 0 && hi > 0) {
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = tcol("#888");
      ctx.beginPath();
      ctx.moveTo(px(0), top);
      ctx.lineTo(px(0), top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (threshold !== null) {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = tcol("#dc2626");
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px(threshold), top);
      ctx.lineTo(px(threshold), top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = "bold 11px Arial";
      ctx.fillStyle = tcol("#b91c1c");
      ctx.textAlign = "left";
      ctx.fillText("ducting threshold", px(threshold) + 6, top + 16);
      ctx.fillText("(Earth's curvature)", px(threshold) + 6, top + 30);
    }

    ctx.beginPath();
    values.forEach((v, i) => {
      const x = px(v);
      const y = py(p.heights[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.stroke();

    ctx.fillStyle = tcol("#333");
    ctx.font = "13px Arial";
    ctx.textAlign = "center";
    ctx.fillText(xLabel, x0 + panelW / 2, height - 12);
    ctx.restore();
  }

  panel(70, p.temperature_c, tcol("#dc2626"), "Air temperature", "Temperature (°C)", null);
  panel(
    70 + panelW + 70,
    p.dn_dy_e7,
    tcol("#1671d9"),
    "Refractive-index gradient dn/dy: negative bends rays down, positive bends them up",
    "dn/dy (10⁻⁷ per metre)",
    p.ducting_threshold_e7
  );
}
