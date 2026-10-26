"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { API_BASE } from "@/lib/config";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme, tcol, themedColor, canvasFont } from "@/lib/canvasTheme";

// ============================================================
// TYPES
// ============================================================

type Point = [number, number];
type LensType = "convex" | "concave";

// Textbook principal ray, built by the backend (thin-lens construction).
type LensRay = {
  name: string;
  type: string; // "parallel" | "central" | "focal"
  description: string;
  incident: Point[];
  incident_extension: Point[] | null;
  refracted: Point[];
  backward_extension: Point[] | null;
  hit_point: Point;
};

type LensResult = {
  valid: boolean;
  lens_type: LensType;
  focal_length: number; // signed: + convex, - concave
  object_distance: number;
  object_height: number;
  image_distance: number | null;
  signed_image_distance: number | null;
  image_height: number | null;
  magnification: number | null;
  image_type: string;
  orientation: string;
  size: string;
  object_position: string;
  image_position: string;
  image_at_infinity: boolean;
  object_point: Point;
  object_base: Point;
  image_point: Point | null;
  image_base: Point | null;
  focus_1: Point;
  focus_2: Point;
  principal_rays: LensRay[];
};

const RAY_COLORS: Record<string, string> = {
  parallel: "#e67e00",
  central: "#7c3aed",
  focal: "#16a34a",
};

// ============================================================
// VIEW
// ============================================================

function getView(result: LensResult) {
  const f = Math.abs(result.focal_length);
  const imageX = result.signed_image_distance ?? 0;
  const imageY = result.image_height ?? 0;

  const wantX = Math.max(
    result.object_distance + 8,
    Math.abs(imageX) + 8,
    2 * f + 6,
    24
  );

  const wantY = Math.max(
    result.object_height + 5,
    Math.abs(imageY) + 5,
    12
  );

  // Cap the view so an image near infinity does not shrink the diagram.
  const extentX = Math.min(wantX, 90);
  const extentY = Math.min(wantY, 45);

  return {
    extentX,
    extentY,
    imageOutOfView: wantX > extentX || wantY > extentY,
  };
}

// ============================================================
// CANVAS DRAWING
// ============================================================

type MapFn = (p: Point) => Point;

function drawDiagram(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  result: LensResult
) {
  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = tcol("#fff");
  ctx.fillRect(0, 0, width, height);

  const { extentX, extentY, imageOutOfView } = getView(result);

  const scale = Math.min(
    (width - 100) / (2 * extentX),
    (height - 100) / (2 * extentY)
  );

  const map: MapFn = (p) => [
    width / 2 + p[0] * scale,
    height / 2 - p[1] * scale,
  ];

  drawGrid(ctx, width, height, scale, extentX, extentY);

  // Principal axis
  drawPolyline(
    ctx,
    map,
    [
      [-extentX, 0],
      [extentX, 0],
    ],
    tcol("#555"),
    1.5,
    false
  );

  drawLens(ctx, map, result, extentY);

  // Optical centre and focal points (F and 2F on both sides)
  const f = result.focal_length;
  drawReference(ctx, map, "P", 0);
  drawReference(ctx, map, "F1", result.focus_1[0]);
  drawReference(ctx, map, "F2", result.focus_2[0]);
  drawReference(ctx, map, "2F1", -2 * f);
  drawReference(ctx, map, "2F2", 2 * f);

  // Object
  drawArrow(
    ctx,
    map,
    result.object_base,
    result.object_point,
    tcol("#111"),
    false,
    "Object"
  );

  drawRays(ctx, map, result);

  // Image calculated with the thin-lens equation
  if (result.image_point && result.image_base) {
    drawArrow(
      ctx,
      map,
      result.image_base,
      result.image_point,
      tcol("#222"),
      result.image_type === "Virtual",
      "Image"
    );
  }

  ctx.fillStyle = tcol("#b45309");
  ctx.font = canvasFont(13, "sans", 400);

  if (result.image_at_infinity) {
    ctx.fillText(
      "Object at F: refracted rays are parallel, so the image is at infinity.",
      20,
      height - 16
    );
  } else if (imageOutOfView) {
    ctx.fillText(
      "The image lies partly outside this view (see the numbers below).",
      20,
      height - 16
    );
  }

  drawLegend(ctx, result);
}

function drawRays(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  result: LensResult
) {
  for (const ray of result.principal_rays) {
    const color = tcol(RAY_COLORS[ray.type] ?? "#1671d9");

    drawPolyline(ctx, map, ray.incident, color, 2.2, false);

    if (ray.incident_extension) {
      drawPolyline(ctx, map, ray.incident_extension, color, 1.6, true);
    }

    drawPolyline(ctx, map, ray.refracted, color, 2.5, false);

    if (ray.backward_extension) {
      drawPolyline(ctx, map, ray.backward_extension, tcol("#777"), 1.6, true);
    }

    drawDirectionArrow(ctx, map, ray.incident[0], ray.incident[1], color, 30);
    drawDirectionArrow(ctx, map, ray.refracted[0], ray.refracted[1], color, 12);
    drawHitDot(ctx, map, ray.hit_point);
  }
}

