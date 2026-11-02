"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "../components/ThemeProvider";
import { API_BASE } from "@/lib/config";
import { setCanvasTheme } from "@/lib/canvasTheme";
import {
  LegendItem,
  Panel,
  Slider,
  Stat,
  StatGrid,
  controlButtonClass,
  f,
} from "../components/SimPanels";
import {
  GRAPH_CANVAS_SIZE,
  LAYOUT_CANVAS_WIDTH,
  MAGNIFIED_CANVAS_SIZE,
  drawGraph,
  drawLayout,
  drawMagnified,
  layoutCanvasHeight,
  magnificationFactor,
  type CombinationResult,
} from "./drawing";

const API = `${API_BASE}/simulate/prism-combination`;

const GLASSES = [
  { id: "silica", name: "Fused silica", n: 1.458, v: 67.8 },
  { id: "crown", name: "Crown glass (BK7)", n: 1.517, v: 64.2 },
  { id: "flint", name: "Light flint (F2)", n: 1.62, v: 36.4 },
  { id: "dense", name: "Dense flint (SF10)", n: 1.728, v: 28.4 },
  { id: "densest", name: "Dense flint (SF11)", n: 1.785, v: 25.7 },
];

/** Thin-prism rules: the second apex angle (prism turned over) that cancels the dispersion, or the bend. */
function idealApex(a1: number, n1: number, v1: number, n2: number, v2: number) {
  return {
    achromatic: (a1 * (n1 - 1) * v2) / ((n2 - 1) * v1),
    direct: (a1 * (n1 - 1)) / (n2 - 1),
  };
}

const clampApex = (x: number) => Math.min(60, Math.max(1, Math.round(x * 10) / 10));

function GlassPicker({
  id,
  n,
  v,
  onChange,
}: {
  id: string;
  n: number;
  v: number;
  onChange: (n: number, v: number) => void;
}) {
  const match = GLASSES.find((g) => Math.abs(g.n - n) < 1e-9 && Math.abs(g.v - v) < 1e-9);
  return (
    <div>
      <label htmlFor={id} className="text-[0.9375rem] font-medium text-fg">
        Glass
      </label>
      <select
        id={id}
        value={match?.id ?? "custom"}
        onChange={(e) => {
          const g = GLASSES.find((x) => x.id === e.target.value);
          if (g) onChange(g.n, g.v);
        }}
        className="mt-2 w-full"
      >
        {GLASSES.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}: n = {g.n}, V = {g.v}
          </option>
        ))}
        <option value="custom">Custom: n = {f(n, 3)}, V = {f(v, 1)}</option>
      </select>
      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 13.5, color: "var(--text-secondary)" }}>
          Fine-tune the glass
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <Slider id={`${id}-n`} label="Refractive index n" value={n} display={f(n, 3)} min={1.3} max={2.2} step={0.001} onChange={(x) => onChange(x, v)} />
          <Slider id={`${id}-v`} label="Abbe number V" value={v} display={f(v, 1)} min={15} max={100} step={0.1} onChange={(x) => onChange(n, x)} />
        </div>
      </details>
    </div>
  );
}

