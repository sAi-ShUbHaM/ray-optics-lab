import { canvasFont, tcol } from "@/lib/canvasTheme";
// Canvas drawing for the Atmospheric Refraction page.
// Pure functions only: no React, so they are easy to test on their own.

// ============================================================
// TYPES
// ============================================================

export type Point = [number, number];

export type CurvePoint = {
  apparent_altitude: number;
  true_altitude: number;
  refraction_arcmin: number;
  bennett_arcmin: number;
};

export type Limb = { true_altitude: number; apparent_altitude: number | null };

export type RefractionResult = {
  valid: boolean;
  conditions: {
    temperature_c: number;
    pressure_hpa: number;
    lapse_rate: number;
    tropopause_height_km: number;
    observer_height_m: number;
  };
  selected: {
    apparent_altitude: number;
    true_altitude: number;
    refraction_arcmin: number;
    refraction_arcsec: number;
    bennett_arcmin: number;
    zenith_distance: number;
    tan_approximation_arcmin: number | null;
  };
  curve: CurvePoint[];
  horizon_refraction_arcmin: number;
  horizon_dispersion_arcmin: number;
  path: {
    points: Point[];
    straight_line: Point[];
    max_horizontal_deviation_m: number;
    top_km: number;
  };
  bending: {
    heights_km: number[];
    cumulative_arcmin: number[];
    fraction: number[];
    half_height_km: number | null;
    p90_height_km: number | null;
  };
  air: {
    heights_km: number[];
    temperature_c: number[];
    pressure_hpa: number[];
    relative_density: number[];
    tropopause_km_above_observer: number;
    refractivity_at_observer_e6: number;
  };
  dispersion: {
    wavelength_nm: number;
    color: string;
    refraction_arcmin: number;
    offset_arcsec: number;
    refractivity_e6: number;
  }[];
  sun: {
    diameter_deg: number;
    true_centre_altitude: number;
    upper_limb: Limb;
    lower_limb: Limb;
    centre: Limb;
    apparent_vertical_diameter_deg: number | null;
    flattening: number | null;
    rows: { true_altitude: number; half_width_deg: number; apparent_altitude: number | null }[];
    colour_fringes: { wavelength_nm: number; color: string; apparent_altitude: number | null }[];
    sunset: {
      refraction_at_horizon_arcmin: number;
      true_centre_altitude_at_apparent_sunset: number;
      delay_minutes: number;
      extra_daylight_minutes: number;
      latitude: number;
    };
  };
};

export function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "∞";
  return Number(value.toFixed(digits)).toString();
}

// ============================================================
// HELPERS
// ============================================================

const BLUE = "#1671d9";
const ORANGE = "#e67e00";

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

// White text with a dark outline, for labels on the dark ground.
function drawLightText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.save();
  ctx.lineWidth = 3.5;
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.strokeStyle = tcol("rgba(20, 30, 10, 0.8)");
  ctx.strokeText(text, x, y);
  ctx.fillStyle = tcol("#fff");
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
    ticks.push(Math.abs(v) < step * 1e-6 ? 0 : Number(v.toFixed(decimals)));
  }
  return ticks;
}

