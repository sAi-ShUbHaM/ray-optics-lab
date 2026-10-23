"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { API_BASE } from "@/lib/config";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme } from "@/lib/canvasTheme";
import { drawDeviationCurve, drawPrism, fmt, type PrismResult } from "./drawing";

type Material = { label: string; nd: number; abbe: number };

const MATERIALS: Material[] = [
  { label: "Crown glass (BK7)", nd: 1.5168, abbe: 64.2 },
  { label: "Flint glass (F2)", nd: 1.62, abbe: 36.4 },
  { label: "Fused silica", nd: 1.4585, abbe: 67.8 },
  { label: "Water", nd: 1.333, abbe: 55.8 },
  { label: "Diamond", nd: 2.4175, abbe: 55.3 },
];

type Scenario = {
  label: string;
  apex: number;
  nd: number;
  abbe: number;
  incidence: number;
};

const SCENARIOS: Scenario[] = [
  { label: "Standard 60° prism, crown glass", apex: 60, nd: 1.5168, abbe: 64.2, incidence: 45 },
  { label: "Strong dispersion: flint glass", apex: 60, nd: 1.62, abbe: 36.4, incidence: 50 },
  { label: "Thin prism (6°)", apex: 6, nd: 1.5168, abbe: 64.2, incidence: 3 },
  { label: "Right-angle reflecting prism", apex: 90, nd: 1.5168, abbe: 64.2, incidence: 0 },
  { label: "Total internal reflection", apex: 60, nd: 1.62, abbe: 36.4, incidence: 30 },
];

const API = `${API_BASE}/simulate/prism`;

