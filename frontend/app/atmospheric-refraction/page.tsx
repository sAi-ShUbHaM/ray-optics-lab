"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "../components/ThemeProvider";
import { API_BASE } from "@/lib/config";
import { setCanvasTheme } from "@/lib/canvasTheme";
import {
  drawPath,
  drawRefractionCurve,
  drawSun,
  fmt,
  type RefractionResult,
} from "./drawing";

const API = `${API_BASE}/simulate/atmospheric-refraction`;

type Preset = {
  label: string;
  temperature: number;
  pressure: number;
  observerHeight: number;
};

const PRESETS: Preset[] = [
  { label: "Standard day (10 °C, 1010 hPa)", temperature: 10, pressure: 1010, observerHeight: 0 },
  { label: "Cold winter morning (−20 °C, 1030 hPa)", temperature: -20, pressure: 1030, observerHeight: 0 },
  { label: "Hot desert afternoon (45 °C, 1000 hPa)", temperature: 45, pressure: 1000, observerHeight: 0 },
  { label: "Mountain top, 3 km (0 °C, 700 hPa)", temperature: 0, pressure: 700, observerHeight: 3000 },
  { label: "High mountain, 5 km (−15 °C, 540 hPa)", temperature: -15, pressure: 540, observerHeight: 5000 },
];

const TABLE_ALTITUDES = [0, 0.5, 1, 2, 3, 5, 10, 20, 30, 45, 60, 75];

