"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { API_BASE } from "@/lib/config";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme } from "@/lib/canvasTheme";
import {
  drawBrightness,
  drawDeviationGraph,
  drawDroplet,
  drawSky,
  fmt,
  type Bow,
  type RainbowResult,
} from "./drawing";

const API = `${API_BASE}/simulate/rainbow`;

type Preset = { label: string; nd: number; abbe: number };

const PRESETS: Preset[] = [
  { label: "Water (rain)", nd: 1.333, abbe: 55.8 },
  { label: "Glass beads (n = 1.5): a small bow", nd: 1.5, abbe: 40 },
  { label: "Dense liquid (n = 1.7): a tiny bow", nd: 1.7, abbe: 35 },
  { label: "Very low index (n = 1.25): bows overlap", nd: 1.25, abbe: 55.8 },
  { label: "Strong dispersion: wide bow", nd: 1.333, abbe: 20 },
];

function rangeText(rows: Bow[]): string {
  if (rows.length === 0) return "—";
  const angles = rows.map((r) => r.angle);
  return `${fmt(Math.min(...angles), 1)}° to ${fmt(Math.max(...angles), 1)}°`;
}

export default function RainbowPage() {
  const { theme } = useTheme();
  const dropCanvas = useRef<HTMLCanvasElement | null>(null);
  const curveCanvas = useRef<HTMLCanvasElement | null>(null);
  const brightCanvas = useRef<HTMLCanvasElement | null>(null);
  const skyCanvas = useRef<HTMLCanvasElement | null>(null);

  const [nd, setNd] = useState(1.333);
  const [abbe, setAbbe] = useState(55.8);
  const [b, setB] = useState(0.861);
  const [k, setK] = useState(1);
  const [samples, setSamples] = useState(7);

  const [data, setData] = useState<RainbowResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const body = JSON.stringify({
    n_d: nd,
    abbe_number: abbe,
    impact_parameter: b,
    internal_reflections: k,
    spectrum_samples: samples,
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

        const result: RainbowResult = await response.json();

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

    const jobs: [HTMLCanvasElement | null, typeof drawDroplet][] = [
      [dropCanvas.current, drawDroplet],
      [curveCanvas.current, drawDeviationGraph],
      [brightCanvas.current, drawBrightness],
      [skyCanvas.current, drawSky],
    ];

    setCanvasTheme(theme);
    for (const [canvas, draw] of jobs) {
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) draw(ctx, canvas, data);
    }
  }, [data, theme]);

  function applyPreset(label: string) {
    const preset = PRESETS.find((p) => p.label === label);
    if (!preset) return;
    setNd(preset.nd);
    setAbbe(preset.abbe);
  }

  // Jump to the ray that forms the bow (stationary deviation) for the middle colour.
  function setToRainbowRay() {
    if (!data) return;
    const rows = k === 1 ? data.primary : data.secondary;
    if (rows.length === 0) return;
    const middle = rows[Math.floor(rows.length / 2)];
    setB(Number(middle.impact_parameter.toFixed(3)));
  }

  const mid = data ? data.droplet[Math.floor(data.droplet.length / 2)] : null;

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
        >Rainbows</h1>

        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          A rainbow is sunlight refracted into a raindrop, reflected inside it
          once (primary bow) or twice (secondary bow), and refracted out again.
          Because the refractive index depends on colour, the bow is spread into
          a spectrum.
        </p>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Raindrop</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Liquid
              <select
                defaultValue=""
                onChange={(e) => applyPreset(e.target.value)}
                style={styles.select}
              >
                <option value="" disabled>
                  Choose a liquid...
                </option>
                {PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Refractive index n (yellow D line): {nd.toFixed(3)}
              <input
                type="range"
                min="1.1"
                max="1.95"
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
                min="15"
                max="90"
                step="0.5"
                value={abbe}
                onChange={(e) => setAbbe(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Light path inside the drop
              <select
                value={k}
                onChange={(e) => setK(Number(e.target.value))}
                style={styles.select}
              >
                <option value={1}>1 reflection: primary bow</option>
                <option value={2}>2 reflections: secondary bow</option>
              </select>
            </label>

            <label style={styles.label}>
              Where the ray hits the drop, b: {b.toFixed(3)}
              <span style={{ fontWeight: "normal", color: "var(--text-secondary)" }}>
                (0 = centre, 1 = edge)
              </span>
              <input
                type="range"
                min="0"
                max="0.99"
                step="0.001"
                value={b}
                onChange={(e) => setB(Number(e.target.value))}
              />
              <button type="button" onClick={setToRainbowRay} style={styles.button}>
                Set to the rainbow ray
              </button>
            </label>

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
          </div>

          {loading && <p>Updating simulation...</p>}
          {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Light inside one drop</h2>
          <canvas role="img" aria-label="Light inside one raindrop" ref={dropCanvas} width={1200} height={600} style={styles.canvas} />
        </section>

        {data && mid && (
          <section style={styles.results}>
            <ResultCard title="Angle of incidence i" value={`${fmt(data.incidence_angle, 2)}°`} />
            <ResultCard
              title={`Refraction angle r (${fmt(mid.wavelength_nm, 0)} nm)`}
              value={`${fmt(mid.refraction_angle, 2)}°`}
            />
            <ResultCard title="Total deviation D" value={`${fmt(mid.deviation, 2)}°`} />
            <ResultCard
              title="Angle from the anti-solar point"
              value={`${fmt(mid.angle_from_antisolar, 2)}°`}
            />
            <ResultCard
              title="Light that takes this path"
              value={`${fmt(mid.weight * 100, 2)} %`}
            />
            <ResultCard title="Primary bow (violet to red)" value={rangeText(data.primary)} />
            <ResultCard title="Secondary bow (violet to red)" value={rangeText(data.secondary)} />
            <ResultCard
              title="Alexander's dark band"
              value={
                data.alexander_band
                  ? `${fmt(data.alexander_band[0], 1)}° to ${fmt(data.alexander_band[1], 1)}°`
                  : "None (bows overlap)"
              }
            />
          </section>
        )}

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Why there is a bow: the deviation curve</h2>
          <canvas role="img" aria-label="Deviation curve: why there is a rainbow" ref={curveCanvas} width={1200} height={380} style={styles.canvas} />
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>How bright the sky is at each angle</h2>
          <canvas role="img" aria-label="How bright the sky is at each angle" ref={brightCanvas} width={1200} height={380} style={styles.canvas} />
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>The rainbow in the sky</h2>
          <canvas role="img" aria-label="The rainbow in the sky" ref={skyCanvas} width={1200} height={540} style={styles.canvas} />
        </section>

        {data && (
          <>
            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Bow angle for each colour</h2>

              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Colour</th>
                      <th style={styles.th}>Wavelength</th>
                      <th style={styles.th}>n</th>
                      <th style={styles.th}>Primary bow</th>
                      <th style={styles.th}>Secondary bow</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.primary.map((row, i) => (
                      <tr key={row.wavelength_nm}>
                        <td style={styles.td}>
                          <span
                            style={{
                              display: "inline-block",
                              width: 18,
                              height: 18,
                              borderRadius: 4,
                              background: row.color,
                              border: "1px solid var(--border-strong)",
                              verticalAlign: "middle",
                            }}
                          />
                        </td>
                        <td style={styles.td}>{fmt(row.wavelength_nm, 0)} nm</td>
                        <td style={styles.td}>{row.n.toFixed(4)}</td>
                        <td style={styles.td}>{fmt(row.angle, 2)}°</td>
                        <td style={styles.td}>
                          {data.secondary[i] ? `${fmt(data.secondary[i].angle, 2)}°` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Physics</h2>
              <p>At the surface: sin i = n sin r, where i is the angle of incidence and r the refraction angle (b = sin i for a drop of radius 1).</p>
              <p>
                With k reflections inside the drop the total deviation is
                D = k·180° + 2i − 2(k + 1)r. You look for the bow in the
                direction θ = |180° − D| away from the anti-solar point.
              </p>
              <p>
                Different rays are turned through different angles, but near
                the minimum of D the angle barely changes, so many rays leave in
                almost the same direction and the sky is bright there. That
                stationary point satisfies cos²i = (n² − 1) / (k(k + 2)). For
                water this gives the primary bow at 42° and the secondary bow at
                51°.
              </p>
              <p>
                Violet has a larger n than red, so each colour has its own bow
                angle. In the primary bow red is on the outside. In the
                secondary bow the extra reflection reverses the order, so red is
                on the inside.
              </p>
              <p>
                No light reaches the sky between the bows (Alexander&apos;s dark
                band). The secondary bow is fainter because every reflection
                loses light: each path carries the fraction (1 − R)² Rᵏ, where R
                is the Fresnel reflectance of the water surface.
              </p>
              <p>
                A ray inside the drop always meets the surface at an angle below
                the critical angle ({fmt(data.critical_angle, 1)}° for this
                liquid), so it never suffers total internal reflection and
                always escapes.
              </p>
              <p>
                <strong>Model:</strong> geometric optics. It does not include
                the faint extra bands just inside the primary bow that wave
                optics (Airy theory) predicts, and it assumes unpolarised light.
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
    verticalAlign: "middle",
  },
};
