import { tcol } from "@/lib/canvasTheme";
// Canvas drawing for the Optical Instruments page.
// Pure functions only: no React, so they are easy to test on their own.

// ============================================================
// TYPES
// ============================================================

export type Point = [number, number];
type MapFn = (p: Point) => Point;

export type LensKind = "convex" | "concave";

// ----- microscope (a thin-lens system result plus instrument data) -----

export type Stage = {
  lens: number;
  image_at_infinity: boolean;
  image_x: number | null;
  image_height: number | null;
  image_distance_signed: number | null;
  object_distance_signed: number | null;
  object_kind: string;
  image_kind: string;
  magnification: number | null;
  focal_length: number;
};

export type SystemRay = {
  name: string;
  type: string;
  description: string;
  points: Point[];
  extensions: Point[][];
};

export type MicroscopeResult = {
  valid: boolean;
  lenses: { index: number; lens_type: LensKind; focal_length: number; x: number }[];
  object_distance: number;
  object_height: number;
  object_point: Point;
  object_base: Point;
  stages: Stage[];
  image_type: string;
  orientation: string;
  size: string;
  image_position: string;
  image_at_infinity: boolean;
  total_magnification: number | null;
  x_end: number;
  rays: SystemRay[];
  instrument: {
    kind: string;
    focus: "infinity" | "near_point";
    near_point: number;
    objective_focal_length: number;
    eyepiece_focal_length: number;
    separation: number;
    intermediate_image_x: number;
    objective_magnification: number;
    eyepiece_magnification: number;
    angular_magnification: number;
    tube_length: number;
    approx_magnification: number;
  };
};

// ----- telescope -----

export type TelescopeRay = {
  bundle: "axial" | "off_axis";
  entry_height: number;
  points: Point[];
  extensions: Point[][];
  exit_slope: number;
  height_at_eyepiece: number;
};

export type TelescopeResult = {
  valid: boolean;
  kind: "keplerian" | "galilean";
  objective_focal_length: number;
  eyepiece_focal_length: number; // signed
  separation: number;
  normal_separation: number;
  defocus: number;
  normal_adjustment: boolean;
  field_angle: number;
  aperture: number;
  angular_magnification: number;
  orientation: string;
  exit_angle: number;
  intermediate_image: { x: number; height: number; kind: string } | null;
  final_image: {
    at_infinity: boolean;
    x: number | null;
    height: number | null;
    kind: string;
  };
  exit_pupil: {
    diameter: number | null;
    distance_from_eyepiece: number | null;
    real: boolean;
  };
  tube_length: number;
  start_x: number;
  x_end: number;
  rays: TelescopeRay[];
};

// ============================================================
// SHARED CONSTANTS AND HELPERS
// ============================================================

const LEGEND_BAND = 52; // pixels reserved at the top for the legend strip

export const RAY_COLORS: Record<string, string> = {
  parallel: tcol("#e67e00"),
  central: tcol("#7c3aed"),
  focal: tcol("#16a34a"),
  axial: tcol("#e67e00"),
  off_axis: tcol("#7c3aed"),
};