// Standard lens symbol: a vertical line with arrowheads.
//   Convex  -> arrowheads point outwards.
//   Concave -> arrowheads point inwards.
function drawLens(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  result: LensResult,
  extentY: number
) {
  const half = extentY * 0.92;
  const top = map([0, half]);
  const bottom = map([0, -half]);
  const convex = result.lens_type === "convex";

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(top[0], top[1]);
  ctx.lineTo(bottom[0], bottom[1]);
  ctx.strokeStyle = tcol("#0e7490");
  ctx.lineWidth = 4;
  ctx.stroke();

  const size = 14;

  // Arrowhead at the top end; direction depends on lens type.
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
    head(top, true); // top arrow points up
    head(bottom, false); // bottom arrow points down
  } else {
    // Inward arrows: the tip sits just inside the end of the line.
    head([top[0], top[1] + size], false);
    head([bottom[0], bottom[1] - size], true);
  }

  ctx.fillStyle = tcol("#0e7490");
  ctx.font = canvasFont(15, "sans", 700);
  ctx.fillText(
    convex ? "Convex lens" : "Concave lens",
    top[0] + 14,
    top[1] + 22
  );

  ctx.restore();
}

function drawHitDot(ctx: CanvasRenderingContext2D, map: MapFn, p: Point) {
  const c = map(p);
  ctx.beginPath();
  ctx.arc(c[0], c[1], 4.5, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#e11d48");
  ctx.fill();
}

// Small triangle that shows which way a ray travels.
function drawDirectionArrow(
  ctx: CanvasRenderingContext2D,
  map: MapFn,
  from: Point,
  to: Point,
  color: string,
  maxWorldDistance: number
) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (length < 1e-9) return;

  const fraction = Math.min(0.5, maxWorldDistance / length);
  const middle: Point = [
    from[0] + (to[0] - from[0]) * fraction,
    from[1] + (to[1] - from[1]) * fraction,
  ];

  const a = map(from);
  const b = map(to);
  const m = map(middle);

  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 40) return;

  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const size = 10;
  const tip: [number, number] = [
    m[0] + 5 * Math.cos(angle),
    m[1] + 5 * Math.sin(angle),
  ];

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
  scale: number,
  extentX: number,
  extentY: number
) {
  const step = scale > 28 ? 1 : scale > 14 ? 2 : 5;

  ctx.strokeStyle = tcol("#eee");
  ctx.lineWidth = 1;

  // Start on a multiple of `step` so grid lines pass through x = 0, y = 0.
  for (let x = Math.ceil(-extentX / step) * step; x <= extentX; x += step) {
    const px = width / 2 + x * scale;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
  }

  for (let y = Math.ceil(-extentY / step) * step; y <= extentY; y += step) {
    const py = height / 2 - y * scale;
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

  ctx.font = canvasFont(14, "sans", 700);
  ctx.fillText(name, p[0] - 8, p[1] + 20);
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
  ctx.font = canvasFont(14, "sans", 700);
  ctx.fillText(label, b[0] + 7, b[1] - 8);
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
  ctx.setLineDash(dashed ? [7, 5] : []);
  ctx.stroke();
  ctx.restore();
}

function drawLegend(ctx: CanvasRenderingContext2D, result: LensResult) {
  const entries = result.principal_rays.map((ray) => ({
    color: tcol(RAY_COLORS[ray.type] ?? "#1671d9"),
    label: ray.name,
  }));

  const rowHeight = 20;
  const boxHeight = 62 + entries.length * rowHeight + 2 * rowHeight;
  const boxWidth = 270;

  ctx.save();
  ctx.fillStyle = tcol("rgba(255,255,255,0.95)");
  ctx.strokeStyle = tcol("#ddd");
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(16, 16, boxWidth, boxHeight, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = tcol("#111");
  ctx.font = canvasFont(13, "sans", 700);
  ctx.fillText("Thin-lens (paraxial) rays", 28, 38);

  ctx.fillStyle = tcol("#666");
  ctx.font = canvasFont(12, "sans", 400);
  ctx.fillText("Rays bend at the plane x = 0", 28, 56);

  let y = 80;

  for (const entry of entries) {
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(56, y);
    ctx.strokeStyle = entry.color;
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.stroke();

    ctx.fillStyle = tcol("#222");
    ctx.font = canvasFont(12, "sans", 400);
    ctx.fillText(entry.label, 64, y + 4);
    y += rowHeight;
  }

  ctx.beginPath();
  ctx.moveTo(28, y);
  ctx.lineTo(56, y);
  ctx.strokeStyle = tcol("#777");
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = tcol("#222");
  ctx.fillText("Backward extension (virtual)", 64, y + 4);
  y += rowHeight;

  ctx.beginPath();
  ctx.arc(42, y, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#e11d48");
  ctx.fill();
  ctx.fillStyle = tcol("#222");
  ctx.fillText("Bending point (lens plane)", 64, y + 4);

  ctx.restore();
}

function fmt(value: number | null | undefined) {
  if (value == null) return "—";
  if (!Number.isFinite(value)) return "∞";
  return Number(value.toFixed(2)).toString();
}

// ============================================================
// PAGE COMPONENT
// ============================================================

export default function LensImagePage() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [lensType, setLensType] = useState<LensType>("convex");
  const [focalLength, setFocalLength] = useState(10);
  const [objectDistance, setObjectDistance] = useState(30);
  const [objectHeight, setObjectHeight] = useState(5);

  const [data, setData] = useState<LensResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function simulate() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `${API_BASE}/simulate/lens-image`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lens_type: lensType,
              focal_length: focalLength,
              object_distance: objectDistance,
              object_height: objectHeight,
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

        const result: LensResult = await response.json();

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
  }, [lensType, focalLength, objectDistance, objectHeight]);

  useEffect(() => {
    setCanvasTheme(theme);
    if (!data || !canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    drawDiagram(ctx, canvasRef.current, data);
  }, [data, theme]);

  return (
    <main style={styles.page}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(1.625rem, 1.2rem + 1.4vw, 2.125rem)", fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 8, color: "var(--text)" }}>
          Thin Lens — Image Formation
        </h1>

        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          Convex and concave lenses with the standard principal-ray
          construction.
        </p>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Controls</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Lens type
              <select
                value={lensType}
                onChange={(e) => setLensType(e.target.value as LensType)}
                style={styles.select}
              >
                <option value="convex">Convex (converging)</option>
                <option value="concave">Concave (diverging)</option>
              </select>
            </label>

            <label style={styles.label}>
              Focal length: {focalLength}
              <input
                type="range"
                min="3"
                max="20"
                step="1"
                value={focalLength}
                onChange={(e) => setFocalLength(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Object distance: {objectDistance}
              <input
                type="range"
                min="2"
                max="60"
                step="1"
                value={objectDistance}
                onChange={(e) => setObjectDistance(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Object height: {objectHeight}
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={objectHeight}
                onChange={(e) => setObjectHeight(Number(e.target.value))}
              />
            </label>
          </div>

          {loading && <p>Updating simulation...</p>}
          {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Ray diagram</h2>
          <canvas role="img" aria-label="Ray diagram for thin lens image formation"
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
              <ResultCard title="Image type" value={data.image_type} />
              <ResultCard title="Orientation" value={data.orientation} />
              <ResultCard title="Size" value={data.size} />
              <ResultCard
                title="Image distance"
                value={fmt(data.image_distance)}
              />
              <ResultCard
                title="Image height"
                value={fmt(data.image_height)}
              />
              <ResultCard
                title="Magnification"
                value={fmt(data.magnification)}
              />
              <ResultCard title="Object position" value={data.object_position} />
              <ResultCard title="Image position" value={data.image_position} />
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Principal rays</h2>

              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ray</th>
                    <th style={styles.th}>Construction</th>
                    <th style={styles.th}>Bending point (x, y)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.principal_rays.map((ray) => (
                    <tr key={ray.type}>
                      <td style={styles.td}>
                        <span
                          style={{
                            color: themedColor(theme, RAY_COLORS[ray.type] ?? "#1671d9"),
                            fontWeight: "bold",
                          }}
                        >
                          {ray.name}
                        </span>
                      </td>
                      <td style={styles.td}>{ray.description}</td>
                      <td style={styles.td}>
                        ({fmt(ray.hit_point[0])}, {fmt(ray.hit_point[1])})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Physics</h2>
              <p>Thin-lens formula: 1/v − 1/u = 1/f</p>
              <p>Magnification: m = hᵢ/hₒ = v/u</p>
              <p>
                Signed focal length: {fmt(data.focal_length)} (positive for a
                convex lens, negative for a concave lens)
              </p>
              <p>
                Signed image distance: {fmt(data.signed_image_distance)}{" "}
                (positive = real image on the far side of the lens, negative =
                virtual image on the same side as the object)
              </p>
              <p>
                <strong>Model:</strong> this page uses the thin-lens, paraxial
                approximation. Every ray is drawn bending at the single plane
                x = 0, which is why all refracted rays (or their dashed
                extensions) pass through the image tip given by the lens
                formula. It is a schematic construction, not a trace through
                the curved glass surfaces.
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
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 24,
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
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
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
