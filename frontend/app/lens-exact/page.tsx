"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { API_BASE } from "@/lib/config";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme, tcol } from "@/lib/canvasTheme";

// ============================================================
// TYPES
// ============================================================

type Point = [number, number];
type Source = "parallel" | "point";

type TracedRay = {
  index: number;
  entry_height: number;
  points: Point[]; // source, hit 1, hit 2, end (fewer if the ray stops early)
  status: string;
  ok: boolean;
  hit_1: Point | null;
  hit_2: Point | null;
  exit_direction: Point | null;
  axis_crossing_x: number | null;
  crossing_ahead: boolean | null;
  y_at_image_plane: number | null;
};

type ExactLensResult = {
  valid: boolean;
  n: number;
  r1: number;
  r2: number;
  thickness: number;
  aperture_requested: number;
  aperture: number;
  aperture_limited: boolean;
  shape: string;
  power: number;
  focal_length: number | null;
  focal_length_thin: number | null;
  converging: boolean;
  back_focal_distance: number | null;
  front_focal_distance: number | null;
  principal_plane_1_x: number | null;
  principal_plane_2_x: number | null;
  focus_1: Point | null;
  focus_2: Point | null;
  surface_1: Point[];
  surface_2: Point[];
  source: Source;
  object_distance: number;
  source_height: number;
  x_start: number;
  x_end: number;
  paraxial_image: Point | null;
  image_plane_x: number | null;
  blur_height: number | null;
  marginal_axis_crossing_x: number | null;
  longitudinal_aberration: number | null;
  rays: TracedRay[];
};

type Preset = { label: string; r1: number; r2: number };

// Radius 0 means a flat surface.
const PRESETS: Preset[] = [
  { label: "Biconvex", r1: 15, r2: -15 },
  { label: "Plano-convex (curved side first)", r1: 15, r2: 0 },
  { label: "Plano-convex (flat side first)", r1: 0, r2: -15 },
  { label: "Biconcave", r1: -15, r2: 15 },
  { label: "Plano-concave (flat side last)", r1: -15, r2: 0 },
  { label: "Converging meniscus", r1: 10, r2: 25 },
  { label: "Diverging meniscus", r1: -25, r2: -10 },
];

// ============================================================
// VIEW + DRAWING
// ============================================================

type MapFn = (p: Point) => Point;

function getView(result: ExactLensResult, width: number, height: number) {
  const left = -result.x_start + 3;
  const right = Math.max(result.x_end + 3, 12);

  const imageY = Math.abs(result.paraxial_image?.[1] ?? 0);

  const extentY = Math.min(
    Math.max(
      result.aperture * 1.4 + 2,
      Math.abs(result.source_height) + 3,
      imageY + 3,
      10
    ),
    40
  );

  const scale = Math.min(
    (width - 80) / (left + right),
    (height - 60) / (2 * extentY)
  );

  const map: MapFn = (p) => [40 + (left + p[0]) * scale, height / 2 - p[1] * scale];

  return { left, right, extentY, scale, map };
}

// Blue near the axis, orange at the edge of the beam.
function hueColor(t: number): string {
  return `hsl(${Math.round(210 - 190 * t)}, 80%, 45%)`;
}

function rayColor(result: ExactLensResult, ray: TracedRay): string {
  const t = Math.min(1, Math.abs(ray.entry_height) / (0.9 * result.aperture));
  return hueColor(t);
}

