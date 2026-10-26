"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { API_BASE } from "@/lib/config";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme, tcol, canvasFont } from "@/lib/canvasTheme";

// ============================================================
// TYPES
// ============================================================

type Point = [number, number];
type LensKind = "convex" | "concave";

type LensSetting = { type: LensKind; f: number };

type Stage = {
  lens: number;
  lens_x: number;
  focal_length: number;
  object_x: number | null;
  object_height: number | null;
  object_distance_signed: number | null;
  object_kind: string; // "Real object" | "Virtual object" | "At infinity"
  image_at_infinity: boolean;
  image_x: number | null;
  image_height: number | null;
  image_distance_signed: number | null;
  magnification: number | null;
  image_kind: string; // "Real" | "Virtual" | "At infinity"
};

type SystemRay = {
  name: string;
  type: string; // "parallel" | "central" | "focal"
  description: string;
  points: Point[];
  extensions: Point[][]; // dashed segments, each [from, to]
};

type SystemResult = {
  valid: boolean;
  lenses: { index: number; lens_type: LensKind; focal_length: number; x: number }[];
  separations: number[];
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
  image_point: Point | null;
  image_base: Point | null;
  total_magnification: number | null;
  system_power: number;
  system_focal_length: number | null;
  back_focal_x: number | null;
  front_focal_x: number | null;
  afocal: boolean;
  x_end: number;
  rays: SystemRay[];
};

type Preset = {
  label: string;
  lenses: LensSetting[];
  separations: number[];
  objectDistance: number;
  objectHeight: number;
};

const RAY_COLORS: Record<string, string> = {
  parallel: "#e67e00",
  central: "#7c3aed",
  focal: "#16a34a",
};

const PRESETS: Preset[] = [
  {
    label: "Two convex lenses (real image)",
    lenses: [
      { type: "convex", f: 10 },
      { type: "convex", f: 10 },
      { type: "convex", f: 10 },
    ],
    separations: [45, 20],
    objectDistance: 15,
    objectHeight: 3,
  },
  {
    label: "Compound microscope-like",
    lenses: [
      { type: "convex", f: 6 },
      { type: "convex", f: 20 },
      { type: "convex", f: 10 },
    ],
    separations: [40, 20],
    objectDistance: 7.5,
    objectHeight: 2,
  },
  {
    label: "Convex then concave",
    lenses: [
      { type: "convex", f: 10 },
      { type: "concave", f: 15 },
      { type: "convex", f: 10 },
    ],
    separations: [6, 20],
    objectDistance: 25,
    objectHeight: 3,
  },
  {
    label: "Telescope-like pair (afocal)",
    lenses: [
      { type: "convex", f: 20 },
      { type: "convex", f: 5 },
      { type: "convex", f: 10 },
    ],
    separations: [25, 20],
    objectDistance: 60,
    objectHeight: 3,
  },
  {
    label: "Lenses in contact",
    lenses: [
      { type: "convex", f: 20 },
      { type: "convex", f: 30 },
      { type: "convex", f: 10 },
    ],
    separations: [0, 20],
    objectDistance: 60,
    objectHeight: 4,
  },
];

// ============================================================
// VIEW + DRAWING
// ============================================================

type MapFn = (p: Point) => Point;

const LEGEND_BAND = 52; // pixels reserved at the top for the legend strip

function getView(result: SystemResult, width: number, height: number) {
  const lastX = result.lenses[result.lenses.length - 1].x;

  const left = Math.max(result.object_distance + 4, 14);
  const right = Math.max(result.x_end + 4, lastX + 14);

  let maxY = result.object_height;
  for (const stage of result.stages) {
    if (stage.image_height !== null) {
      maxY = Math.max(maxY, Math.abs(stage.image_height));
    }
  }

  const extentY = Math.min(Math.max(maxY + 5, 10), 40);

  // The top band of the canvas is reserved for the legend strip.
  const scale = Math.min(
    (width - 80) / (left + right),
    (height - LEGEND_BAND - 50) / (2 * extentY)
  );

  const centerY = LEGEND_BAND + (height - LEGEND_BAND) / 2;

  const map: MapFn = (p) => [
    40 + (left + p[0]) * scale,
    centerY - p[1] * scale,
  ];

  return { left, right, extentY, scale, map };
}