export default function PrismPage() {
  const { theme } = useTheme();
  const prismCanvas = useRef<HTMLCanvasElement | null>(null);
  const curveCanvas = useRef<HTMLCanvasElement | null>(null);

  const [apex, setApex] = useState(60);
  const [nd, setNd] = useState(1.5168);
  const [abbe, setAbbe] = useState(64.2);
  const [incidence, setIncidence] = useState(45);
  const [entry, setEntry] = useState(0.5);
  const [mono, setMono] = useState(false);
  const [samples, setSamples] = useState(9);
  const [wavelength, setWavelength] = useState(550);
  const [screenDistance, setScreenDistance] = useState(25);
  const [showNormals, setShowNormals] = useState(true);

  const [data, setData] = useState<PrismResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const body = JSON.stringify({
    apex_angle: apex,
    n_d: nd,
    abbe_number: abbe,
    incidence_angle: incidence,
    entry_fraction: entry,
    spectrum_samples: mono ? 1 : samples,
    wavelength_nm: wavelength,
    screen_distance: screenDistance,
  });

  useEffect(() => {
    const controller = new AbortController();

    async function simulate() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });

        if (!response.ok) {
          let message = `Backend returned ${response.status}`;

          try {
            const json = await response.json();
            if (typeof json?.detail === "string") message = json.detail;
          } catch {
            // The body was not JSON; keep the status message.
          }

          throw new Error(message);
        }

        const result: PrismResult = await response.json();

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
  }, [body]);

  useEffect(() => {
    if (!data) return;

    const canvas = prismCanvas.current;
    const ctx = canvas?.getContext("2d");
    setCanvasTheme(theme);
    if (canvas && ctx) drawPrism(ctx, canvas, data, showNormals);
  }, [data, showNormals, theme]);

  useEffect(() => {
    if (!data) return;

    const canvas = curveCanvas.current;
    const ctx = canvas?.getContext("2d");
    setCanvasTheme(theme);
    if (canvas && ctx) drawDeviationCurve(ctx, canvas, data);
  }, [data, theme]);

  function applyMaterial(label: string) {
    const material = MATERIALS.find((m) => m.label === label);
    if (!material) return;
    setNd(material.nd);
    setAbbe(material.abbe);
  }

  function applyScenario(label: string) {
    const scenario = SCENARIOS.find((s) => s.label === label);
    if (!scenario) return;
    setApex(scenario.apex);
    setNd(scenario.nd);
    setAbbe(scenario.abbe);
    setIncidence(scenario.incidence);
  }

  function setMinimumDeviation() {
    if (data?.min_deviation_incidence != null) {
      setIncidence(Number(data.min_deviation_incidence.toFixed(1)));
    }
  }

  const first = data?.rays[0];
  const last = data?.rays[data.rays.length - 1];

  return (
    <main style={styles.page}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: "clamp(1.625rem, 1.2rem + 1.4vw, 2.125rem)",
            fontWeight: 500,
            letterSpacing: "-0.015em",
            marginBottom: 8,
          }}
        >Prism and Dispersion</h1>

        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          Light is refracted at both faces of a glass prism with Snell&apos;s law.
          Because the refractive index depends on wavelength, white light
          spreads into a spectrum.
        </p>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Prism</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Example setup
              <select
                defaultValue=""
                onChange={(e) => applyScenario(e.target.value)}
                style={styles.select}
              >
                <option value="" disabled>
                  Choose a setup...
                </option>
                {SCENARIOS.map((s) => (
                  <option key={s.label} value={s.label}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Material
              <select
                defaultValue=""
                onChange={(e) => applyMaterial(e.target.value)}
                style={styles.select}
              >
                <option value="" disabled>
                  Choose a material...
                </option>
                {MATERIALS.map((m) => (
                  <option key={m.label} value={m.label}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Apex angle A: {apex}°
              <input
                type="range"
                min="10"
                max="90"
                step="1"
                value={apex}
                onChange={(e) => setApex(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Refractive index n (yellow D line): {nd.toFixed(3)}
              <input
                type="range"
                min="1.2"
                max="2.5"
                step="0.005"
                value={nd}
                onChange={(e) => setNd(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Abbe number V: {abbe.toFixed(1)}
              <span style={{ fontWeight: "normal", color: "var(--text-secondary)" }}>
                (lower = more dispersion)
              </span>
              <input
                type="range"
                min="20"
                max="90"
                step="0.5"
                value={abbe}
                onChange={(e) => setAbbe(Number(e.target.value))}
              />
            </label>
          </div>
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Light</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Angle of incidence θ₁: {incidence.toFixed(1)}°
              <input
                type="range"
                min="-60"
                max="85"
                step="0.1"
                value={incidence}
                onChange={(e) => setIncidence(Number(e.target.value))}
              />
              <button
                type="button"
                onClick={setMinimumDeviation}
                disabled={data?.min_deviation_incidence == null}
                style={styles.button}
              >
                Set to minimum deviation
              </button>
            </label>

            <label style={styles.label}>
              Where it hits the face: {entry.toFixed(2)}
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.01"
                value={entry}
                onChange={(e) => setEntry(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Light source
              <select
                value={mono ? "mono" : "white"}
                onChange={(e) => setMono(e.target.value === "mono")}
                style={styles.select}
              >
                <option value="white">White light (spectrum)</option>
                <option value="mono">Single wavelength</option>
              </select>
            </label>

            {mono ? (
              <label style={styles.label}>
                Wavelength: {wavelength} nm
                <input
                  type="range"
                  min="400"
                  max="700"
                  step="5"
                  value={wavelength}
                  onChange={(e) => setWavelength(Number(e.target.value))}
                />
              </label>
            ) : (
              <label style={styles.label}>
                Colours traced: {samples}
                <input
                  type="range"
                  min="3"
                  max="13"
                  step="2"
                  value={samples}
                  onChange={(e) => setSamples(Number(e.target.value))}
                />
              </label>
            )}

            <label style={styles.label}>
              Screen distance: {screenDistance}
              <input
                type="range"
                min="5"
                max="60"
                step="1"
                value={screenDistance}
                onChange={(e) => setScreenDistance(Number(e.target.value))}
              />
            </label>

            <label style={{ ...styles.label, flexDirection: "row", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={showNormals}
                onChange={(e) => setShowNormals(e.target.checked)}
              />
              Show surface normals
            </label>
          </div>

          {loading && <p>Updating simulation...</p>}
          {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Ray diagram</h2>
          <canvas role="img" aria-label="Ray diagram: light refracting through the prism"
            ref={prismCanvas}
            width={1200}
            height={650}
            style={styles.canvas}
          />
        </section>

        {data && (
          <>
            <section style={styles.results}>
              <ResultCard
                title="Deviation δ (yellow light)"
                value={data.reference.deviation === null ? "—" : `${fmt(data.reference.deviation, 2)}°`}
              />
              <ResultCard
                title="Minimum deviation"
                value={data.min_deviation === null ? "—" : `${fmt(data.min_deviation, 2)}°`}
              />
              <ResultCard
                title="Thin-prism estimate (n − 1)A"
                value={`${fmt(data.thin_prism_deviation, 2)}°`}
              />
              <ResultCard
                title="Angular dispersion (400 to 700 nm)"
                value={data.angular_dispersion === null ? "—" : `${fmt(data.angular_dispersion, 3)}°`}
              />
              <ResultCard
                title="Spread on the screen"
                value={data.screen_spread === null ? "—" : fmt(data.screen_spread, 2)}
              />
              <ResultCard
                title="n at the two ends"
                value={first && last ? `${first.n.toFixed(4)} / ${last.n.toFixed(4)}` : "—"}
              />
              <ResultCard
                title="Critical angle (inside glass)"
                value={data.critical_angle === null ? "—" : `${fmt(data.critical_angle, 1)}°`}
              />
              <ResultCard
                title="Path of the yellow ray"
                value={data.reference.emerged ? "Leaves the prism" : "Trapped"}
              />
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Deviation graph</h2>
              <canvas role="img" aria-label="Deviation graph"
                ref={curveCanvas}
                width={1200}
                height={420}
                style={styles.canvas}
              />
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>What happened to the yellow ray</h2>

              <ol style={{ marginTop: 0 }}>
                {data.reference.events.map((event, i) => (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {event}
                  </li>
                ))}
              </ol>

              {data.reference.angles && (
                <p>
                  θ₁ = {fmt(data.reference.angles.theta1, 2)}°, r₁ ={" "}
                  {fmt(data.reference.angles.r1, 2)}°, r₂ ={" "}
                  {fmt(data.reference.angles.r2, 2)}° (r₁ + r₂ = A), emerging
                  angle θ₄ = {fmt(data.reference.angles.theta4, 2)}°.
                </p>
              )}
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Physics</h2>
              <p>Snell&apos;s law at each face: sin θ₁ = n sin r₁ and sin θ₄ = n sin r₂.</p>
              <p>Geometry inside the prism: r₁ + r₂ = A.</p>
              <p>Deviation: δ = θ₁ + θ₄ − A (positive = bent towards the base).</p>
              <p>
                At minimum deviation the light passes symmetrically (θ₄ = θ₁,
                the inner ray parallel to the base) and n = sin((A + δ_min)/2) /
                sin(A/2).
              </p>
              <p>For a thin prism the deviation is about (n − 1)A, whatever the incidence angle.</p>
              <p>
                Dispersion: n depends on wavelength (Cauchy fit n = C₀ + C₁/λ²,
                here C₀ = {data.cauchy_c0.toFixed(4)}, C₁ = {data.cauchy_c1.toFixed(5)} μm²).
                The curve is fitted so that n equals your value at 589 nm and
                the Abbe number V = (n_D − 1)/(n_F − n_C) matches your slider.
                Violet has the larger n, so it is bent more than red.
              </p>
              <p>
                Total internal reflection: if the angle inside the glass at a
                face exceeds the critical angle (sin θ_c = 1/n), the ray is
                reflected instead of leaving. A right-angle prism uses this to
                turn light through 90°.
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
      <div
        style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
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
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--text)",
  },
  button: {
    padding: "8px 12px",
    border: "1px solid var(--text)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--text)",
    cursor: "pointer",
    fontWeight: "bold",
  },
  canvas: {
    display: "block",
    width: "100%",
    height: "auto",
    border: "1px solid var(--border)",
    borderRadius: 8,
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
};