function drawDiagram(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: ExactLensResult
) {
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, width, height);

  const { left, right, extentY, scale, map } = getView(result, width, height);

  drawGrid(ctx, width, height, scale, map, left, right, extentY);

  // Principal axis
  drawPolyline(
    ctx,
    map,
    [
      [-left, 0],
      [right, 0],
    ],
    tcol("#555"),
    1.5,
    false);

  drawLensBody(ctx, map, result);

  // Principal planes
  if (result.principal_plane_1_x !== null && result.principal_plane_2_x !== null) {
    const same =
      Math.abs(result.principal_plane_1_x - result.principal_plane_2_x) < 0.05;
    drawVerticalLine(ctx, map, result.principal_plane_1_x, extentY * 0.8, tcol("#999"));
    if (!same) {
      drawVerticalLine(ctx, map, result.principal_plane_2_x, extentY * 0.8, tcol("#999"));
    }
    drawTopLabel(
      ctx,
      map,
      result.principal_plane_1_x,
      extentY * 0.8,
      same ? "H" : "H1",
      tcol("#777"),
      same ? "left" : "right"
    );
    if (!same) {
      drawTopLabel(ctx, map, result.principal_plane_2_x, extentY * 0.8, "H2", tcol("#777"), "left");
    }
  }

  // Paraxial focal / image plane
  if (result.image_plane_x !== null) {
    drawVerticalLine(ctx, map, result.image_plane_x, extentY * 0.7, tcol("#16a34a"), true);
    drawTopLabel(
      ctx,
      map,
      result.image_plane_x,
      extentY * 0.7,
      result.source === "parallel" ? "paraxial focal plane" : "paraxial image plane",
      tcol("#16a34a")
    );
  }

  if (result.focus_1) drawReference(ctx, map, "F1", result.focus_1[0]);
  if (result.focus_2) drawReference(ctx, map, "F2", result.focus_2[0]);

  drawSource(ctx, map, result);
  drawRays(ctx, map, result);

  if (result.paraxial_image) {
    const c = map(result.paraxial_image);
    ctx.beginPath();
    ctx.arc(c[0], c[1], 5, 0, Math.PI * 2);
    ctx.fillStyle = tcol("#16a34a");
    ctx.fill();

    if (result.source === "point") {
      ctx.font = "bold 13px Arial";
      drawHaloText(ctx, "paraxial image", c[0] + 8, c[1] - 10, tcol("#16a34a"));
    }
  }

  // Notes at the bottom of the canvas
  const notes: string[] = [];

  if (result.aperture_limited) {
    notes.push(
      `Aperture reduced from ${fmt(result.aperture_requested)} to ${fmt(
        result.aperture
      )} so the lens geometry stays valid.`
    );
  }

  if (result.focal_length === null) {
    notes.push("This lens has no focusing power (a flat plate or zero net power).");
  }

  ctx.fillStyle = tcol("#b45309");
  ctx.font = "13px Arial";
  notes.forEach((text, i) => {
    ctx.fillText(text, 20, height - 14 - (notes.length - 1 - i) * 18);
  });

  drawLegend(ctx);
}

function drawLensBody(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  result: ExactLensResult
) {
  const outline: Point[] = [
    ...result.surface_1,
    ...[...result.surface_2].reverse(),
  ];

  ctx.save();
  ctx.beginPath();
  outline.forEach((p, i) => {
    const c = map(p);
    if (i === 0) ctx.moveTo(c[0], c[1]);
    else ctx.lineTo(c[0], c[1]);
  });
  ctx.closePath();
  ctx.fillStyle = tcol("rgba(14, 116, 144, 0.16)");
  ctx.fill();
  ctx.strokeStyle = tcol("#0e7490");
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = tcol("#0e7490");
  ctx.font = "bold 14px Arial";
  const label = map([0, result.aperture]);
  ctx.fillText(result.shape, label[0] - 30, label[1] - 12);
  ctx.restore();
}

