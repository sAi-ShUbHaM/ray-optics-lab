"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "../components/ThemeProvider";
import { ActionButton } from "./parts";
import { API_BASE } from "@/lib/config";
import { canvasFont, setCanvasTheme, tcol } from "@/lib/canvasTheme";
import { drawVectorOverlay, arrowHead } from "./overlay";
import { VectorPanel } from "./VectorPanel";
import { computeReflectionVectors, fmt, type Vec } from "./vectors";

type Point = [number, number];

type ReflectionResult = {
  hit: boolean;
  incident_ray?: { start: Point; end: Point };
  reflected_ray?: { start: Point; end: Point };
  hit_point?: Point;
  reflected_direction?: Point;
  message?: string;
};

type Params = { rayAngle: number; mirrorAngle: number; rayLength: number };

const DEFAULTS: Params = { rayAngle: 30, mirrorAngle: 0, rayLength: 6 };

async function fetchReflection(
  params: Params,
  signal: AbortSignal,
): Promise<ReflectionResult> {
  const response = await fetch(`${API_BASE}/simulate/reflection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ray_angle: params.rayAngle,
      mirror_angle: params.mirrorAngle,
      ray_length: params.rayLength,
    }),
    signal,
  });
  if (!response.ok) throw new Error(`Backend returned ${response.status}`);
  return response.json();
}

// ------------------------------------------------------------------
// Canvas
// ------------------------------------------------------------------

const SCALE = 55; // pixels per physics unit

function drawScene(
  canvas: HTMLCanvasElement,
  data: ReflectionResult,
  params: Params,
  showVectors: boolean,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = tcol("#f8fafc");
  ctx.fillRect(0, 0, width, height);

  // Physics: +x right, +y up. Canvas: +x right, +y down.
  const toCanvas = (p: Point): Point => [
    width / 2 + p[0] * SCALE,
    height / 2 - p[1] * SCALE,
  ];

  // ----- mirror -----
  const mirrorRad = (params.mirrorAngle * Math.PI) / 180;
  const mirrorHalfLength = 5;
  const mirrorDir: Point = [Math.cos(mirrorRad), Math.sin(mirrorRad)];
  const mirrorStart = toCanvas([
    -mirrorDir[0] * mirrorHalfLength,
    -mirrorDir[1] * mirrorHalfLength,
  ]);
  const mirrorEnd = toCanvas([
    mirrorDir[0] * mirrorHalfLength,
    mirrorDir[1] * mirrorHalfLength,
  ]);

  ctx.beginPath();
  ctx.moveTo(mirrorStart[0], mirrorStart[1]);
  ctx.lineTo(mirrorEnd[0], mirrorEnd[1]);
  ctx.strokeStyle = tcol("#111827");
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.stroke();

  // ----- normal (dashed, both sides of the mirror) -----
  const normalDir: Point = [-Math.sin(mirrorRad), Math.cos(mirrorRad)];
  const normalLength = 2.2;
  const normalEnd = toCanvas([
    normalDir[0] * normalLength,
    normalDir[1] * normalLength,
  ]);
  const normalBack = toCanvas([
    -normalDir[0] * normalLength,
    -normalDir[1] * normalLength,
  ]);
  ctx.beginPath();
  ctx.moveTo(normalBack[0], normalBack[1]);
  ctx.lineTo(normalEnd[0], normalEnd[1]);
  ctx.strokeStyle = tcol("#64748b");
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  const labelFont = canvasFont(16, "sans", 500);

  if (!data.hit || !data.incident_ray || !data.reflected_ray || !data.hit_point) {
    ctx.fillStyle = tcol("#dc2626");
    ctx.font = canvasFont(18, "sans", 500);
    ctx.textAlign = "center";
    ctx.fillText(
      data.message ?? "The ray does not reach the mirror.",
      width / 2,
      height - 40,
    );
    ctx.textAlign = "left";
    return;
  }

  const incidentStart = toCanvas(data.incident_ray.start);
  const incidentEnd = toCanvas(data.incident_ray.end);
  const reflectedStart = toCanvas(data.reflected_ray.start);
  const reflectedEnd = toCanvas(data.reflected_ray.end);
  const hitPoint = toCanvas(data.hit_point);

  // ----- incident ray -----
  ctx.beginPath();
  ctx.moveTo(incidentStart[0], incidentStart[1]);
  ctx.lineTo(incidentEnd[0], incidentEnd[1]);
  ctx.strokeStyle = tcol("#2563eb");
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.stroke();

  // ----- reflected ray -----
  ctx.beginPath();
  ctx.moveTo(reflectedStart[0], reflectedStart[1]);
  ctx.lineTo(reflectedEnd[0], reflectedEnd[1]);
  ctx.strokeStyle = tcol("#dc2626");
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.stroke();

  // direction arrows halfway along each ray
  const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const incMid = mid(data.incident_ray.start, data.incident_ray.end);
  const refMid = mid(data.reflected_ray.start, data.reflected_ray.end);
  const incDir: Vec = [
    data.incident_ray.end[0] - data.incident_ray.start[0],
    data.incident_ray.end[1] - data.incident_ray.start[1],
  ];
  const refDir: Vec = [
    data.reflected_ray.end[0] - data.reflected_ray.start[0],
    data.reflected_ray.end[1] - data.reflected_ray.start[1],
  ];
  arrowHead(ctx, toCanvas(incMid), incDir, tcol("#2563eb"), 17);
  arrowHead(ctx, toCanvas(refMid), refDir, tcol("#dc2626"), 17);

  // ----- hit point -----
  ctx.beginPath();
  ctx.arc(hitPoint[0], hitPoint[1], 7, 0, Math.PI * 2);
  ctx.fillStyle = tcol("#111827");
  ctx.fill();

  // ----- labels -----
  ctx.font = labelFont;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = tcol("#111827");
  ctx.fillText("Mirror", mirrorEnd[0] - 60, mirrorEnd[1] + 25);
  ctx.fillText("Normal", normalEnd[0] + 10, normalEnd[1]);

  ctx.fillStyle = tcol("#2563eb");
  ctx.fillText("Incident ray", incidentStart[0] + 10, incidentStart[1] - 10);
  ctx.fillStyle = tcol("#dc2626");
  ctx.fillText("Reflected ray", reflectedEnd[0] - 120, reflectedEnd[1] - 10);

  // ----- angle readout -----
  ctx.fillStyle = tcol("#111827");
  ctx.font = canvasFont(15, "mono", 400);
  ctx.fillText(`α  ray angle     ${fmt(params.rayAngle, 0)}°`, 30, 35);
  ctx.fillText(`β  mirror angle  ${fmt(params.mirrorAngle, 0)}°`, 30, 60);

  if (showVectors) {
    drawVectorOverlay(
      ctx,
      toCanvas,
      data.hit_point,
      computeReflectionVectors(params.rayAngle, params.mirrorAngle),
    );
  }
}

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

function Slider({
  id,
  label,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-[0.9375rem] font-medium text-fg">
          {label}
        </label>
        <span className="font-mono text-[0.875rem] tabular-nums text-fg">
          {value}
          <span className="text-fg-muted">{unit}</span>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full"
      />
    </div>
  );
}

export default function ReflectionPage() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [rayAngle, setRayAngle] = useState(DEFAULTS.rayAngle);
  const [mirrorAngle, setMirrorAngle] = useState(DEFAULTS.mirrorAngle);
  const [rayLength, setRayLength] = useState(DEFAULTS.rayLength);
  const [showVectors, setShowVectors] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // The result is stored with the exact parameters that produced it, so the
  // diagram and the vector panel always describe the same simulation.
  const [run, setRun] = useState<{ result: ReflectionResult; params: Params } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params: Params = { rayAngle, mirrorAngle, rayLength };

    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchReflection(params, controller.signal);
        if (!controller.signal.aborted) setRun({ result, params });
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Could not connect to backend:", err);
        setError(`Could not reach the simulation backend at ${API_BASE}.`);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rayAngle, mirrorAngle, rayLength, reloadKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !run) return;
    setCanvasTheme(theme);
    drawScene(canvas, run.result, run.params, showVectors);
  }, [run, showVectors, theme]);

  function reset() {
    setRayAngle(DEFAULTS.rayAngle);
    setMirrorAngle(DEFAULTS.mirrorAngle);
    setRayLength(DEFAULTS.rayLength);
  }

  const vectors =
    run?.result.hit
      ? computeReflectionVectors(run.params.rayAngle, run.params.mirrorAngle)
      : null;

  return (
    <main className="px-4 py-7 sm:px-8">
      <div className="mx-auto w-full max-w-[1400px]">
        <h1 className="text-[length:var(--text-h1)] font-medium text-fg">Reflection</h1>
        <p className="mt-2 max-w-[62ch] text-fg-secondary">
          Reflect a ray from a plane mirror and follow the vector calculation
          behind it: incident direction, mirror normal and reflected direction.
        </p>

        <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
          <section
            aria-label="Ray diagram"
            className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-[var(--diagram-bg)] xl:sticky xl:top-20"
          >
            <canvas
              ref={canvasRef}
              width={1000}
              height={600}
              role="img"
              aria-label={`Ray diagram: incident ray at ${rayAngle} degrees, mirror at ${mirrorAngle} degrees`}
              className="block h-auto w-full"
            />
          </section>

          <div className="flex flex-col gap-6">
            <section
              aria-labelledby="controls-title"
              className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6"
            >
              <h2
                id="controls-title"
                className="font-mono text-[var(--text-label)] font-normal uppercase tracking-[0.12em] text-fg-muted"
              >
                Controls
              </h2>

              <div className="mt-4 flex flex-col gap-5">
                <Slider
                  id="ray-angle"
                  label="Ray angle α"
                  value={rayAngle}
                  unit="°"
                  min={-90}
                  max={90}
                  onChange={setRayAngle}
                />
                <Slider
                  id="mirror-angle"
                  label="Mirror angle β"
                  value={mirrorAngle}
                  unit="°"
                  min={-90}
                  max={90}
                  onChange={setMirrorAngle}
                />
                <Slider
                  id="ray-length"
                  label="Ray length"
                  value={rayLength}
                  unit=""
                  min={2}
                  max={8}
                  step={0.5}
                  onChange={setRayLength}
                />

                <label className="flex items-center gap-3 text-[0.9375rem] text-fg">
                  <input
                    type="checkbox"
                    checked={showVectors}
                    onChange={(e) => setShowVectors(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Show vectors and angles on the diagram
                </label>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <ActionButton onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
                  {loading ? "Simulating…" : "Simulate"}
                </ActionButton>
                <ActionButton variant="ghost" onClick={reset}>
                  Reset
                </ActionButton>
              </div>

              {error ? (
                <p role="alert" className="mt-4 text-[var(--text-small)] text-error">
                  {error}
                </p>
              ) : null}
            </section>

            {run ? (
              <VectorPanel
                vectors={vectors}
                backendReflected={run.result.reflected_direction}
                message={run.result.message}
              />
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