function drawDiagram(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: SystemResult
) {
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, width, height);

  const { left, right, extentY, scale, map } = getView(result, width, height);

  drawGrid(ctx, width, height, scale, map, left, right, extentY);

  drawPolyline(
    ctx,
    map,
    [
      [-left, 0],
      [right, 0],
    ],
    tcol("#555"),
    1.5,
    false
  );

  // Lenses and their focal points
  const half = extentY * 0.88;
  result.lenses.forEach((lens, i) => {
    drawLens(ctx, map, lens.x, half, lens.lens_type === "convex");

    const sameAsPrevious = i > 0 && Math.abs(lens.x - result.lenses[i - 1].x) < 1e-9;
    const f = lens.focal_length;

    const labelPoint = map([lens.x, half]);
    ctx.save();
    ctx.fillStyle = tcol("#0e7490");
    ctx.font = canvasFont(13, "sans", 700);
    ctx.textAlign = "center";
    drawHaloText(
      ctx,
      `L${lens.index} (f = ${f > 0 ? "+" : ""}${fmt(f)})`,
      labelPoint[0],
      labelPoint[1] - 12 - (sameAsPrevious ? 16 : 0),
      tcol("#0e7490")
    );
    ctx.restore();

    drawFocalPoint(ctx, map, lens.x - f, `F${lens.index}`);
    drawFocalPoint(ctx, map, lens.x + f, `F${lens.index}'`);
  });

  // Object
  drawArrow(ctx, map, result.object_base, result.object_point, tcol("#111"), false, "Object");

  // Rays
  for (const ray of result.rays) {
    const color = tcol(RAY_COLORS[ray.type] ?? "#1671d9");

    drawPolyline(ctx, map, ray.points, color, 2.1, false);

    for (const segment of ray.extensions) {
      drawPolyline(ctx, map, segment, tcol("#888"), 1.4, true);
    }

    // dots where the ray crosses a lens
    for (const p of ray.points.slice(1, -1)) {
      drawHitDot(ctx, map, p, color);
    }
  }

  // Images formed by each stage
  result.stages.forEach((stage, i) => {
    if (stage.image_at_infinity || stage.image_x === null || stage.image_height === null) {
      return;
    }

    const isFinal = i === result.stages.length - 1;
    const virtual = stage.image_kind === "Virtual";

    drawArrow(
      ctx,
      map,
      [stage.image_x, 0],
      [stage.image_x, stage.image_height],
      isFinal ? tcol("#111") : tcol("#2563eb"),
      virtual,
      isFinal ? "Final image" : `Image ${i + 1}`
    );
  });

  // Notes at the bottom
  const notes: string[] = [];
  if (result.image_at_infinity) {
    notes.push("The final image is at infinity: the rays leave the system parallel.");
  }
  if (result.afocal) {
    notes.push("This combination is afocal (zero net power): it has no focal length.");
  }

  ctx.fillStyle = tcol("#b45309");
  ctx.font = canvasFont(13, "sans", 400);
  ctx.textAlign = "left";
  notes.forEach((text, i) => {
    ctx.fillText(text, 20, height - 14 - (notes.length - 1 - i) * 18);
  });

  drawLegend(ctx, result);
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
  label: string
) {
  const p = map([x, 0]);

  ctx.beginPath();
  ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#555");
  ctx.fill();

  ctx.save();
  ctx.font = canvasFont(11, "sans", 400);
  ctx.textAlign = "center";
  drawHaloText(ctx, label, p[0], p[1] + 16, tcol("#555"));
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

function drawHitDot(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  p: Point,
  color: string
) {
  const c = map(p);
  ctx.beginPath();
  ctx.arc(c[0], c[1], 3.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
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
  ctx.font = canvasFont(13, "sans", 700);
  drawHaloText(ctx, label, b[0] + 7, b[1] - (b[1] > a[1] ? -16 : 8), color);
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

function drawLegend(ctx: CanvasRenderingContext2D, result: SystemResult) {
  type Item = { label: string; color: string; dashed: boolean };

  const items: Item[] = [
    ...result.rays.map((ray) => ({
      label: ray.name,
      color: tcol(RAY_COLORS[ray.type] ?? "#1671d9"),
      dashed: false,
    })),
    { label: "Extension (virtual image/object)", color: tcol("#888"), dashed: true },
    { label: "Intermediate image (dashed = virtual)", color: tcol("#2563eb"), dashed: false },
  ];

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
  ctx.font = canvasFont(13, "sans", 700);
  ctx.fillStyle = tcol("#111");
  ctx.fillText("Thin-lens combination (paraxial rays)", 26, 24);

  ctx.font = canvasFont(12, "sans", 400);
  ctx.fillStyle = tcol("#666");
  ctx.fillText("Each image becomes the next object", 26, 42);

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
    ctx.font = canvasFont(12, "sans", 400);
    ctx.fillText(item.label, x + 33, y + 4);
    x += 33 + ctx.measureText(item.label).width + 22;
  }

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

export default function LensCombinationPage() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [lensCount, setLensCount] = useState(2);
  const [lenses, setLenses] = useState<LensSetting[]>(PRESETS[0].lenses);
  const [separations, setSeparations] = useState<number[]>(PRESETS[0].separations);
  const [objectDistance, setObjectDistance] = useState(PRESETS[0].objectDistance);
  const [objectHeight, setObjectHeight] = useState(PRESETS[0].objectHeight);

  const [data, setData] = useState<SystemResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // One string that changes whenever any input changes.
  const payloadKey = useMemo(
    () =>
      JSON.stringify({
        lenses: lenses.slice(0, lensCount).map((l) => ({
          lens_type: l.type,
          focal_length: l.f,
        })),
        separations: separations.slice(0, lensCount - 1),
        object_distance: objectDistance,
        object_height: objectHeight,
      }),
    [lenses, separations, lensCount, objectDistance, objectHeight]
  );

  useEffect(() => {
    const controller = new AbortController();

    async function simulate() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_BASE}/simulate/lens-system`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payloadKey,
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

        const result: SystemResult = await response.json();

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
  }, [payloadKey]);

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

    setLenses(preset.lenses);
    setSeparations(preset.separations);
    setObjectDistance(preset.objectDistance);
    setObjectHeight(preset.objectHeight);
    setLensCount(2);
  }

  function updateLens(index: number, patch: Partial<LensSetting>) {
    setLenses((current) =>
      current.map((lens, i) => (i === index ? { ...lens, ...patch } : lens))
    );
  }

  function updateSeparation(index: number, value: number) {
    setSeparations((current) =>
      current.map((s, i) => (i === index ? value : s))
    );
  }

  return (
    <main style={styles.page}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(1.625rem, 1.2rem + 1.4vw, 2.125rem)", fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 8, color: "var(--text)" }}>
          Lens Combinations
        </h1>

        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          Place two or three thin lenses in a row. The image formed by each
          lens becomes the object for the next one, even when that image lies
          beyond the next lens (a virtual object).
        </p>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Setup</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Preset
              <select
                defaultValue=""
                onChange={(e) => applyPreset(e.target.value)}
                style={styles.select}
              >
                <option value="" disabled>
                  Choose a setup...
                </option>
                {PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Number of lenses
              <select
                value={lensCount}
                onChange={(e) => setLensCount(Number(e.target.value))}
                style={styles.select}
              >
                <option value={2}>2 lenses</option>
                <option value={3}>3 lenses</option>
              </select>
            </label>

            <label style={styles.label}>
              Object distance (to lens 1): {objectDistance}
              <input
                type="range"
                min="2"
                max="80"
                step="0.5"
                value={objectDistance}
                onChange={(e) => setObjectDistance(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Object height: {objectHeight}
              <input
                type="range"
                min="1"
                max="8"
                step="0.5"
                value={objectHeight}
                onChange={(e) => setObjectHeight(Number(e.target.value))}
              />
            </label>
          </div>

          <div style={styles.controls}>
            {Array.from({ length: lensCount }, (_, i) => (
              <div key={i} style={styles.lensBox}>
                <div style={{ fontWeight: "bold", marginBottom: 10 }}>
                  Lens {i + 1}
                </div>

                <label style={styles.label}>
                  Type
                  <select
                    value={lenses[i].type}
                    onChange={(e) =>
                      updateLens(i, { type: e.target.value as LensKind })
                    }
                    style={styles.select}
                  >
                    <option value="convex">Convex (converging)</option>
                    <option value="concave">Concave (diverging)</option>
                  </select>
                </label>

                <label style={{ ...styles.label, marginTop: 12 }}>
                  Focal length: {lenses[i].f}
                  <input
                    type="range"
                    min="3"
                    max="30"
                    step="1"
                    value={lenses[i].f}
                    onChange={(e) => updateLens(i, { f: Number(e.target.value) })}
                  />
                </label>

                {i < lensCount - 1 && (
                  <label style={{ ...styles.label, marginTop: 12 }}>
                    Gap to lens {i + 2}: {separations[i]}
                    <input
                      type="range"
                      min="0"
                      max="80"
                      step="0.5"
                      value={separations[i]}
                      onChange={(e) =>
                        updateSeparation(i, Number(e.target.value))
                      }
                    />
                  </label>
                )}
              </div>
            ))}
          </div>

          {loading && <p>Updating simulation...</p>}
          {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Ray diagram</h2>
          <canvas role="img" aria-label="Ray diagram for the lens combination"
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
              <ResultCard title="Final image" value={data.image_type} />
              <ResultCard title="Orientation" value={data.orientation} />
              <ResultCard title="Size" value={data.size} />
              <ResultCard
                title="Total magnification"
                value={fmt(data.total_magnification)}
              />
              <ResultCard title="Final image position" value={data.image_position} />
              <ResultCard
                title="System focal length"
                value={data.afocal ? "Afocal" : fmt(data.system_focal_length)}
              />
              <ResultCard title="System power (1/f)" value={fmt(data.system_power, 4)} />
              <ResultCard
                title="Back focal point (x)"
                value={fmt(data.back_focal_x)}
              />
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Stage by stage</h2>

              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Lens</th>
                      <th style={styles.th}>Object</th>
                      <th style={styles.th}>Object distance u</th>
                      <th style={styles.th}>Image</th>
                      <th style={styles.th}>Image distance v</th>
                      <th style={styles.th}>Magnification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.stages.map((stage) => (
                      <tr key={stage.lens}>
                        <td style={styles.td}>
                          L{stage.lens} (f = {fmt(stage.focal_length)})
                        </td>
                        <td style={styles.td}>{stage.object_kind}</td>
                        <td style={styles.td}>{fmt(stage.object_distance_signed)}</td>
                        <td style={styles.td}>{stage.image_kind}</td>
                        <td style={styles.td}>{fmt(stage.image_distance_signed)}</td>
                        <td style={styles.td}>{fmt(stage.magnification)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Physics</h2>
              <p>Each lens: 1/v − 1/u = 1/f, with distances measured from that lens.</p>
              <p>
                Negative u means a real object in front of the lens. If the
                previous image forms beyond the next lens, u is positive and
                the object is virtual: the lens receives converging light.
              </p>
              <p>Total magnification = m₁ × m₂ × (m₃).</p>
              <p>
                Two lenses separated by s: 1/f = 1/f₁ + 1/f₂ − s/(f₁f₂). In
                contact (s = 0) the powers simply add.
              </p>
              <p>
                <strong>Model:</strong> thin lenses and paraxial rays. Each
                lens bends a ray at a single plane, so there are no aberrations
                here. The exact two-surface lens is on the Exact Lens page.
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
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 24,
    marginBottom: 18,
  },
  lensBox: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: 16,
    background: "var(--surface)",
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
  results: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
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