export function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "∞";
  return Number(value.toFixed(digits)).toString();
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
  radius = 3.2
) {
  const c = map(p);
  ctx.beginPath();
  ctx.arc(c[0], c[1], radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  map: MapFn,
  scaleX: number,
  scaleY: number,
  left: number,
  right: number,
  extentY: number
) {
  const stepX = scaleX > 28 ? 1 : scaleX > 12 ? 2 : scaleX > 5 ? 5 : 10;
  const stepY = scaleY > 28 ? 1 : scaleY > 12 ? 2 : 5;

  ctx.strokeStyle = tcol("#eee");
  ctx.lineWidth = 1;

  for (let x = Math.ceil(-left / stepX) * stepX; x <= right; x += stepX) {
    const px = map([x, 0])[0];
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }

  for (let y = Math.ceil(-extentY / stepY) * stepY; y <= extentY; y += stepY) {
    const py = map([0, y])[1];
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }
}

function drawLens(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  x: number,
  half: number,
  convex: boolean
) {
  const top = map([x, half]);
  const bottom = map([x, -half]);
  const size = 14;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(top[0], top[1]);
  ctx.lineTo(bottom[0], bottom[1]);
  ctx.strokeStyle = tcol("#0e7490");
  ctx.lineWidth = 3.5;
  ctx.stroke();

  function head(end: [number, number], pointingUp: boolean) {
    const dir = pointingUp ? -1 : 1; // canvas y grows downwards
    ctx.beginPath();
    ctx.moveTo(end[0], end[1]);
    ctx.lineTo(end[0] - size * 0.6, end[1] - dir * size);
    ctx.lineTo(end[0] + size * 0.6, end[1] - dir * size);
    ctx.closePath();
    ctx.fillStyle = tcol("#0e7490");
    ctx.fill();
  }

  if (convex) {
    head(top, true);
    head(bottom, false);
  } else {
    head([top[0], top[1] + size], false);
    head([bottom[0], bottom[1] - size], true);
  }

  ctx.restore();
}

function drawFocalPoint(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  x: number,
  label: string,
  below = true
) {
  const p = map([x, 0]);

  ctx.beginPath();
  ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#555");
  ctx.fill();

  ctx.save();
  ctx.font = "11px Arial";
  ctx.textAlign = "center";
  drawHaloText(ctx, label, p[0], p[1] + (below ? 16 : -10), tcol("#555"));
  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  base: Point,
  tip: Point,
  color: string,
  dashed: boolean,
  label: string,
  labelLeft = false
) {
  const a = map(base);
  const b = map(tip);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.setLineDash(dashed ? [7, 5] : []);
  ctx.stroke();

  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const size = 11;

  ctx.beginPath();
  ctx.moveTo(b[0], b[1]);
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
  ctx.font = "bold 13px Arial";
  ctx.textAlign = labelLeft ? "right" : "left";
  drawHaloText(
    ctx,
    label,
    labelLeft ? b[0] - 7 : b[0] + 7,
    b[1] - (b[1] > a[1] ? -16 : 8),
    color
  );
  ctx.restore();
}

type LegendItem = { label: string; color: string; dashed: boolean };

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

  let x = 330;
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
    ctx.font = "12px Arial";
    ctx.fillText(item.label, x + 33, y + 4);
    x += 33 + ctx.measureText(item.label).width + 22;
  }

  ctx.restore();
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  height: number,
  notes: string[]
) {
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

// ============================================================
// MICROSCOPE DIAGRAM
// ============================================================

export function drawMicroscope(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: MicroscopeResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const lastX = result.lenses[result.lenses.length - 1].x;
  const left = Math.max(result.object_distance + 4, 14);
  const right = Math.max(result.x_end + 4, lastX + 14);

  let maxY = result.object_height;
  for (const stage of result.stages) {
    if (stage.image_height !== null) {
      maxY = Math.max(maxY, Math.abs(stage.image_height));
    }
  }
  const extentY = Math.min(Math.max(maxY + 3, 6), 40);

  const scale = Math.min(
    (width - 80) / (left + right),
    (height - LEGEND_BAND - 50) / (2 * extentY)
  );
  const centerY = LEGEND_BAND + (height - LEGEND_BAND) / 2;

  const map: MapFn = (p) => [40 + (left + p[0]) * scale, centerY - p[1] * scale];

  drawGrid(ctx, width, height, map, scale, scale, left, right, extentY);

  drawPolyline(ctx, map, [[-left, 0], [right, 0]], tcol("#555"), 1.5, false);

  // lenses and focal points
  const half = extentY * 0.88;
  result.lenses.forEach((lens) => {
    drawLens(ctx, map, lens.x, half, lens.lens_type === "convex");

    const labelPoint = map([lens.x, half]);
    ctx.save();
    ctx.font = "bold 13px Arial";
    ctx.textAlign = "center";
    drawHaloText(
      ctx,
      lens.index === 1
        ? `Objective (f = ${fmt(lens.focal_length)})`
        : `Eyepiece (f = ${fmt(lens.focal_length)})`,
      labelPoint[0],
      labelPoint[1] - 12,
      tcol("#0e7490")
    );
    ctx.restore();

    const f = lens.focal_length;
    const tag = lens.index === 1 ? "Fo" : "Fe";
    drawFocalPoint(ctx, map, lens.x - f, `${tag}`);
    drawFocalPoint(ctx, map, lens.x + f, `${tag}'`);
  });

  drawArrow(ctx, map, result.object_base, result.object_point, tcol("#111"), false, "Object");

  for (const ray of result.rays) {
    const color = RAY_COLORS[ray.type] ?? tcol("#1671d9");
    drawPolyline(ctx, map, ray.points, color, 2.1, false);

    for (const segment of ray.extensions) {
      drawPolyline(ctx, map, segment, tcol("#888"), 1.4, true);
    }
    for (const p of ray.points.slice(1, -1)) {
      drawDot(ctx, map, p, color);
    }
  }

  result.stages.forEach((stage, i) => {
    if (stage.image_at_infinity || stage.image_x === null || stage.image_height === null) {
      return;
    }

    const isFinal = i === result.stages.length - 1;
    drawArrow(
      ctx,
      map,
      [stage.image_x, 0],
      [stage.image_x, stage.image_height],
      isFinal ? tcol("#111") : tcol("#2563eb"),
      stage.image_kind === "Virtual",
      isFinal ? "Final image" : "Intermediate image",
      !isFinal
    );
  });

  const notes: string[] = [];
  if (result.image_at_infinity) {
    notes.push("Final image at infinity: the rays leave the eyepiece parallel (relaxed eye).");
  }
  drawNotes(ctx, height, notes);

  const items: LegendItem[] = [
    ...result.rays.map((ray) => ({
      label: ray.name,
      color: RAY_COLORS[ray.type] ?? tcol("#1671d9"),
      dashed: false,
    })),
    { label: "Extension (virtual image)", color: tcol("#888"), dashed: true },
    { label: "Intermediate image", color: tcol("#2563eb"), dashed: false },
  ];
  drawLegendStrip(ctx, "Compound microscope", "Thin lenses, paraxial rays", items);
}

// ============================================================
// TELESCOPE DIAGRAM
// ============================================================

export function drawTelescope(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: TelescopeResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const left = -result.start_x + 3;
  const right = result.x_end + 3;

  const interHeight = Math.abs(result.intermediate_image?.height ?? 0);
  const finalHeight =
    result.final_image.height !== null ? Math.abs(result.final_image.height) : 0;

  const extentY = Math.min(
    Math.max(result.aperture * 1.6 + 1, interHeight * 1.4 + 1, finalHeight * 1.2, 4),
    60
  );

  // A telescope is much longer than it is wide, so the vertical scale is
  // exaggerated on purpose (paraxial rays do not care about the aspect).
  const scaleX = (width - 80) / (left + right);
  const scaleY = (height - LEGEND_BAND - 60) / (2 * extentY);
  const centerY = LEGEND_BAND + (height - LEGEND_BAND) / 2;

  const map: MapFn = (p) => [40 + (left + p[0]) * scaleX, centerY - p[1] * scaleY];

  drawGrid(ctx, width, height, map, scaleX, scaleY, left, right, extentY);

  drawPolyline(ctx, map, [[-left, 0], [right, 0]], tcol("#555"), 1.5, false);

  // lenses
  const half = Math.min(result.aperture * 1.25, extentY * 0.92);
  const fo = result.objective_focal_length;
  const fe = result.eyepiece_focal_length;
  const sep = result.separation;

  drawLens(ctx, map, 0, half, true);
  drawLens(ctx, map, sep, half, fe > 0);

  ctx.save();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "center";
  const objLabel = map([0, half]);
  const eyeLabel = map([sep, half]);
  drawHaloText(ctx, `Objective (f = ${fmt(fo)})`, objLabel[0], objLabel[1] - 12, tcol("#0e7490"));
  drawHaloText(ctx, `Eyepiece (f = ${fmt(fe)})`, eyeLabel[0], eyeLabel[1] - 12, tcol("#0e7490"));
  ctx.restore();

  // focal points: objective image side, eyepiece object side
  const foPrime = fo;
  const feFront = sep - fe;
  if (Math.abs(foPrime - feFront) < 0.5) {
    drawFocalPoint(ctx, map, foPrime, "Fo' = Fe");
  } else {
    drawFocalPoint(ctx, map, foPrime, "Fo'");
    drawFocalPoint(ctx, map, feFront, "Fe", false);
  }
  drawFocalPoint(ctx, map, sep + fe, "Fe'");

  // rays: axial bundle first, off-axis bundle on top
  const ordered = [...result.rays].sort((a, b) =>
    a.bundle === b.bundle ? 0 : a.bundle === "axial" ? -1 : 1
  );

  for (const ray of ordered) {
    const color = RAY_COLORS[ray.bundle];
    drawPolyline(ctx, map, ray.points, color, 1.9, false);

    for (const segment of ray.extensions) {
      drawPolyline(ctx, map, segment, tcol("#888"), 1.3, true);
    }
  }

  // intermediate image (formed by the objective)
  if (result.intermediate_image) {
    const inter = result.intermediate_image;
    drawArrow(
      ctx,
      map,
      [inter.x, 0],
      [inter.x, inter.height],
      tcol("#2563eb"),
      inter.kind.startsWith("Virtual"),
      "Intermediate image",
      true
    );
  }

  // final image, when it is at a finite distance
  if (!result.final_image.at_infinity && result.final_image.x !== null && result.final_image.height !== null) {
    drawArrow(
      ctx,
      map,
      [result.final_image.x, 0],
      [result.final_image.x, result.final_image.height],
      tcol("#111"),
      result.final_image.kind === "Virtual",
      "Final image"
    );
  }

  // distant object label
  ctx.save();
  ctx.font = "bold 13px Arial";
  ctx.textAlign = "left";
  const objectLabel = map([result.start_x, extentY * 0.85]);
  drawHaloText(
    ctx,
    `Distant object, ${fmt(result.field_angle, 1)}° above the axis`,
    objectLabel[0],
    objectLabel[1],
    tcol("#111")
  );
  ctx.restore();

  const notes: string[] = ["Vertical scale exaggerated so the narrow beams are visible."];
  if (result.final_image.at_infinity) {
    notes.push("Final image at infinity: the rays leave the eyepiece parallel.");
  }
  drawNotes(ctx, height, notes);

  const items: LegendItem[] = [
    { label: "On-axis star", color: RAY_COLORS.axial, dashed: false },
    { label: "Off-axis star", color: RAY_COLORS.off_axis, dashed: false },
    { label: "Extension (virtual image)", color: tcol("#888"), dashed: true },
    { label: "Intermediate image", color: tcol("#2563eb"), dashed: false },
  ];
  drawLegendStrip(
    ctx,
    result.kind === "keplerian" ? "Keplerian telescope" : "Galilean telescope",
    "Thin lenses, paraxial rays",
    items
  );
}