export default function AtmosphericRefractionPage() {
  const { theme } = useTheme();
  const curveCanvas = useRef<HTMLCanvasElement | null>(null);
  const pathCanvas = useRef<HTMLCanvasElement | null>(null);
  const sunCanvas = useRef<HTMLCanvasElement | null>(null);

  const [altitude, setAltitude] = useState(10);
  const [temperature, setTemperature] = useState(10);
  const [pressure, setPressure] = useState(1010);
  const [lapse, setLapse] = useState(6.5);
  const [tropopause, setTropopause] = useState(11);
  const [observerHeight, setObserverHeight] = useState(0);
  const [sunAltitude, setSunAltitude] = useState(0);
  const [latitude, setLatitude] = useState(45);

  const [data, setData] = useState<RefractionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const body = JSON.stringify({
    apparent_altitude: altitude,
    temperature,
    pressure,
    lapse_rate: lapse,
    tropopause_height: tropopause,
    observer_height: observerHeight,
    sun_true_altitude: sunAltitude,
    latitude,
  });

  useEffect(() => {
    const controller = new AbortController();

    // Wait a moment so that dragging a slider does not queue up many calculations.
    const timer = setTimeout(async () => {
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

        const result: RefractionResult = await response.json();

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
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [body]);

  useEffect(() => {
    setCanvasTheme(theme);
    if (!data) return;

    const jobs: [HTMLCanvasElement | null, typeof drawSun][] = [
      [curveCanvas.current, drawRefractionCurve],
      [pathCanvas.current, drawPath],
      [sunCanvas.current, drawSun],
    ];

    for (const [canvas, draw] of jobs) {
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) draw(ctx, canvas, data);
    }
  }, [data, theme]);

  function applyPreset(label: string) {
    const p = PRESETS.find((x) => x.label === label);
    if (!p) return;
    setTemperature(p.temperature);
    setPressure(p.pressure);
    setObserverHeight(p.observerHeight);
    setLapse(6.5);
    setTropopause(11);
  }

  const tableRows = data
    ? TABLE_ALTITUDES.map((a) =>
        data.curve.find((point) => Math.abs(point.apparent_altitude - a) < 1e-6)
      ).filter((row): row is NonNullable<typeof row> => row !== undefined)
    : [];

  return (
    <main style={styles.page}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(1.625rem, 1.2rem + 1.4vw, 2.125rem)", fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 8, color: "var(--text)" }}>Atmospheric Refraction</h1>

        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          Starlight and sunlight bend as they pass through the whole depth of
          the atmosphere. Because the air thins out with height, every ray
          curves towards the ground, so every object looks higher than it
          really is. Near the horizon the lift is about 34 arcminutes, more
          than the whole diameter of the Sun.
        </p>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Where you are looking</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Apparent altitude of the object: {altitude.toFixed(1)}°
              <input
                type="range"
                min="0"
                max="90"
                step="0.1"
                value={altitude}
                onChange={(e) => setAltitude(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Sun&apos;s true altitude (its centre, without air): {sunAltitude.toFixed(2)}°
              <input
                type="range"
                min="-1.5"
                max="6"
                step="0.01"
                value={sunAltitude}
                onChange={(e) => setSunAltitude(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Latitude (for the sunset delay): {latitude}°
              <input
                type="range"
                min="0"
                max="70"
                step="1"
                value={latitude}
                onChange={(e) => setLatitude(Number(e.target.value))}
              />
            </label>
          </div>
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>The air at the observer</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Example
              <select
                defaultValue=""
                onChange={(e) => applyPreset(e.target.value)}
                style={styles.select}
              >
                <option value="" disabled>
                  Choose an example...
                </option>
                {PRESETS.map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Temperature: {temperature} °C
              <input
                type="range"
                min="-50"
                max="50"
                step="1"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Pressure: {pressure} hPa
              <input
                type="range"
                min="400"
                max="1100"
                step="5"
                value={pressure}
                onChange={(e) => setPressure(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Height of the observer: {observerHeight} m
              <span style={{ fontWeight: "normal", color: "var(--text-secondary)" }}>
                (temperature and pressure above are measured here)
              </span>
              <input
                type="range"
                min="0"
                max="9000"
                step="50"
                value={observerHeight}
                onChange={(e) => setObserverHeight(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Temperature fall with height: {lapse.toFixed(1)} K per km
              <input
                type="range"
                min="0"
                max="12"
                step="0.1"
                value={lapse}
                onChange={(e) => setLapse(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Height of the tropopause: {tropopause.toFixed(1)} km
              <input
                type="range"
                min="6"
                max="18"
                step="0.5"
                value={tropopause}
                onChange={(e) => setTropopause(Number(e.target.value))}
              />
            </label>
          </div>

          {loading && <p>Integrating the ray...</p>}
          {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        </section>

        {data && (
          <section style={styles.results}>
            <ResultCard
              title="Refraction at this altitude"
              value={`${fmt(data.selected.refraction_arcmin, 2)}′  (${fmt(
                data.selected.refraction_arcsec,
                0
              )}″)`}
            />
            <ResultCard
              title="True altitude (without air)"
              value={`${fmt(data.selected.true_altitude, 3)}°`}
            />
            <ResultCard
              title="Bennett's empirical formula"
              value={`${fmt(data.selected.bennett_arcmin, 2)}′`}
            />
            <ResultCard
              title="Refraction at the horizon"
              value={`${fmt(data.horizon_refraction_arcmin, 2)}′`}
            />
            <ResultCard
              title="Blue minus red at the horizon"
              value={`${fmt(data.horizon_dispersion_arcmin, 2)}′`}
            />
            <ResultCard
              title="Flattening of the Sun"
              value={data.sun.flattening === null ? "—" : fmt(data.sun.flattening, 3)}
            />
            <ResultCard
              title="Sunset is delayed by"
              value={`${fmt(data.sun.sunset.delay_minutes, 1)} min`}
            />
            <ResultCard
              title="Extra daylight (sunrise and sunset)"
              value={`${fmt(data.sun.sunset.extra_daylight_minutes, 1)} min`}
            />
            <ResultCard
              title="Half of the bending happens below"
              value={
                data.bending.half_height_km === null
                  ? "—"
                  : `${fmt(data.bending.half_height_km, 1)} km`
              }
            />
          </section>
        )}

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>How much the atmosphere lifts an object</h2>
          <canvas role="img" aria-label="Graph of refraction against the apparent altitude of the object" ref={curveCanvas} width={1200} height={430} style={styles.canvas} />
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>The path of the light, and where it bends</h2>
          <canvas role="img" aria-label="Path of the light through the atmosphere and where it bends" ref={pathCanvas} width={1200} height={480} style={styles.canvas} />
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>The Sun at the horizon</h2>
          <canvas role="img" aria-label="The Sun at the horizon, as seen through the air and without it" ref={sunCanvas} width={1200} height={520} style={styles.canvas} />
        </section>

        {data && (
          <>
            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Refraction table for these conditions</h2>

              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Apparent altitude</th>
                      <th style={styles.th}>True altitude</th>
                      <th style={styles.th}>Refraction (model)</th>
                      <th style={styles.th}>Bennett&apos;s formula</th>
                      <th style={styles.th}>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row) => (
                      <tr key={row.apparent_altitude}>
                        <td style={styles.td}>{fmt(row.apparent_altitude, 1)}°</td>
                        <td style={styles.td}>{fmt(row.true_altitude, 3)}°</td>
                        <td style={styles.td}>{fmt(row.refraction_arcmin, 3)}′</td>
                        <td style={styles.td}>{fmt(row.bennett_arcmin, 3)}′</td>
                        <td style={styles.td}>
                          {fmt(row.refraction_arcmin - row.bennett_arcmin, 3)}′
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Colour: blue light is refracted more than red</h2>

              <div style={{ overflowX: "auto" }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Colour</th>
                      <th style={styles.th}>Wavelength</th>
                      <th style={styles.th}>(n − 1) × 10⁶ at the observer</th>
                      <th style={styles.th}>
                        Refraction at {fmt(data.selected.apparent_altitude, 1)}°
                      </th>
                      <th style={styles.th}>Compared with 589 nm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.dispersion.map((row) => (
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
                        <td style={styles.td}>{fmt(row.refractivity_e6, 2)}</td>
                        <td style={styles.td}>{fmt(row.refraction_arcmin, 3)}′</td>
                        <td style={styles.td}>
                          {row.offset_arcsec >= 0 ? "+" : ""}
                          {fmt(row.offset_arcsec, 2)}″
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Physics</h2>
              <p>
                The refractive index of air depends on its density. Edlén&apos;s
                formula gives n − 1 = 0.000277 at 15 °C and sea-level pressure
                (0.000292 at 0 °C), and n − 1 is proportional to the pressure
                and inversely proportional to the absolute temperature. At the
                observer here n − 1 = {fmt(data.air.refractivity_at_observer_e6, 1)} × 10⁻⁶.
              </p>
              <p>
                The air is layered in spheres around the Earth. For a ray at
                radius r with index n and angle z from the vertical, Snell&apos;s
                law reads n · r · sin z = constant. The total bending between
                space and the observer is R = ∫ tan z d(ln n), and the true
                zenith distance is the apparent one plus R.
              </p>
              <p>
                High in the sky this reduces to R = (n − 1) tan z, about 58″ ×
                tan z in standard air (the dotted curve). That fails near the
                horizon, where the real value levels off at about 34′ and the
                flat-atmosphere formula would blow up.
              </p>
              <p>
                Refraction at the horizon is slightly more than the Sun&apos;s own
                diameter (about 32′). So when the lower edge of the Sun seems to
                touch the horizon, the whole Sun has already set geometrically.
                Sunrise and sunset therefore happen about 2 to 5 minutes later
                or earlier than geometry says (more at high latitude, where the
                Sun moves along a shallower path), and the day is a few minutes
                longer. Almanacs use −50′ for the Sun&apos;s centre at sunrise and
                sunset: 34′ of refraction plus 16′ for the Sun&apos;s radius.
              </p>
              <p>
                The lower edge of the Sun is lifted more than the upper edge, so
                near the horizon the Sun looks flattened. Its width is not
                changed, because refraction only moves things vertically.
              </p>
              <p>
                High in the sky the refraction is proportional to the density of
                the air at the observer, so it is proportional to P/T. At the
                horizon it depends more strongly on the temperature, roughly as
                P · T<sup>−3/2</sup>, because colder air also has a smaller scale
                height. That is why the Sun is flatter on a cold winter evening.
              </p>
              <p>
                Most of the bending happens low down. The graph on the right in
                the second figure shows that half of it occurs in the first{" "}
                {data.bending.half_height_km === null ? "few" : fmt(data.bending.half_height_km, 1)}{" "}
                km of the ray&apos;s climb. An observer on a mountain has less air
                above, so sees less refraction.
              </p>
              <p>
                Because n depends on wavelength, blue light is refracted more
                than red, by about {fmt(data.horizon_dispersion_arcmin, 1)}′
                between 400 and 700 nm at the horizon. The upper rim of the
                setting Sun is therefore a stack of coloured edges with blue on
                top. Violet and blue are scattered away by the long path through
                the air, so on a very clear evening the top rim that survives is
                green: the green flash.
              </p>
              <p>
                <strong>Comparison with Bennett&apos;s formula:</strong> Bennett&apos;s
                formula is an empirical fit to observations. This page is
                calculated from the refractivity of dry air, and gives values
                about 2 % lower. The two agree to about 0.1′ above 2° altitude
                and to within 1′ at the horizon.
              </p>
              <p>
                <strong>Model limits:</strong> dry air in a standard layered
                atmosphere (temperature falling linearly to the tropopause, then
                constant), the same everywhere around the Earth. Humidity,
                inversions and turbulence are ignored: the Mirage page shows
                what changes the lower air can cause. The object must be at or
                above the apparent horizon.
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
      <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
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
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
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
  canvas: {
    display: "block",
    width: "100%",
    height: "auto",
    border: "1px solid var(--border)",
    borderRadius: 8,
  },
  results: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
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