type Area = {
  left: number;
  top: number;
  width: number;
  height: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

const ax = (a: Area, x: number) => a.left + ((x - a.xMin) / (a.xMax - a.xMin)) * a.width;
const ay = (a: Area, y: number) => a.top + (1 - (y - a.yMin) / (a.yMax - a.yMin)) * a.height;

function drawAxes(
  ctx: CanvasRenderingContext2D,
  a: Area,
  xLabel: string,
  yLabel: string,
  xSuffix = "",
  ySuffix = ""
) {
  ctx.save();
  ctx.font = canvasFont(12, "sans", 400);
  ctx.strokeStyle = tcol("#eee");
  ctx.fillStyle = tcol("#555");
  ctx.lineWidth = 1;

  for (const t of niceTicks(a.xMin, a.xMax, 6)) {
    ctx.beginPath();
    ctx.moveTo(ax(a, t), a.top);
    ctx.lineTo(ax(a, t), a.top + a.height);
    ctx.stroke();
    ctx.textAlign = "center";
    ctx.fillText(`${t}${xSuffix}`, ax(a, t), a.top + a.height + 17);
  }

  for (const t of niceTicks(a.yMin, a.yMax, 6)) {
    ctx.beginPath();
    ctx.moveTo(a.left, ay(a, t));
    ctx.lineTo(a.left + a.width, ay(a, t));
    ctx.stroke();
    ctx.textAlign = "right";
    ctx.fillText(`${t}${ySuffix}`, a.left - 8, ay(a, t) + 4);
  }

  ctx.strokeStyle = tcol("#555");
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(a.left, a.top);
  ctx.lineTo(a.left, a.top + a.height);
  ctx.lineTo(a.left + a.width, a.top + a.height);
  ctx.stroke();

  ctx.fillStyle = tcol("#333");
  ctx.font = canvasFont(13, "sans", 400);
  ctx.textAlign = "center";
  ctx.fillText(xLabel, a.left + a.width / 2, a.top + a.height + 40);

  ctx.translate(a.left - 52, a.top + a.height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(yLabel, 0, 0);
  ctx.restore();
}

function line(
  ctx: CanvasRenderingContext2D,
  a: Area,
  points: Point[],
  color: string,
  width: number,
  dash: number[] = []
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(a.left, a.top, a.width, a.height);
  ctx.clip();
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = ax(a, p[0]);
    const y = ay(a, p[1]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

// ============================================================
// 1. HOW MUCH THE ATMOSPHERE LIFTS AN OBJECT
// ============================================================

export function drawRefractionCurve(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: RefractionResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const n0 = result.air.refractivity_at_observer_e6 * 1e-6;
  const tanApprox = (h: number): number =>
    ((n0 * Math.tan(((90 - h) * Math.PI) / 180)) * 180 * 60) / Math.PI;

  const yTop = Math.ceil((result.horizon_refraction_arcmin * 1.12) / 5) * 5;

  const gap = 90;
  const panelW = (width - 70 - 30 - gap) / 2;
  const top = 50;
  const plotH = height - top - 62;

  const panels: { area: Area; zoom: boolean }[] = [
    {
      zoom: false,
      area: { left: 70, top, width: panelW, height: plotH, xMin: 0, xMax: 90, yMin: 0, yMax: yTop },
    },
    {
      zoom: true,
      area: { left: 70 + panelW + gap, top, width: panelW, height: plotH, xMin: 0, xMax: 10, yMin: 0, yMax: yTop },
    },
  ];

  ctx.fillStyle = tcol("#111");
  ctx.font = canvasFont(14, "sans", 700);
  ctx.textAlign = "left";
  ctx.fillText("Refraction: how far the atmosphere lifts an object", 16, 24);
  ctx.font = canvasFont(12, "sans", 400);
  ctx.fillStyle = tcol("#666");
  ctx.fillText(
    "Right: the same curve, zoomed to the first 10 degrees above the horizon.",
    16,
    42
  );

  for (const { area, zoom } of panels) {
    drawAxes(
      ctx,
      area,
      "Apparent altitude of the object",
      "Refraction (arcminutes)",
      "°",
      "′"
    );

    const inRange = (p: CurvePoint) => p.apparent_altitude <= area.xMax + 1e-9;
    const pts = result.curve.filter(inRange);

    // the flat-atmosphere approximation (n - 1) tan z: fine high up, hopeless near the horizon
    const flat: Point[] = [];
    for (let i = 0; i <= 200; i++) {
      const h = Math.max(area.xMin + ((area.xMax - area.xMin) * i) / 200, 0.2);
      const value = tanApprox(h);
      if (value <= yTop * 1.4) flat.push([h, value]);
    }
    line(ctx, area, flat, tcol("#9aa3b2"), 1.8, [2, 4]);

    line(
      ctx,
      area,
      pts.map((p) => [p.apparent_altitude, p.bennett_arcmin] as Point),
      tcol("#777"),
      1.8,
      [7, 5]
    );
    line(
      ctx,
      area,
      pts.map((p) => [p.apparent_altitude, p.refraction_arcmin] as Point),
      tcol(BLUE),
      3
    );

    // the Sun's diameter, for scale
    if (zoom && 32 < yTop) {
      line(ctx, area, [[0, 32], [10, 32]], tcol("#e11d48"), 1.4, [5, 4]);
      ctx.font = canvasFont(12, "sans", 700);
      ctx.textAlign = "right";
      drawHaloText(ctx, "Sun's diameter (32′)", area.left + area.width - 8, ay(area, 32) - 6, tcol("#e11d48"));
    }

    // the selected object
    const s = result.selected;
    if (s.apparent_altitude <= area.xMax) {
      ctx.beginPath();
      ctx.arc(ax(area, s.apparent_altitude), ay(area, s.refraction_arcmin), 6.5, 0, Math.PI * 2);
      ctx.fillStyle = tcol(ORANGE);
      ctx.fill();
      ctx.strokeStyle = tcol("#fff");
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = canvasFont(12, "sans", 700);
      const nearRight = s.apparent_altitude > area.xMin + 0.7 * (area.xMax - area.xMin);
      ctx.textAlign = nearRight ? "right" : "left";
      drawHaloText(
        ctx,
        `${fmt(s.refraction_arcmin, 2)}′ at ${fmt(s.apparent_altitude, 1)}°`,
        ax(area, s.apparent_altitude) + (nearRight ? -10 : 10),
        ay(area, s.refraction_arcmin) - 10,
        tcol(ORANGE)
      );
    }

    // key
    if (!zoom) {
      const kx = area.left + area.width - 250;
      const ky = area.top + 14;
      ctx.save();
      ctx.fillStyle = tcol("rgba(255,255,255,0.92)");
      ctx.strokeStyle = tcol("#ddd");
      ctx.beginPath();
      ctx.roundRect(kx - 10, ky - 8, 258, 74, 6);
      ctx.fill();
      ctx.stroke();

      const rows: [string, string, number[]][] = [
        [tcol(BLUE), "This model (dry air, Edlén)", []],
        [tcol("#777"), "Bennett's empirical formula", [7, 5]],
        [tcol("#9aa3b2"), "(n − 1) tan z: a flat atmosphere", [2, 4]],
      ];
      ctx.font = canvasFont(12, "sans", 400);
      ctx.textAlign = "left";
      rows.forEach(([color, text, dash], i) => {
        const y = ky + 8 + i * 22;
        ctx.beginPath();
        ctx.moveTo(kx, y);
        ctx.lineTo(kx + 30, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.setLineDash(dash);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = tcol("#222");
        ctx.fillText(text, kx + 38, y + 4);
      });
      ctx.restore();
    }
  }
}

// ============================================================
// 2. THE RAY THROUGH THE ATMOSPHERE, AND WHERE IT BENDS
// ============================================================

export function drawPath(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: RefractionResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const top = 56;
  const plotH = height - top - 62;
  const leftW = Math.floor((width - 70 - 40 - 90) * 0.62);
  const rightW = width - 70 - 40 - 90 - leftW;

  const path = result.path.points;
  const straight = result.path.straight_line;

  // ----- the ray: the gap between the ray and the straight line is exaggerated -----
  const xMax = Math.max(path[path.length - 1][0], straight[straight.length - 1][0], 1);
  const maxDevKm = Math.max(result.path.max_horizontal_deviation_m / 1000, 1e-9);
  const exaggeration = Math.min(Math.max(1, (0.12 * xMax) / maxDevKm), 400);

  const drawn: Point[] = path.map((p, i) => {
    const s = straight[i];
    return [s[0] + exaggeration * (p[0] - s[0]), p[1]];
  });

  const xEnd = Math.max(...drawn.map((p) => p[0]), xMax) * 1.04;
  const left: Area = {
    left: 70,
    top,
    width: leftW,
    height: plotH,
    xMin: 0,
    xMax: xEnd,
    yMin: 0,
    yMax: 60,
  };

  ctx.fillStyle = tcol("#111");
  ctx.font = canvasFont(14, "sans", 700);
  ctx.textAlign = "left";
  ctx.fillText("The path of the light, from the top of the atmosphere to the observer", 16, 24);
  ctx.font = canvasFont(12, "sans", 400);
  ctx.fillStyle = tcol("#666");
  ctx.fillText(
    exaggeration > 1.5
      ? `The distance between the ray and the straight line is exaggerated ×${fmt(exaggeration, 0)}.`
      : "The ray and the straight line are drawn to scale.",
    16,
    42
  );

  // air density as shading behind the path
  const density = result.air.relative_density;
  const heights = result.air.heights_km;
  for (let i = 0; i < heights.length - 1; i++) {
    const y1 = ay(left, heights[i + 1]);
    const y2 = ay(left, heights[i]);
    ctx.fillStyle = `rgba(60, 130, 220, ${0.04 + 0.3 * density[i]})`;
    ctx.fillRect(left.left, y1, left.width, y2 - y1 + 0.5);
  }

  drawAxes(ctx, left, "Distance along the ground (km)", "Height above the observer (km)", "", "");

  line(ctx, left, straight, tcol("#888"), 2, [8, 6]);
  line(ctx, left, drawn, tcol(BLUE), 3.2);

  // the observer
  ctx.beginPath();
  ctx.arc(ax(left, 0), ay(left, 0), 6, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#111");
  ctx.fill();
  ctx.font = canvasFont(12, "sans", 700);
  ctx.textAlign = "left";
  drawHaloText(ctx, "Observer", ax(left, 0) + 12, ay(left, 0) - 8, tcol("#111"));

  // a key in the empty upper-left corner
  ctx.save();
  ctx.fillStyle = tcol("rgba(255,255,255,0.92)");
  ctx.strokeStyle = tcol("#ddd");
  ctx.beginPath();
  ctx.roundRect(left.left + 12, left.top + 10, 330, 78, 6);
  ctx.fill();
  ctx.stroke();

  const keyRows: [string, string, number[]][] = [
    [tcol(BLUE), "the ray, from the star to the observer", []],
    [tcol("#888"), "straight line along the apparent direction", [8, 6]],
  ];
  ctx.font = canvasFont(12, "sans", 400);
  ctx.textAlign = "left";
  keyRows.forEach(([color, text, dash], i) => {
    const y = left.top + 30 + i * 22;
    ctx.beginPath();
    ctx.moveTo(left.left + 24, y);
    ctx.lineTo(left.left + 58, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash(dash);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = tcol("#222");
    ctx.fillText(text, left.left + 68, y + 4);
  });
  ctx.fillStyle = tcol("#555");
  ctx.fillText("blue shading: denser air", left.left + 24, left.top + 78);
  ctx.restore();

  // ----- where along the ray the bending happens -----
  const b = result.bending;
  const maxHeight = 40;
  const right: Area = {
    left: 70 + leftW + 90,
    top,
    width: rightW,
    height: plotH,
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: maxHeight,
  };

  drawAxes(ctx, right, "Fraction (0 to 1)", "Height (km)", "", "");

  const cumulative: Point[] = [];
  for (let i = 0; i < b.heights_km.length; i++) {
    if (b.heights_km[i] <= maxHeight) cumulative.push([b.fraction[i], b.heights_km[i]]);
  }
  const dens: Point[] = [];
  for (let i = 0; i < heights.length; i++) {
    if (heights[i] <= maxHeight) dens.push([density[i], heights[i]]);
  }

  line(ctx, right, dens, tcol("#9aa3b2"), 2.2, [6, 4]);
  line(ctx, right, cumulative, tcol(BLUE), 3.2);

  const marks: [number | null, string][] = [
    [b.half_height_km, "half of the bending"],
    [b.p90_height_km, "90 % of the bending"],
  ];
  marks.forEach(([h, text]) => {
    if (h === null || h > maxHeight) return;
    line(ctx, right, [[0, h], [1, h]], tcol("#e11d48"), 1.3, [5, 4]);
    ctx.font = canvasFont(12, "sans", 700);
    ctx.textAlign = "right";
    drawHaloText(ctx, `${text} happens below ${fmt(h, 1)} km`, right.left + right.width - 8, ay(right, h) - 6, tcol("#e11d48"));
  });

  ctx.font = canvasFont(12, "sans", 400);
  ctx.textAlign = "left";
  drawHaloText(ctx, "bending so far", right.left + 10, right.top + 18, tcol(BLUE));
  drawHaloText(ctx, "air density", right.left + 10, right.top + 36, tcol("#6b7280"));
}

// ============================================================
// 3. THE SUN AT THE HORIZON
// ============================================================

export function drawSun(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: RefractionResult
) {
  const width = canvas.width;
  const height = canvas.height;
  clearCanvas(ctx, canvas);

  const sun = result.sun;
  const D = sun.diameter_deg;

  const sceneW = Math.floor(width * 0.6);
  const top = 56;
  const bottom = 30;
  const plotH = height - top - bottom;

  // ----- vertical scale: altitude in degrees -----
  const apparentUpper = sun.upper_limb.apparent_altitude;
  const hi = Math.max(1.6, (apparentUpper ?? sun.upper_limb.true_altitude) + 0.5, sun.upper_limb.true_altitude + 0.5);
  const lo = -0.55;
  const scale = plotH / (hi - lo); // pixels per degree (the same horizontally)
  const py = (alt: number) => top + (hi - alt) * scale;
  const cx = sceneW / 2 + 10;
  const horizonY = py(0);

  ctx.fillStyle = tcol("#111");
  ctx.font = canvasFont(14, "sans", 700);
  ctx.textAlign = "left";
  ctx.fillText("The Sun near the horizon", 16, 24);
  ctx.font = canvasFont(12, "sans", 400);
  ctx.fillStyle = tcol("#666");
  ctx.fillText(
    `Sun's centre at a true altitude of ${fmt(sun.true_centre_altitude, 2)}°. One degree is ${fmt(scale, 0)} pixels.`,
    16,
    42
  );

  // sky and ground
  const sky = ctx.createLinearGradient(0, top, 0, horizonY);
  sky.addColorStop(0, tcol("#7fb2ea"));
  sky.addColorStop(1, tcol("#fbe6c8"));
  ctx.fillStyle = sky;
  ctx.fillRect(0, top, sceneW, horizonY - top);

  ctx.save();
  ctx.fillStyle = tcol("#6b7a55");
  ctx.fillRect(0, horizonY, sceneW, top + plotH - horizonY);
  ctx.restore();

  // altitude scale
  ctx.save();
  ctx.font = canvasFont(11, "sans", 400);
  ctx.fillStyle = tcol("#fff");
  ctx.textAlign = "left";
  for (const t of niceTicks(lo, hi, 7)) {
    const y = py(t);
    if (y < top || y > top + plotH) continue;
    ctx.strokeStyle = tcol("rgba(255,255,255,0.35)");
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(sceneW, y);
    ctx.stroke();
    drawHaloText(ctx, `${t}°`, 8, y - 3, tcol("#234"));
  }
  ctx.restore();

  // where the Sun would be without the atmosphere: dashed outline, above the horizon only
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, sceneW, horizonY - top);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(cx, py(sun.true_centre_altitude), (D / 2) * scale, 0, Math.PI * 2);
  ctx.strokeStyle = tcol("#222");
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.restore();

  // the apparent Sun, row by row (the horizontal width is not changed by refraction)
  const visible = sun.rows.filter((r) => r.apparent_altitude !== null);
  if (visible.length >= 2) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, sceneW, horizonY - top);
    ctx.clip();

    ctx.beginPath();
    visible.forEach((r, i) => {
      const x = cx + r.half_width_deg * scale;
      const y = py(r.apparent_altitude as number);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    for (let i = visible.length - 1; i >= 0; i--) {
      const r = visible[i];
      ctx.lineTo(cx - r.half_width_deg * scale, py(r.apparent_altitude as number));
    }
    ctx.closePath();

    const glow = ctx.createLinearGradient(0, py(visible[visible.length - 1].apparent_altitude as number), 0, py(visible[0].apparent_altitude as number));
    glow.addColorStop(0, tcol("#ffd24a"));
    glow.addColorStop(1, tcol("#ff8a00"));
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.strokeStyle = tcol("#b45309");
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // horizon line
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(sceneW, horizonY);
  ctx.strokeStyle = tcol("#2f3b22");
  ctx.lineWidth = 2;
  ctx.stroke();

  // labels
  ctx.save();
  ctx.font = canvasFont(13, "sans", 700);
  ctx.textAlign = "left";
  drawLightText(ctx, "Horizon", sceneW - 80, horizonY + 20);
  drawLightText(ctx, "dashed outline: where the Sun is without air", 70, top + plotH - 8);
  if (visible.length >= 2) {
    drawLightText(ctx, "solid disc: the Sun you see", 70, top + plotH - 28);
  }
  ctx.restore();

  // readout
  ctx.save();
  ctx.font = canvasFont(14, "sans", 700);
  ctx.textAlign = "left";
  const lines: string[] = [];
  if (sun.flattening !== null && sun.apparent_vertical_diameter_deg !== null) {
    lines.push(`Height of the disc: ${fmt(sun.apparent_vertical_diameter_deg * 60, 1)}′`);
    lines.push(`Width of the disc: ${fmt(D * 60, 1)}′`);
    lines.push(`Flattening: ${fmt(sun.flattening, 3)}`);
  } else {
    lines.push("Part of the Sun is below the horizon.");
  }
  lines.forEach((text, i) => {
    drawHaloText(ctx, text, sceneW - 270, top + 28 + i * 22, tcol("#111"));
  });
  ctx.restore();

  // ----- the colours of the upper rim -----
  const px0 = sceneW + 40;
  const pw = width - px0 - 24;

  ctx.fillStyle = tcol("#111");
  ctx.font = canvasFont(14, "sans", 700);
  ctx.textAlign = "left";
  ctx.fillText("The upper rim in each colour", px0, 24);
  ctx.font = canvasFont(12, "sans", 400);
  ctx.fillStyle = tcol("#666");
  ctx.fillText("Blue light is refracted more than red, so it sits higher.", px0, 42);

  ctx.fillStyle = tcol("#0e1a33");
  ctx.fillRect(px0, top, pw, plotH);

  const fringes = sun.colour_fringes.filter((f) => f.apparent_altitude !== null);
  if (fringes.length >= 2) {
    const altitudes = fringes.map((f) => f.apparent_altitude as number);
    const spread = Math.max(...altitudes) - Math.min(...altitudes);
    const targetPx = 70;
    const magnification = spread > 0 ? targetPx / (spread * scale) : 1;
    const reference = altitudes[Math.floor(altitudes.length / 2)];

    const radius = Math.min(pw * 0.46, 170);
    const centreX = px0 + pw / 2;
    const baseY = top + plotH * 0.62;

    ctx.save();
    ctx.beginPath();
    ctx.rect(px0, top, pw, plotH);
    ctx.clip();

    // arcs of the upper limb, one per colour, offset by the exaggerated differences
    const ordered = [...fringes].sort((a, b) => (a.apparent_altitude as number) - (b.apparent_altitude as number));
    for (const f of ordered) {
      const offset = ((f.apparent_altitude as number) - reference) * scale * magnification;
      ctx.beginPath();
      ctx.arc(centreX, baseY - offset, radius, Math.PI * 1.12, Math.PI * 1.88);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.9;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.save();
    ctx.font = canvasFont(12, "sans", 400);
    ctx.fillStyle = tcol("#cbd5e1");
    ctx.textAlign = "center";
    ctx.fillText(
      `Differences exaggerated ×${fmt(magnification, 0)}. The real spread is ${fmt(spread * 60, 2)}′.`,
      centreX,
      top + plotH - 54
    );
    ctx.fillText("Violet and blue are scattered away,", centreX, top + plotH - 34);
    ctx.fillText("so the top rim that is left is green: the green flash.", centreX, top + plotH - 16);
    ctx.restore();
  } else {
    ctx.save();
    ctx.font = canvasFont(13, "sans", 400);
    ctx.fillStyle = tcol("#cbd5e1");
    ctx.textAlign = "center";
    ctx.fillText("The upper rim is below the horizon.", px0 + pw / 2, top + plotH / 2);
    ctx.restore();
  }

}
