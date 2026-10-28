"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "../components/ThemeProvider";
import { API_BASE } from "@/lib/config";
import { setCanvasTheme } from "@/lib/canvasTheme";
import {
  FIBRE_CANVAS_WIDTH,
  SWEEP_CANVAS_SIZE,
  drawFibre,
  drawSweep,
  fibreCanvasHeight,
  type FibreResult,
} from "./drawing";

const API = `${API_BASE}/simulate/optical-fibre`;

const PRESETS = [
  { name: "Textbook", n1: 1.5, n2: 1.35, note: "Large index step: easy to see" },
  { name: "Telecom glass", n1: 1.48, n2: 1.46, note: "Tiny step: shallow zigzag" },
  { name: "High aperture", n1: 1.62, n2: 1.45, note: "Wide acceptance cone" },
  { name: "Plastic fibre", n1: 1.49, n2: 1.4, note: "Core and cladding plastics" },
  { name: "Core in air", n1: 1.5, n2: 1.0, note: "No cladding: every angle works" },
];

const WAVELENGTHS = [
  { label: "633 nm (red laser)", value: 633 },
  { label: "850 nm (short links)", value: 850 },
  { label: "1310 nm", value: 1310 },
  { label: "1550 nm (long distance)", value: 1550 },
];

/** A length in micrometres, written in the most natural unit. */
function size(um: number) {
  if (um >= 1000) return `${(um / 1000).toFixed(um >= 10000 ? 1 : 2)} mm`;
  if (um >= 10) return `${Math.round(um)} µm`;
  return `${um.toFixed(1)} µm`;
}

const LENGTHS = [
  { label: "1 m", value: 1 },
  { label: "10 m", value: 10 },
  { label: "100 m", value: 100 },
  { label: "1 km", value: 1000 },
  { label: "10 km", value: 10000 },
  { label: "100 km", value: 100000 },
];

function f(x: number | null | undefined, digits = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const s = x.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

function big(x: number | null | undefined) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  if (Math.abs(x) >= 1e6) return `${(x / 1e6).toFixed(2)} million`;
  return Math.round(x).toLocaleString("en-US");
}

// ------------------------------------------------------------------
// Small building blocks
// ------------------------------------------------------------------

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-mono text-[var(--text-label)] font-normal uppercase tracking-[0.12em] text-fg-muted">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone?: "good" | "bad";
}) {
  const colour = tone === "good" ? "text-success" : tone === "bad" ? "text-error" : "text-fg";
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12.5,
          letterSpacing: "0.02em",
          color: "var(--text-muted)",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
        <span className={`font-mono tabular-nums ${colour}`} style={{ fontSize: 20 }}>
          {value}
        </span>
        {unit ? (
          <span className="font-mono text-fg-muted" style={{ fontSize: 13 }}>
            {unit}
          </span>
        ) : null}
      </div>
      {note ? (
        <div style={{ marginTop: 3, fontSize: 13.5, lineHeight: 1.4, color: "var(--text-secondary)" }}>
          {note}
        </div>
      ) : null}
    </div>
  );
}

/** Two columns that drop to one on a narrow panel (plain CSS, so it never depends on a utility class). */
function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        columnGap: 24,
        rowGap: 22,
      }}
    >
      {children}
    </div>
  );
}

function LegendItem({ colour, dash, text }: { colour: string; dash?: boolean; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        aria-hidden="true"
        style={{
          width: 30,
          height: 0,
          borderTop: `3px ${dash ? "dashed" : "solid"} ${colour}`,
        }}
      />
      {text}
    </span>
  );
}