export default function PrismCombinationPage() {
  const { theme } = useTheme();
  const layoutCanvas = useRef<HTMLCanvasElement>(null);
  const magnifiedCanvas = useRef<HTMLCanvasElement>(null);
  const graphCanvas = useRef<HTMLCanvasElement>(null);

  const [apex1, setApex1] = useState(10);
  const [n1, setN1] = useState(1.517);
  const [v1, setV1] = useState(64.2);
  const [apex2, setApex2] = useState(4.7);
  const [n2, setN2] = useState(1.62);
  const [v2, setV2] = useState(36.4);
  const [arrangement, setArrangement] = useState<"same" | "opposite">("opposite");
  const [incidence, setIncidence] = useState(20);
  const [gap, setGap] = useState(0);
  const [screen, setScreen] = useState(25);
  const [reloadKey, setReloadKey] = useState(0);

  const [data, setData] = useState<CombinationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
            apex_angle_1: apex1,
            n_d_1: n1,
            abbe_number_1: v1,
            apex_angle_2: apex2,
            n_d_2: n2,
            abbe_number_2: v2,
            arrangement,
            incidence_angle: incidence,
            gap,
            spectrum_samples: 7,
            screen_distance: screen,
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

        const result: CombinationResult = await response.json();
        if (!controller.signal.aborted) setData(result);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Prism combination request failed:", err);
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
  }, [apex1, n1, v1, apex2, n2, v2, arrangement, incidence, gap, screen, reloadKey]);

  useEffect(() => {
    setCanvasTheme(theme);
    if (!data) return;
    for (const [ref, draw] of [
      [layoutCanvas, drawLayout],
      [magnifiedCanvas, drawMagnified],
      [graphCanvas, drawGraph],
    ] as const) {
      const canvas = ref.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) draw(ctx, canvas, data);
    }
  }, [data, theme]);

  const ideal = idealApex(apex1, n1, v1, n2, v2);
  const s = data?.summary;

  // what the pair achieves, in plain words
  let status = "";
  let tone: "good" | "plain" | "bad" = "plain";
  if (data && s) {
    const alone = Math.abs(s.first_alone.mean_deviation ?? 0);
    if (!s.all_emerged) {
      const stuck = data.rays.find((r) => !r.emerged);
      status = `${stuck?.events[stuck.events.length - 1] ?? "Some light does not get through."}. Reduce the apex angles or the angle of incidence.`;
      tone = "bad";
    } else {
      const spectrumCancelled = s.dispersion_left !== null && s.dispersion_left < 0.1;
      const bendCancelled = alone > 0 && s.mean_deviation !== null && Math.abs(s.mean_deviation) < 0.05 * alone;
      if (spectrumCancelled && bendCancelled) {
        status = "Both the colours and the bend are almost cancelled.";
        tone = "good";
      } else if (spectrumCancelled) {
        status = `Achromatic: the colours leave together (only ${f((s.dispersion_left ?? 0) * 100, 1)}% of prism 1's spread is left), and the beam is still bent by ${f(s.mean_deviation, 2)}°.`;
        tone = "good";
      } else if (bendCancelled) {
        status = `Direct vision: the beam goes almost straight through (δ = ${f(s.mean_deviation, 3)}°) while the colours are still spread by ${f(Math.abs(s.angular_dispersion ?? 0) * 60, 1)}′.`;
        tone = "good";
      } else {
        status = `The beam is bent by ${f(s.mean_deviation, 2)}° and the colours are spread by ${f(Math.abs(s.angular_dispersion ?? 0) * 60, 1)}′ (prism 1 alone: ${f(Math.abs(s.first_alone.angular_dispersion ?? 0) * 60, 1)}′).`;
      }
      if (!data.reference.inside_faces) status += " The beam falls outside one of the drawn faces.";
    }
  }

  const layoutHeight = data ? layoutCanvasHeight(data) : 300;
  const magnification = data ? magnificationFactor(data) : 1;

  function applyPreset(name: "achromatic" | "direct" | "same" | "large") {
    if (name === "achromatic") {
      setApex1(10); setN1(1.517); setV1(64.2);
      setN2(1.62); setV2(36.4);
      setApex2(clampApex(idealApex(10, 1.517, 64.2, 1.62, 36.4).achromatic));
      setArrangement("opposite"); setGap(0); setIncidence(20);
    } else if (name === "direct") {
      setApex1(10); setN1(1.517); setV1(64.2);
      setN2(1.785); setV2(25.7);
      setApex2(clampApex(idealApex(10, 1.517, 64.2, 1.785, 25.7).direct));
      setArrangement("opposite"); setGap(0); setIncidence(20);
    } else if (name === "same") {
      setApex1(10); setN1(1.517); setV1(64.2);
      setApex2(8); setN2(1.62); setV2(36.4);
      setArrangement("same"); setGap(0); setIncidence(20);
    } else {
      setApex1(40); setN1(1.517); setV1(64.2);
      setApex2(15); setN2(1.728); setV2(28.4);
      setArrangement("same"); setGap(0); setIncidence(30); setScreen(15);
    }
  }

  return (
    <main className="px-4 py-7 sm:px-8">
      <div className="mx-auto w-full max-w-[1400px]">
        <h1 className="text-[length:var(--text-h1)] font-medium text-fg">Prism Combinations</h1>
        <p className="mt-2 max-w-[68ch] text-fg-secondary">
          Put two prisms in a row. A crown and a flint prism turned against each other can cancel the
          colours but still bend the light (achromatic), or cancel the bend but still spread the colours
          (direct vision). Turned the same way, they add.
        </p>

        <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)]">
          {/* left: the diagrams, then the results */}
          <div className="flex min-w-0 flex-col gap-6">
            <section aria-label="The two prisms" className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-[var(--diagram-bg)]">
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
                <LegendItem colour="var(--text)" text="White light in" />
                <LegendItem colour="var(--ray-refracted)" text="Colours out (violet to red)" />
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>
                  1: {f(apex1, 1)}° · 2: {f(apex2, 1)}° {arrangement === "opposite" ? "turned over" : "same way"} · {gap === 0 ? "cemented" : `gap ${f(gap, 1)}`}
                </span>
              </div>
              <canvas
                ref={layoutCanvas}
                role="img"
                aria-label="Two prisms in a row with a beam of white light entering the first and the coloured rays leaving the second and reaching a screen"
                width={LAYOUT_CANVAS_WIDTH}
                height={layoutHeight}
                className="block h-auto w-full"
              />
            </section>

            <div role="status" aria-live="polite">
              {status ? (
                <p
                  className={`rounded-[var(--radius)] border px-4 py-3 text-[0.9375rem] ${
                    tone === "good" ? "border-success text-success" : tone === "bad" ? "border-error text-error" : "border-line-strong text-fg-secondary"
                  }`}
                >
                  {status}
                </p>
              ) : null}
            </div>

            <section aria-label="The emerging colours, magnified" className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-[var(--diagram-bg)]">
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 14, color: "var(--text-secondary)" }}>
                The colours that leave the prisms differ by only a few arcminutes, so here their
                directions are magnified ×{magnification >= 10 ? Math.round(magnification) : f(magnification, 1)} to make them visible.
              </div>
              <canvas
                ref={magnifiedCanvas}
                role="img"
                aria-label="Two fans of coloured rays: the spread of colours after prism 1 alone, and after the pair, with angles magnified"
                width={MAGNIFIED_CANVAS_SIZE.width}
                height={MAGNIFIED_CANVAS_SIZE.height}
                className="block h-auto w-full"
              />
            </section>

            <section aria-label="Deviation against wavelength" className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-[var(--diagram-bg)]">
              <canvas
                ref={graphCanvas}
                role="img"
                aria-label="Graph of how the deviation changes with wavelength for the pair, prism 1 alone and prism 2 alone"
                width={GRAPH_CANVAS_SIZE.width}
                height={GRAPH_CANVAS_SIZE.height}
                className="block h-auto w-full"
              />
            </section>

            {data && s ? (
              <>
                <Panel title="The pair">
                  <StatGrid>
                    <Stat
                      label="Mean deviation δ"
                      value={f(s.mean_deviation, 3)}
                      unit="°"
                      note={`thin-prism rule: ${f(s.thin_mean_deviation, 3)}°`}
                    />
                    <Stat
                      label="Colour spread F–C"
                      value={f(Math.abs(s.angular_dispersion ?? 0) * 60, 2)}
                      unit="′"
                      tone={s.dispersion_left !== null && s.dispersion_left < 0.1 ? "good" : undefined}
                      note={`thin-prism rule: ${f(Math.abs(s.thin_angular_dispersion) * 60, 2)}′`}
                    />
                    <Stat
                      label="Spread left, against prism 1 alone"
                      value={s.dispersion_left === null ? "—" : f(s.dispersion_left * 100, 1)}
                      unit="%"
                      note="100% means no cancellation"
                    />
                    <Stat
                      label="Deviation of blue (F) and red (C)"
                      value={`${f(s.deviation_f, 3)}° / ${f(s.deviation_c, 3)}°`}
                      note="F = 486 nm, C = 656 nm"
                    />
                  </StatGrid>
                </Panel>

                <Panel title="Each prism alone, at the same angle of incidence">
                  <StatGrid>
                    <Stat label="Prism 1: deviation" value={f(s.first_alone.mean_deviation, 3)} unit="°" />
                    <Stat label="Prism 1: colour spread" value={f(Math.abs(s.first_alone.angular_dispersion ?? 0) * 60, 2)} unit="′" />
                    <Stat label="Prism 2: deviation" value={f(s.second_alone.mean_deviation, 3)} unit="°" />
                    <Stat label="Prism 2: colour spread" value={f(Math.abs(s.second_alone.angular_dispersion ?? 0) * 60, 2)} unit="′" />
                  </StatGrid>
                </Panel>
              </>
            ) : null}
          </div>

          {/* right: controls, then how to match the prisms and the surface-by-surface table */}
          <div className="flex min-w-0 flex-col gap-6">
            <Panel title="Controls">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Examples">
                <button type="button" className={controlButtonClass} onClick={() => applyPreset("achromatic")}>Achromatic pair</button>
                <button type="button" className={controlButtonClass} onClick={() => applyPreset("direct")}>Direct-vision pair</button>
                <button type="button" className={controlButtonClass} onClick={() => applyPreset("same")}>Turned the same way</button>
                <button type="button" className={controlButtonClass} onClick={() => applyPreset("large")}>Large prisms</button>
              </div>

              <div className="mt-5 flex flex-col gap-5">
                <fieldset className="flex flex-col gap-4 border-0 p-0">
                  <legend className="font-mono text-[var(--text-label)] uppercase tracking-[0.1em] text-fg-muted">Prism 1</legend>
                  <Slider id="apex-1" label="Apex angle A₁" value={apex1} display={`${f(apex1, 1)}°`} min={1} max={60} step={0.5} onChange={setApex1} />
                  <GlassPicker id="glass-1" n={n1} v={v1} onChange={(n, v) => { setN1(n); setV1(v); }} />
                </fieldset>

                <fieldset className="flex flex-col gap-4 border-0 p-0">
                  <legend className="font-mono text-[var(--text-label)] uppercase tracking-[0.1em] text-fg-muted">Prism 2</legend>
                  <Slider id="apex-2" label="Apex angle A₂" value={apex2} display={`${f(apex2, 1)}°`} min={1} max={60} step={0.1} onChange={setApex2} />
                  <GlassPicker id="glass-2" n={n2} v={v2} onChange={(n, v) => { setN2(n); setV2(v); }} />
                  <div>
                    <label htmlFor="arrangement" className="text-[0.9375rem] font-medium text-fg">
                      Direction
                    </label>
                    <select
                      id="arrangement"
                      value={arrangement}
                      onChange={(e) => setArrangement(e.target.value as "same" | "opposite")}
                      className="mt-2 w-full"
                    >
                      <option value="opposite">Turned over (apex on the other side)</option>
                      <option value="same">The same way as prism 1</option>
                    </select>
                  </div>
                </fieldset>

                <Slider id="gap" label="Gap between the prisms" value={gap} display={gap === 0 ? "cemented" : f(gap, 1)} min={0} max={5} step={0.1} onChange={setGap} />
                <Slider id="incidence" label="Angle of incidence on face 1" value={incidence} display={`${incidence}°`} min={-60} max={60} step={1} onChange={setIncidence} />
                <Slider id="screen" label="Distance to the screen" value={screen} display={`${screen}`} min={10} max={80} step={1} onChange={setScreen} />
              </div>

              <div className="mt-6 flex items-center gap-3">
                <button type="button" className={controlButtonClass} onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>
                  {loading ? "Simulating…" : "Simulate"}
                </button>
              </div>

              {error ? (
                <p role="alert" className="mt-4 text-[var(--text-small)] text-error">
                  {error}
                </p>
              ) : null}
            </Panel>

            <Panel title="Matching the prisms">
              <StatGrid>
                <Stat
                  label="A₂ that cancels the colours"
                  value={f(ideal.achromatic, 2)}
                  unit="°"
                  note="turned over: (n₁−1)A₁ / V₁ = (n₂−1)A₂ / V₂"
                />
                <Stat
                  label="A₂ that cancels the bend"
                  value={f(ideal.direct, 2)}
                  unit="°"
                  note="turned over: (n₁−1)A₁ = (n₂−1)A₂"
                />
              </StatGrid>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={controlButtonClass}
                  onClick={() => { setArrangement("opposite"); setApex2(clampApex(ideal.achromatic)); }}
                >
                  Cancel the colours
                </button>
                <button
                  type="button"
                  className={controlButtonClass}
                  onClick={() => { setArrangement("opposite"); setApex2(clampApex(ideal.direct)); }}
                >
                  Cancel the bend
                </button>
              </div>
              <p style={{ marginTop: 14, fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" }}>
                These rules are exact only for thin prisms. The numbers on the left come from tracing
                every ray exactly, so a little colour is left for thicker prisms.
              </p>
            </Panel>

            {data ? (
              <Panel title="At each surface (yellow light)">
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "var(--font-mono)", fontSize: 13.5 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                        <th style={{ padding: "4px 10px 8px 0", fontWeight: 400 }}>Surface</th>
                        <th style={{ padding: "4px 10px 8px 0", fontWeight: 400 }}>Index</th>
                        <th style={{ padding: "4px 10px 8px 0", fontWeight: 400 }}>In</th>
                        <th style={{ padding: "4px 10px 8px 0", fontWeight: 400 }}>Out</th>
                        <th style={{ padding: "4px 0 8px 0", fontWeight: 400 }}>Bend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reference.steps.map((step) => (
                        <tr key={step.surface} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px 10px 8px 0" }}>{step.surface}</td>
                          <td style={{ padding: "8px 10px 8px 0" }}>{f(step.n_before, 3)} → {f(step.n_after, 3)}</td>
                          <td style={{ padding: "8px 10px 8px 0" }}>{f(step.incidence_angle, 2)}°</td>
                          <td style={{ padding: "8px 10px 8px 0" }}>{f(step.refraction_angle, 2)}°</td>
                          <td style={{ padding: "8px 0" }}>{f(step.bend, 3)}°</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" }}>
                  The angles are measured from each face&apos;s normal. Snell&apos;s law, n sin i = n′ sin r,
                  holds at every surface, and the bends add up to the total deviation.
                </p>
              </Panel>
            ) : null}
          </div>
        </div>

        <section className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
          <h2 className="font-mono text-[var(--text-label)] font-normal uppercase tracking-[0.12em] text-fg-muted">
            How prisms combine
          </h2>
          <div
            className="text-[0.9375rem] leading-relaxed text-fg-secondary"
            style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", columnGap: 32, rowGap: 14 }}
          >
            <p>
              <strong className="font-medium text-fg">Dispersion.</strong> Glass bends blue light more
              than red. The Abbe number V = (n<sub>d</sub> − 1)/(n<sub>F</sub> − n<sub>C</sub>) tells how
              little: a high V (crown) spreads the colours less than a low V (flint).
            </p>
            <p>
              <strong className="font-medium text-fg">Achromatic pair.</strong> A strong prism of low
              dispersion glass is turned against a weaker prism of high dispersion glass. The colours
              cancel when (n₁ − 1)A₁/V₁ = (n₂ − 1)A₂/V₂, but the flint prism does not cancel all of the
              bend, so the beam still turns. This is the idea behind the achromatic lens.
            </p>
            <p>
              <strong className="font-medium text-fg">Direct-vision pair.</strong> Choose instead
              (n₁ − 1)A₁ = (n₂ − 1)A₂. The bends cancel, so the beam goes straight on, but the flint
              prism spreads the colours more than the crown prism takes back. This is how a pocket
              spectroscope shows a spectrum without turning the instrument.
            </p>
            <p>
              <strong className="font-medium text-fg">Turned the same way.</strong> Both the bends and
              the colour spreads add. Two prisms cemented together in the same direction behave as one
              prism of apex angle A₁ + A₂ (when both are made of the same glass).
            </p>
            <p>
              <strong className="font-medium text-fg">Why a little colour is left.</strong> The two
              colours F and C can be made to leave together, but the other colours do not follow
              exactly, because the two glasses spread them in slightly different proportions. This
              leftover is the secondary spectrum; it is the slight bend in the orange curve.
            </p>
            <p>
              <strong className="font-medium text-fg">What the simulation does.</strong> It follows
              each colour exactly through every flat surface with Snell&apos;s law and a refractive index
              that depends on the wavelength, in a plane. The rules above are the thin-prism
              approximation, shown beside the exact results.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