function drawSource(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  result: ExactLensResult
) {
  ctx.save();
  ctx.fillStyle = tcol("#111");
  ctx.font = "bold 14px Arial";

  if (result.source === "point") {
    const c = map([result.x_start, result.source_height]);
    ctx.beginPath();
    ctx.arc(c[0], c[1], 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText("Point source", c[0] - 10, c[1] - 14);
  } else {
    const c = map([result.x_start, result.aperture * 1.05]);
    ctx.fillText("Parallel beam", c[0] - 6, c[1] - 6);
  }

  ctx.restore();
}

function drawRays(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  result: ExactLensResult
) {
  // Draw marginal rays first so the near-axis rays stay visible on top.
  const ordered = [...result.rays].sort(
    (a, b) => Math.abs(b.entry_height) - Math.abs(a.entry_height)
  );

  for (const ray of ordered) {
    if (!ray.ok) {
      const missed = ray.status === "Misses the lens aperture";
      drawPolyline(
        ctx,
        map,
        ray.points,
        missed ? tcol("#aaa") : tcol("#dc2626"),
        1.6,
        true);

      if (!missed && ray.points.length > 1) {
        drawHitDot(ctx, map, ray.points[ray.points.length - 1], tcol("#dc2626"));
      }
      continue;
    }

    const color = rayColor(result, ray);

    drawPolyline(ctx, map, ray.points, color, 1.8, false);

    // Virtual image: when the paraxial image plane lies BEHIND the exit
    // point, extend the ray backwards to that plane (dashed).
    if (
      ray.hit_2 &&
      result.image_plane_x !== null &&
      ray.y_at_image_plane !== null &&
      result.image_plane_x < ray.hit_2[0]
    ) {
      drawPolyline(
        ctx,
        map,
        [ray.hit_2, [result.image_plane_x, ray.y_at_image_plane]],
        tcol("#999"),
        1.2,
        true
      );
    }

    if (ray.hit_1) drawHitDot(ctx, map, ray.hit_1, color);
    if (ray.hit_2) drawHitDot(ctx, map, ray.hit_2, color);
  }
}

function drawHitDot(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  p: Point,
  color: string
) {
  const c = map(p);
  ctx.beginPath();
  ctx.arc(c[0], c[1], 2.8, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawVerticalLine(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  x: number,
  halfHeight: number,
  color: string,
  dashed = true
) {
  drawPolyline(
    ctx,
    map,
    [
      [x, -halfHeight],
      [x, halfHeight],
    ],
    color,
    1.1,
    dashed);
}

function drawTopLabel(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  x: number,
  y: number,
  text: string,
  color = tcol("#777"),
  align: "left" | "right" = "left"
) {
  const c = map([x, y]);
  ctx.save();
  ctx.font = "12px Arial";
  ctx.textAlign = align;
  drawHaloText(ctx, text, c[0] + (align === "left" ? 4 : -4), c[1] - 4, color);
  ctx.restore();
}

// Text with a white outline so it stays readable on top of rays.
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

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  map: MapFn,
  left: number,
  right: number,
  extentY: number
) {
  const step = scale > 28 ? 1 : scale > 12 ? 2 : 5;

  ctx.strokeStyle = tcol("#eee");
  ctx.lineWidth = 1;

  for (let x = Math.ceil(-left / step) * step; x <= right; x += step) {
    const px = map([x, 0])[0];
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }

  for (let y = Math.ceil(-extentY / step) * step; y <= extentY; y += step) {
    const py = map([0, y])[1];
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
    ctx.stroke();
  }
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

  ctx.font = "bold 13px Arial";
  ctx.fillText(name, p[0] - 8, p[1] + 20);
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

function drawLegend(ctx: CanvasRenderingContext2D) {
  const boxWidth = 300;
  const boxHeight = 132;

  ctx.save();
  ctx.fillStyle = tcol("rgba(255,255,255,0.95)");
  ctx.strokeStyle = tcol("#ddd");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(16, 16, boxWidth, boxHeight, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = tcol("#111");
  ctx.font = "bold 13px Arial";
  ctx.fillText("Exact refraction at two spherical surfaces", 28, 38);

  ctx.fillStyle = tcol("#666");
  ctx.font = "12px Arial";
  ctx.fillText("Snell's law applied at every hit point", 28, 56);

  // Colour scale: near-axis (blue) to marginal (orange)
  const gradient = ctx.createLinearGradient(28, 0, 104, 0);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    gradient.addColorStop(t, hueColor(t));
  }
  ctx.beginPath();
  ctx.moveTo(28, 76);
  ctx.lineTo(104, 76);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = tcol("#222");
  ctx.fillText("Near axis (blue) to edge of beam (orange)", 112, 80);

  ctx.beginPath();
  ctx.moveTo(28, 98);
  ctx.lineTo(104, 98);
  ctx.strokeStyle = tcol("#999");
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = tcol("#222");
  ctx.fillText("Backward extension (virtual focus)", 112, 102);

  ctx.beginPath();
  ctx.moveTo(28, 120);
  ctx.lineTo(104, 120);
  ctx.strokeStyle = tcol("#aaa");
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = tcol("#222");
  ctx.fillText("Ray missed or lost (red = lost in lens)", 112, 124);

  ctx.restore();
}

function fmt(value: number | null | undefined, digits = 2) {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "∞";
  return Number(value.toFixed(digits)).toString();
}

// ============================================================
// PAGE COMPONENT
// ============================================================

export default function LensExactPage() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [n, setN] = useState(1.5);
  const [r1, setR1] = useState(15);
  const [r2, setR2] = useState(-15);
  const [thickness, setThickness] = useState(2);
  const [aperture, setAperture] = useState(6);
  const [source, setSource] = useState<Source>("parallel");
  const [objectDistance, setObjectDistance] = useState(30);
  const [sourceHeight, setSourceHeight] = useState(0);
  const [rayCount, setRayCount] = useState(9);

  const [data, setData] = useState<ExactLensResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function simulate() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_BASE}/simulate/lens-exact`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              n,
              r1,
              r2,
              thickness,
              aperture,
              source,
              object_distance: objectDistance,
              source_height: sourceHeight,
              ray_count: rayCount,
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

        const result: ExactLensResult = await response.json();

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
  }, [n, r1, r2, thickness, aperture, source, objectDistance, sourceHeight, rayCount]);

  useEffect(() => {
    setCanvasTheme(theme);
    if (!data || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    drawDiagram(ctx, canvasRef.current, data);
  }, [data, theme]);

  function applyPreset(label: string) {
    const preset = PRESETS.find((p) => p.label === label);
    if (!preset) return;
    setR1(preset.r1);
    setR2(preset.r2);
  }

  return (
    <main style={styles.page}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(1.625rem, 1.2rem + 1.4vw, 2.125rem)", fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 8, color: "var(--text)" }}>
          Exact Lens — Spherical Surfaces
        </h1>

        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          Build a real glass lens from its refractive index, two surface radii
          and thickness. Every ray is refracted with Snell&apos;s law at both
          curved surfaces, so spherical aberration appears on its own.
        </p>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Lens</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Shape preset
              <select
                defaultValue=""
                onChange={(e) => applyPreset(e.target.value)}
                style={styles.select}
              >
                <option value="" disabled>
                  Choose a shape...
                </option>
                {PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Refractive index n: {n.toFixed(2)}
              <input
                type="range"
                min="1.2"
                max="2.4"
                step="0.01"
                value={n}
                onChange={(e) => setN(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Front radius R1: {r1 === 0 ? "flat" : r1}
              <input
                type="range"
                min="-40"
                max="40"
                step="1"
                value={r1}
                onChange={(e) => setR1(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Back radius R2: {r2 === 0 ? "flat" : r2}
              <input
                type="range"
                min="-40"
                max="40"
                step="1"
                value={r2}
                onChange={(e) => setR2(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Centre thickness: {thickness.toFixed(1)}
              <input
                type="range"
                min="0.2"
                max="6"
                step="0.1"
                value={thickness}
                onChange={(e) => setThickness(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Aperture (half-height): {aperture.toFixed(1)}
              <input
                type="range"
                min="2"
                max="12"
                step="0.5"
                value={aperture}
                onChange={(e) => setAperture(Number(e.target.value))}
              />
            </label>
          </div>

          <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 0 }}>
            Radius sign: positive means the centre of curvature is to the right
            of the surface, negative to the left, 0 means a flat surface.
            Biconvex = R1 positive, R2 negative.
          </p>
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Light source</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Source
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as Source)}
                style={styles.select}
              >
                <option value="parallel">Parallel beam (distant source)</option>
                <option value="point">Point source</option>
              </select>
            </label>

            <label style={styles.label}>
              Rays: {rayCount}
              <input
                type="range"
                min="1"
                max="21"
                step="1"
                value={rayCount}
                onChange={(e) => setRayCount(Number(e.target.value))}
              />
            </label>

            {source === "point" && (
              <>
                <label style={styles.label}>
                  Source distance: {objectDistance}
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
                  Source height: {sourceHeight.toFixed(1)}
                  <input
                    type="range"
                    min="-8"
                    max="8"
                    step="0.5"
                    value={sourceHeight}
                    onChange={(e) => setSourceHeight(Number(e.target.value))}
                  />
                </label>
              </>
            )}
          </div>

          {loading && <p>Updating simulation...</p>}
          {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Ray diagram</h2>
          <canvas role="img" aria-label="Ray diagram for the exact lens"
            ref={canvasRef}
            width={1200}
            height={650}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              border: "1px solid #e5e5e5",
              borderRadius: 8,
            }}
          />
        </section>

        {data && (
          <>
            <section style={styles.results}>
              <ResultCard title="Lens shape" value={data.shape} />
              <ResultCard
                title="Behaviour"
                value={
                  data.focal_length === null
                    ? "No power"
                    : data.converging
                    ? "Converging"
                    : "Diverging"
                }
              />
              <ResultCard
                title="Focal length (thick lens)"
                value={fmt(data.focal_length)}
              />
              <ResultCard
                title="Focal length (thin lens-maker)"
                value={fmt(data.focal_length_thin)}
              />
              <ResultCard
                title="Back focal distance"
                value={fmt(data.back_focal_distance)}
              />
              <ResultCard title="Aperture used" value={fmt(data.aperture)} />
              <ResultCard
                title="Blur height at paraxial plane"
                value={fmt(data.blur_height)}
              />
              <ResultCard
                title="Longitudinal aberration"
                value={fmt(data.longitudinal_aberration)}
              />
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Traced rays</h2>

              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Ray</th>
                      <th style={styles.th}>Entry height</th>
                      <th style={styles.th}>Crosses axis at x</th>
                      <th style={styles.th}>Height at paraxial plane</th>
                      <th style={styles.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.rays]
                      .sort((a, b) => a.entry_height - b.entry_height)
                      .map((ray) => (
                        <tr key={ray.index}>
                          <td style={styles.td}>
                            <span
                              style={{
                                color: ray.ok ? rayColor(data, ray) : "var(--text-muted)",
                                fontWeight: "bold",
                              }}
                            >
                              #{ray.index + 1}
                            </span>
                          </td>
                          <td style={styles.td}>{fmt(ray.entry_height)}</td>
                          <td style={styles.td}>{fmt(ray.axis_crossing_x)}</td>
                          <td style={styles.td}>{fmt(ray.y_at_image_plane)}</td>
                          <td style={styles.td}>{ray.status}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Physics</h2>
              <p>
                Snell&apos;s law at each surface: n₁ sin θ₁ = n₂ sin θ₂. The ray
                enters at the front surface (air to glass) and leaves at the
                back surface (glass to air).
              </p>
              <p>
                Lens-maker (thin lens): 1/f = (n − 1)(1/R₁ − 1/R₂)
              </p>
              <p>
                Thick lens: 1/f = (n − 1)[1/R₁ − 1/R₂ + (n − 1)t / (n R₁ R₂)]
              </p>
              <p>
                <strong>Exact versus paraxial:</strong> the green marks show
                the paraxial prediction. Rays close to the axis (blue) land on
                it, while rays far from the axis (orange) are bent too strongly
                and cross the axis early. That gap is spherical aberration.
                Shrink the aperture and the blur shrinks with it. For a
                plano-convex lens, compare the two presets: the curved side
                facing the beam gives the smaller blur.
              </p>
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
    border: "1px solid #ddd",
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
    marginBottom: 14,
  },
  label: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    fontWeight: 500,
  },
  select: {
    padding: 10,
    border: "1px solid #bbb",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--text)",
  },
  results: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: 14,
    marginTop: 20,
  },
  card: {
    background: "var(--surface)",
    border: "1px solid #ddd",
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
    borderBottom: "2px solid #ddd",
    color: "var(--text-secondary)",
  },
  td: {
    padding: "8px 10px",
    borderBottom: "1px solid #eee",
    verticalAlign: "top",
  },
};