function Slider({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[0.9375rem] font-medium text-fg">
          {label}
        </label>
        <span className="font-mono text-[0.875rem] tabular-nums text-fg">{display}</span>
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

const buttonClass =
  "inline-flex min-h-9 items-center justify-center rounded-[var(--radius)] border border-line-strong px-3 text-[0.8125rem] text-fg transition-colors hover:bg-surface-elevated";

// ------------------------------------------------------------------
// Page
// ------------------------------------------------------------------

export default function OpticalFibrePage() {
  const { theme } = useTheme();
  const fibreCanvas = useRef<HTMLCanvasElement>(null);
  const sweepCanvas = useRef<HTMLCanvasElement>(null);

  const [n1, setN1] = useState(1.5);
  const [n2, setN2] = useState(1.35);
  const [n0, setN0] = useState(1.0);
  const [entryAngle, setEntryAngle] = useState(20);
  const [entryHeight, setEntryHeight] = useState(0);
  const [diameter, setDiameter] = useState(50);
  const [wavelength, setWavelength] = useState(1550);
  const [length, setLength] = useState(100);
  const [bendOn, setBendOn] = useState(false);
  const [bendRadius, setBendRadius] = useState(12);
  const [bendAngle, setBendAngle] = useState(90);
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<FibreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // keep the cladding index below the core index
  function changeCore(v: number) {
    setN1(v);
    if (n2 >= v) setN2(Math.max(1.0, Math.round((v - 0.01) * 100) / 100));
  }
  function changeCladding(v: number) {
    setN2(Math.min(v, Math.round((n1 - 0.01) * 100) / 100));
  }

  // Re-runs whenever a control changes.
  useEffect(() => {
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            n_core: n1,
            n_cladding: n2,
            n_outside: n0,
            entry_angle: entryAngle,
            entry_height: entryHeight,
            core_diameter_um: diameter,
            length_m: length,
            bend_radius: bendOn ? bendRadius : 0,
            bend_angle: bendAngle,
            view_length: 10,
            wavelength_nm: wavelength,
          }),
        });

        if (!response.ok) {
          let detail = `The server returned ${response.status}.`;
          try {
            const body = await response.json();
            if (typeof body.detail === "string") detail = body.detail;
          } catch {
            /* keep the generic message */
          }
          throw new Error(detail);
        }

        const result: FibreResult = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Optical fibre request failed:", err);
        setError(
          err instanceof TypeError
            ? `Could not reach the simulation backend at ${API_BASE || "this address"}.`
            : (err as Error).message,
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 120);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [n1, n2, n0, entryAngle, entryHeight, diameter, wavelength, length, bendOn, bendRadius, bendAngle, reloadKey]);

  useEffect(() => {
    setCanvasTheme(theme);
    if (!data) return;
    for (const [ref, draw] of [
      [fibreCanvas, drawFibre],
      [sweepCanvas, drawSweep],
    ] as const) {
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) draw(ctx, canvas, data);
    }
  }, [data, theme]);

  const fibreHeight = data ? fibreCanvasHeight(data) : 300;
  const s = data?.selected;
  const nums = data?.numbers;
  const path = data?.path;
  const guided = data ? (data.bend.bent ? Boolean(path?.guided) : Boolean(s?.guided_in_straight_fibre)) : false;

  let statusText = "";
  if (data && s) {
    if (!s.enters) statusText = "The ray cannot enter the fibre at this angle.";
    else if (guided)
      statusText = data.bend.bent
        ? "Guided: the ray is trapped in the core all the way round the bend."
        : "Guided: total internal reflection traps the ray in the core.";
    else if (data.bend.bent && s.guided_in_straight_fibre && path?.leak)
      statusText = `Lost at the bend: the ray leaks out of the ${path.leak.wall} (it was guided in the straight fibre).`;
    else if (path?.leak) statusText = `Lost: the ray leaks into the cladding at the ${path.leak.wall}.`;
    else statusText = "Lost: the ray is not guided.";
  }

  const radiusRatio = data?.bend.bent && data.bend.radius_diameters
    ? data.bend.radius_diameters / data.bend.minimum_radius_diameters
    : null;

  const lengthLabel = LENGTHS.find((l) => l.value === length)?.label ?? `${length} m`;

  const fibrePanel =
    data && nums && s ? (
      <Panel title="The fibre">
        <StatGrid>
          <Stat label="Critical angle θc" value={f(nums.critical_angle)} unit="°" note="sin θc = n₂ / n₁" />
          <Stat label="Numerical aperture" value={f(nums.numerical_aperture, 3)} note="NA = √(n₁² − n₂²)" />
          <Stat
            label="Acceptance angle θmax"
            value={nums.all_angles_accepted ? "90" : f(nums.acceptance_angle)}
            unit="°"
            note={nums.all_angles_accepted ? "every angle is accepted" : `a cone of ${f(nums.acceptance_cone)}° in all`}
          />
          <Stat label="Steepest ray inside" value={f(nums.max_axial_angle)} unit="°" note="to the axis, cos = n₂ / n₁" />
          <Stat
            label="V number"
            value={f(nums.v_number, 1)}
            note={`V = π d NA / λ  (λ = ${nums.wavelength_nm} nm)`}
          />
          <Stat
            label="Modes it carries"
            value={nums.single_mode ? "1" : `≈ ${big(nums.estimated_modes)}`}
            tone={nums.single_mode ? "good" : undefined}
            note={
              nums.single_mode
                ? "single-mode (V below 2.405)"
                : `about V² / 2; single-mode below ${size(nums.single_mode_cutoff_diameter_um)}`
            }
          />
        </StatGrid>
      </Panel>
    ) : null;

  const selectedPanel =
    data && s ? (
      <Panel title="The selected ray">
        <StatGrid>
          <Stat label="Inside the core θᵣ" value={f(s.refracted_angle)} unit="°" note="n₀ sin θ₀ = n₁ sin θᵣ" />
          <Stat
            label="At the wall φ"
            value={f(s.wall_incidence)}
            unit="°"
            tone={s.wall_incidence === null ? undefined : s.guided_in_straight_fibre ? "good" : "bad"}
            note={s.margin_deg === null ? undefined : `${s.margin_deg >= 0 ? "+" : "−"}${f(Math.abs(s.margin_deg))}° from θc`}
          />
          <Stat label="Reflections" value={big(s.reflections_total)} note={`in ${lengthLabel} of straight fibre; halves when the core is twice as wide`} />
          <Stat
            label="Path length"
            value={s.path_length_m === null ? "—" : f(s.path_length_m, s.path_length_m < 10 ? 3 : 1)}
            unit="m"
            note={s.path_stretch === null ? undefined : `${f(s.path_stretch, 3)} × the fibre length`}
          />
          <Stat label="Travel time" value={f(s.travel_time_ns, 1)} unit="ns" />
          <Stat label="Later than the axial ray" value={f(s.delay_vs_axial_ns, 2)} unit="ns" />
        </StatGrid>
      </Panel>
    ) : null;

  const pulsePanel =
    data && nums ? (
      <Panel title="Pulse spreading">
        <StatGrid>
          <Stat label="Over this length" value={f(nums.modal_dispersion_ns, 2)} unit="ns" />
          <Stat label="Per kilometre" value={f(nums.modal_dispersion_ns_per_km, 1)} unit="ns/km" />
        </StatGrid>
        <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" }}>
          Steep rays travel farther than the axial ray, so a short pulse spreads out:
          Δt = (L n₁ / c)(n₁ / n₂ − 1). A smaller index step spreads it less.
        </p>
      </Panel>
    ) : null;

  const bendPanel =
    data ? (
      <Panel title="Bending">
        <StatGrid>
          <Stat
            label="Safe bend radius"
            value={f(data.bend.minimum_radius_diameters, 1)}
            unit="diameters"
            note={`${size(data.bend.minimum_radius_um)} for a ${diameter} µm core`}
          />
          {radiusRatio !== null ? (
            <Stat
              label="Your bend"
              value={f(radiusRatio, 2)}
              unit="× safe radius"
              tone={radiusRatio >= 1 ? "good" : "bad"}
              note={`${size((data.bend.radius_diameters ?? 0) * diameter)} radius; ${
                radiusRatio >= 1 ? "axial rays stay guided" : "axial rays begin to leak"
              }`}
            />
          ) : (
            <Stat label="Your bend" value="straight" note="tick “Bend the fibre” to try one" />
          )}
        </StatGrid>
        <p style={{ marginTop: 16, fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" }}>
          A ray parallel to the axis meets the outer wall of a bend at sin i = (R + y)/(R + a).
          Every such ray stays guided when R ≥ a (n₁ + n₂)/(n₁ − n₂), where a is the core
          radius. Rays that are already steep leak at wider bends.
        </p>
      </Panel>
    ) : null;

  return (
    <main className="px-4 py-7 sm:px-8">
      <div className="mx-auto w-full max-w-[1400px]">
        <h1 className="text-[length:var(--text-h1)] font-medium text-fg">Optical Fibre</h1>
        <p className="mt-2 max-w-[66ch] text-fg-secondary">
          A fibre guides light by total internal reflection. Change the glass, the angle at which the
          light enters, and bend the fibre to see when it stays trapped and when it leaks.
        </p>

        <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)]">
          {/* left: the diagrams, then the results for the fibre and the selected ray */}
          <div className="flex min-w-0 flex-col gap-6">
            <section
              aria-label="Fibre diagram"
              className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-[var(--diagram-bg)]"
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  columnGap: 22,
                  rowGap: 6,
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  fontSize: 14,
                  color: "var(--text-secondary)",
                }}
              >
                <LegendItem colour="var(--data-orange)" text="Selected ray" />
                <LegendItem colour="var(--ray-refracted)" text="Guided (inside the cone)" />
                <LegendItem colour="var(--ray-reflected)" dash text="Lost (outside the cone)" />
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>
                  n₁ {f(n1, 2)} · n₂ {f(n2, 2)} · n₀ {f(n0, 2)} · core {diameter} µm
                </span>
              </div>
              <canvas
                ref={fibreCanvas}
                role="img"
                aria-label="Optical fibre with a core and cladding, a fan of rays entering the end face, the acceptance cone, and the selected ray zigzagging by total internal reflection or leaking out"
                width={FIBRE_CANVAS_WIDTH}
                height={fibreHeight}
                className="block h-auto w-full"
              />
            </section>

            <div role="status" aria-live="polite">
              {statusText ? (
                <p
                  className={`rounded-[var(--radius)] border px-4 py-3 text-[0.9375rem] ${
                    guided ? "border-success text-success" : "border-error text-error"
                  }`}
                >
                  {statusText}
                </p>
              ) : null}
            </div>

            <section
              aria-label="Wall angle against entry angle"
              className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-[var(--diagram-bg)]"
            >
              <canvas
                ref={sweepCanvas}
                role="img"
                aria-label="Graph of the angle at the wall against the entry angle, with the critical angle and the acceptance range marked"
                width={SWEEP_CANVAS_SIZE.width}
                height={SWEEP_CANVAS_SIZE.height}
                className="block h-auto w-full"
              />
            </section>

            {fibrePanel}
            {selectedPanel}
          </div>

          {/* right: controls, then pulse spreading and bending */}
          <div className="flex min-w-0 flex-col gap-6">
            <Panel title="Controls">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Fibre presets">
                {PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    title={p.note}
                    className={buttonClass}
                    onClick={() => {
                      setN1(p.n1);
                      setN2(p.n2);
                    }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-5">
                <Slider id="n-core" label="Core index n₁" value={n1} display={f(n1, 2)} min={1.4} max={2.0} step={0.01} onChange={changeCore} />
                <Slider id="n-clad" label="Cladding index n₂" value={n2} display={f(n2, 2)} min={1.0} max={1.99} step={0.01} onChange={changeCladding} />

                <div>
                  <label htmlFor="n-out" className="text-[0.9375rem] font-medium text-fg">
                    Medium outside the fibre
                  </label>
                  <select
                    id="n-out"
                    value={n0}
                    onChange={(e) => setN0(Number(e.target.value))}
                    className="mt-2 w-full"
                  >
                    <option value={1}>Air (n₀ = 1.00)</option>
                    <option value={1.33}>Water (n₀ = 1.33)</option>
                  </select>
                </div>

                <Slider id="entry-angle" label="Entry angle θ₀" value={entryAngle} display={`${entryAngle}°`} min={-85} max={85} step={1} onChange={setEntryAngle} />
                <Slider id="entry-height" label="Entry point (fraction of the core radius)" value={entryHeight} display={f(entryHeight, 1)} min={-0.9} max={0.9} step={0.1} onChange={setEntryHeight} />
                <Slider id="diameter" label="Core diameter" value={diameter} display={`${diameter} µm`} min={2} max={200} step={1} onChange={setDiameter} />

                <div>
                  <label htmlFor="wavelength" className="text-[0.9375rem] font-medium text-fg">
                    Wavelength of the light
                  </label>
                  <select
                    id="wavelength"
                    value={wavelength}
                    onChange={(e) => setWavelength(Number(e.target.value))}
                    className="mt-2 w-full"
                  >
                    {WAVELENGTHS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                  <p style={{ marginTop: 6, fontSize: 13, lineHeight: 1.4, color: "var(--text-muted)" }}>
                    The diameter and the wavelength do not change any ray angle. They set the number of
                    bounces, the size of a safe bend and the V number.
                  </p>
                </div>

                <div>
                  <label htmlFor="length" className="text-[0.9375rem] font-medium text-fg">
                    Fibre length
                  </label>
                  <select
                    id="length"
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                    className="mt-2 w-full"
                  >
                    {LENGTHS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-3 text-[0.9375rem] text-fg">
                  <input
                    type="checkbox"
                    checked={bendOn}
                    onChange={(e) => setBendOn(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Bend the fibre
                </label>

                {bendOn ? (
                  <>
                    <Slider id="bend-radius" label="Bend radius (core diameters)" value={bendRadius} display={f(bendRadius, 1)} min={2} max={60} step={0.5} onChange={setBendRadius} />
                    <Slider id="bend-angle" label="Bend angle" value={bendAngle} display={`${bendAngle}°`} min={30} max={180} step={5} onChange={setBendAngle} />
                  </>
                ) : null}
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button type="button" className={buttonClass} onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
                  {loading ? "Simulating…" : "Simulate"}
                </button>
              </div>

              {error ? (
                <p role="alert" className="mt-4 text-[var(--text-small)] text-error">
                  {error}
                </p>
              ) : null}
            </Panel>

            {pulsePanel}
            {bendPanel}
          </div>
        </div>

        <section className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-mono text-[var(--text-label)] font-normal uppercase tracking-[0.12em] text-fg-muted">
            How an optical fibre works
          </h2>
          <div
            className="text-[0.9375rem] leading-relaxed text-fg-secondary"
            style={{
              marginTop: 16,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              columnGap: 32,
              rowGap: 14,
            }}
          >
            <p>
              <strong className="font-medium text-fg">Total internal reflection.</strong> The core
              has a higher refractive index n₁ than the cladding n₂. A ray that meets the
              boundary at an angle larger than the critical angle θc, where sin θc = n₂/n₁, is
              reflected completely. It zigzags down the core and loses no light at the wall.
            </p>
            <p>
              <strong className="font-medium text-fg">Reflections.</strong> A ray at angle θᵣ to
              the axis reflects about L tan θᵣ / d times in a length L of fibre of core diameter d.
              A real fibre is thin and long, so this is a very large number.
            </p>
            <p>
              <strong className="font-medium text-fg">Getting light in.</strong> At the flat end a
              ray from a medium of index n₀ is refracted: n₀ sin θ₀ = n₁ sin θᵣ. Inside it makes
              the angle φ = 90° − θᵣ with the wall, and it is guided when φ ≥ θc.
            </p>
            <p>
              <strong className="font-medium text-fg">Pulse spreading.</strong> The axial ray
              takes the shortest path and the steepest guided ray the longest. A pulse of light
              spreads by Δt = (L n₁ / c)(n₁ / n₂ − 1), which limits how fast data can be sent
              along a long step-index fibre.
            </p>
            <p>
              <strong className="font-medium text-fg">Acceptance angle.</strong> Putting φ = θc
              gives n₀ sin θmax = √(n₁² − n₂²) = NA, the numerical aperture. Light entering within
              the cone of half-angle θmax is guided; light outside it leaks into the cladding.
            </p>
            <p>
              <strong className="font-medium text-fg">Core diameter.</strong> It changes no angle.
              A wider core means fewer bounces (about L tan θᵣ / d), a larger safe bend in real
              units, and a larger V number, V = π d NA / λ. When V is below 2.405 the fibre carries
              a single mode and the ray picture no longer applies; when V is large it carries about
              V² / 2 modes.
            </p>
            <p>
              <strong className="font-medium text-fg">What this model leaves out.</strong> It
              follows rays that stay in one plane through the axis. Real fibres also carry skew
              rays, lose a little light to absorption and scattering, and for very thin cores need
              wave optics, not rays.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
