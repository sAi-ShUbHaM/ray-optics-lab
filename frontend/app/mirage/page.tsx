"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme } from "@/lib/canvasTheme";
import {
  drawAirColumn,
  drawObserverView,
  drawRays,
  fmt,
  type MirageResult,
} from "./drawing";

const API = "http://127.0.0.1:8000/simulate/mirage";

type Scenario = {
  label: string;
  observer: number;
  distance: number; // metres
  objectHeight: number;
  airTemp: number;
  surfaceTemp: number;
  layer: number; // metres
  inversion: number;
  inversionHeight: number;
  inversionThickness: number;
};

const SCENARIOS: Scenario[] = [
  { label: "Hot road: inferior mirage", observer: 1.7, distance: 3000, objectHeight: 12, airTemp: 25, surfaceTemp: 65, layer: 0.15, inversion: 0, inversionHeight: 25, inversionThickness: 4 },
  { label: "Normal day: no mirage", observer: 1.7, distance: 2000, objectHeight: 12, airTemp: 20, surfaceTemp: 20, layer: 0.15, inversion: 0, inversionHeight: 25, inversionThickness: 4 },
  { label: "Ordinary air: a ship below the horizon", observer: 8, distance: 30000, objectHeight: 25, airTemp: 15, surfaceTemp: 15, layer: 0.15, inversion: 0, inversionHeight: 25, inversionThickness: 4 },
  { label: "Cold sea: the ship is raised", observer: 8, distance: 30000, objectHeight: 25, airTemp: 18, surfaceTemp: 6, layer: 40, inversion: 0, inversionHeight: 25, inversionThickness: 4 },
  { label: "Cold sea: a ship brought into view", observer: 8, distance: 45000, objectHeight: 25, airTemp: 18, surfaceTemp: 6, layer: 15, inversion: 0, inversionHeight: 25, inversionThickness: 4 },
  { label: "Temperature inversion: Fata Morgana", observer: 8, distance: 25000, objectHeight: 25, airTemp: 15, surfaceTemp: 15, layer: 0.15, inversion: 10, inversionHeight: 25, inversionThickness: 4 },
];

function distanceText(metres: number): string {
  return metres >= 1000 ? `${fmt(metres / 1000, 1)} km` : `${fmt(metres, 0)} m`;
}

export default function MiragePage() {
  const { theme } = useTheme();
  const rayCanvas = useRef<HTMLCanvasElement | null>(null);
  const viewCanvas = useRef<HTMLCanvasElement | null>(null);
  const airCanvas = useRef<HTMLCanvasElement | null>(null);

  const first = SCENARIOS[0];

  const [observer, setObserver] = useState(first.observer);
  const [distanceExp, setDistanceExp] = useState(Math.log10(first.distance));
  const [objectHeight, setObjectHeight] = useState(first.objectHeight);
  const [airTemp, setAirTemp] = useState(first.airTemp);
  const [surfaceTemp, setSurfaceTemp] = useState(first.surfaceTemp);
  const [layerExp, setLayerExp] = useState(Math.log10(first.layer));
  const [lapse, setLapse] = useState(6.5);
  const [inversion, setInversion] = useState(first.inversion);
  const [inversionHeight, setInversionHeight] = useState(first.inversionHeight);
  const [inversionThickness, setInversionThickness] = useState(first.inversionThickness);
  const [curvature, setCurvature] = useState(true);
  const [rayCount, setRayCount] = useState(21);
  const [fanScale, setFanScale] = useState(1);

  const [data, setData] = useState<MirageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const distance = Math.pow(10, distanceExp);
  const layer = Math.pow(10, layerExp);

  const body = JSON.stringify({
    observer_height: observer,
    object_distance: Number(distance.toFixed(2)),
    object_height: objectHeight,
    air_temperature: airTemp,
    surface_temperature: surfaceTemp,
    layer_thickness: Number(layer.toFixed(3)),
    lapse_rate: lapse,
    inversion_strength: inversion,
    inversion_height: inversionHeight,
    inversion_thickness: inversionThickness,
    earth_curvature: curvature,
    ray_count: rayCount,
    fan_scale: fanScale,
  });

  useEffect(() => {
    const controller = new AbortController();

    // Wait a moment so that dragging a slider does not queue up many heavy calculations.
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

        const result: MirageResult = await response.json();

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
    if (!data) return;

    const jobs: [HTMLCanvasElement | null, typeof drawRays][] = [
      [rayCanvas.current, drawRays],
      [viewCanvas.current, drawObserverView],
      [airCanvas.current, drawAirColumn],
    ];

    setCanvasTheme(theme);
    for (const [canvas, draw] of jobs) {
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) draw(ctx, canvas, data);
    }
  }, [data, theme]);

  function applyScenario(label: string) {
    const s = SCENARIOS.find((x) => x.label === label);
    if (!s) return;

    setObserver(s.observer);
    setDistanceExp(Math.log10(s.distance));
    setObjectHeight(s.objectHeight);
    setAirTemp(s.airTemp);
    setSurfaceTemp(s.surfaceTemp);
    setLayerExp(Math.log10(s.layer));
    setInversion(s.inversion);
    setInversionHeight(s.inversionHeight);
    setInversionThickness(s.inversionThickness);
    setLapse(6.5);
    setCurvature(true);
    setFanScale(1);
  }

  const layerActive = Math.abs(surfaceTemp - airTemp) > 0.01;

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
        >Mirages</h1>

        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          Light bends towards the denser, cooler air. Over a hot road that
          makes distant objects appear to have a reflection (an inferior
          mirage). Over cold water, or under a layer of warm air, it lifts
          distant ships into view and can stack several images of them (a
          superior mirage, or Fata Morgana).
        </p>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Scene</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Example
              <select
                defaultValue=""
                onChange={(e) => applyScenario(e.target.value)}
                style={styles.select}
              >
                <option value="" disabled>
                  Choose an example...
                </option>
                {SCENARIOS.map((s) => (
                  <option key={s.label} value={s.label}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={styles.label}>
              Observer height: {observer.toFixed(1)} m
              <input
                type="range"
                min="0.5"
                max="60"
                step="0.5"
                value={observer}
                onChange={(e) => setObserver(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Distance to the object: {distanceText(distance)}
              <input
                type="range"
                min="2"
                max="5"
                step="0.01"
                value={distanceExp}
                onChange={(e) => setDistanceExp(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Object height: {objectHeight} m
              <input
                type="range"
                min="1"
                max="200"
                step="1"
                value={objectHeight}
                onChange={(e) => setObjectHeight(Number(e.target.value))}
              />
            </label>

            <label style={{ ...styles.label, flexDirection: "row", alignItems: "center" }}>
              <input
                type="checkbox"
                checked={curvature}
                onChange={(e) => setCurvature(e.target.checked)}
              />
              Include the curvature of the Earth
            </label>
          </div>
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Air</h2>

          <div style={styles.controls}>
            <label style={styles.label}>
              Air temperature (away from the surface): {airTemp} °C
              <input
                type="range"
                min="-20"
                max="40"
                step="1"
                value={airTemp}
                onChange={(e) => setAirTemp(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Surface temperature: {surfaceTemp} °C
              <span style={{ fontWeight: "normal", color: "var(--text-secondary)" }}>
                {surfaceTemp > airTemp + 0.01
                  ? "(hot ground: air thins out near it)"
                  : surfaceTemp < airTemp - 0.01
                  ? "(cold surface: air is denser near it)"
                  : "(same as the air: no surface layer)"}
              </span>
              <input
                type="range"
                min="-10"
                max="80"
                step="1"
                value={surfaceTemp}
                onChange={(e) => setSurfaceTemp(Number(e.target.value))}
              />
            </label>

            <label style={{ ...styles.label, opacity: layerActive ? 1 : 0.5 }}>
              Thickness of the surface layer: {fmt(layer, layer < 1 ? 2 : 1)} m
              <input
                type="range"
                min="-1.5"
                max="1.8"
                step="0.01"
                value={layerExp}
                disabled={!layerActive}
                onChange={(e) => setLayerExp(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Temperature fall with height: {lapse.toFixed(1)} K per km
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={lapse}
                onChange={(e) => setLapse(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Temperature inversion (warmer air above): {inversion} K
              <input
                type="range"
                min="0"
                max="20"
                step="1"
                value={inversion}
                onChange={(e) => setInversion(Number(e.target.value))}
              />
            </label>

            <label style={{ ...styles.label, opacity: inversion > 0 ? 1 : 0.5 }}>
              Inversion height: {inversionHeight} m
              <input
                type="range"
                min="5"
                max="300"
                step="1"
                value={inversionHeight}
                disabled={inversion === 0}
                onChange={(e) => setInversionHeight(Number(e.target.value))}
              />
            </label>

            <label style={{ ...styles.label, opacity: inversion > 0 ? 1 : 0.5 }}>
              Inversion sharpness (thickness): {inversionThickness} m
              <input
                type="range"
                min="1"
                max="60"
                step="1"
                value={inversionThickness}
                disabled={inversion === 0}
                onChange={(e) => setInversionThickness(Number(e.target.value))}
              />
            </label>
          </div>

          <div style={styles.controls}>
            <label style={styles.label}>
              Rays drawn: {rayCount}
              <input
                type="range"
                min="9"
                max="41"
                step="2"
                value={rayCount}
                onChange={(e) => setRayCount(Number(e.target.value))}
              />
            </label>

            <label style={styles.label}>
              Width of the fan of rays: ×{fanScale.toFixed(1)}
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={fanScale}
                onChange={(e) => setFanScale(Number(e.target.value))}
              />
            </label>
          </div>

          {loading && <p>Tracing rays...</p>}
          {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        </section>

        {data && (
          <section
            style={{
              ...styles.panel,
              marginTop: 20,
              borderLeft: "6px solid var(--data-violet)",
            }}
          >
            <h2 style={{ ...styles.heading, marginBottom: 8 }}>What the observer sees</h2>
            <p style={{ fontSize: 18, margin: 0 }}>{data.description}</p>
          </section>
        )}

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Rays from the observer&apos;s eye</h2>
          <canvas role="img" aria-label="Rays from the observer's eye" ref={rayCanvas} width={1200} height={620} style={styles.canvas} />
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>The view, in elevation angle</h2>
          <canvas role="img" aria-label="The view, in elevation angle" ref={viewCanvas} width={1200} height={560} style={styles.canvas} />
        </section>

        {data && (
          <>
            <section style={styles.results}>
              <ResultCard title="Images seen" value={`${data.images.length}  (${data.pattern || "none"})`} />
              <ResultCard
                title="Images in ordinary air"
                value={String(data.ordinary_air_image_count)}
              />
              <ResultCard
                title="Raised compared with ordinary air"
                value={
                  data.displacement_arcmin === null
                    ? "—"
                    : `${fmt(data.displacement_arcmin, 2)}′`
                }
              />
              <ResultCard
                title="Raised compared with straight light"
                value={
                  data.displacement_straight_arcmin === null
                    ? "—"
                    : `${fmt(data.displacement_straight_arcmin, 2)}′`
                }
              />
              <ResultCard
                title="Geometric horizon distance"
                value={
                  data.geometric.horizon_distance_km === null
                    ? "—"
                    : `${fmt(data.geometric.horizon_distance_km, 1)} km`
                }
              />
              <ResultCard
                title="Dip of the geometric horizon"
                value={`${fmt(data.geometric.horizon_dip_deg, 3)}°`}
              />
              <ResultCard
                title="Steepest ray that can turn back up"
                value={
                  data.critical_angle_deg === null ? "—" : `${fmt(data.critical_angle_deg, 3)}°`
                }
              />
              <ResultCard
                title="Rays traced / steps"
                value={`${data.fan.samples} / ${data.fan.steps}`}
              />
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>The images</h2>

              {data.images.length === 0 ? (
                <p>No ray from the observer lands on the object, so nothing is seen.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>Orientation</th>
                        <th style={styles.th}>Elevation, bottom to top</th>
                        <th style={styles.th}>Angular height</th>
                        <th style={styles.th}>Size compared with the object</th>
                        <th style={styles.th}>Part of the object seen</th>
                        <th style={styles.th}>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.images.map((image, i) => (
                        <tr key={i}>
                          <td style={styles.td}>{i + 1}</td>
                          <td style={styles.td}>
                            <span
                              style={{
                                fontWeight: "bold",
                                color: image.orientation === "Upright" ? "var(--data-orange)" : "var(--data-violet)",
                              }}
                            >
                              {image.orientation}
                            </span>
                          </td>
                          <td style={styles.td}>
                            {fmt(image.alpha_bottom_deg, 3)}° to {fmt(image.alpha_top_deg, 3)}°
                          </td>
                          <td style={styles.td}>{fmt(image.angular_height_deg * 60, 2)}′</td>
                          <td style={styles.td}>×{fmt(image.magnification, 2)}</td>
                          <td style={styles.td}>
                            {fmt(image.visible_from, 2)} m to {fmt(image.visible_to, 2)} m
                            ({fmt(image.visible_fraction * 100, 0)} %)
                          </td>
                          <td style={styles.td}>
                            {[
                              image.fold ? "fold: the part beyond is hidden" : "",
                              !image.fold && image.bottom_cut ? "lower part hidden by the horizon" : "",
                              !image.fold && image.top_cut ? "upper part hidden" : "",
                              image.fan_edge ? "touches the edge of the fan: widen it" : "",
                            ]
                              .filter(Boolean)
                              .join("; ") || "complete"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>The air</h2>
              <canvas role="img" aria-label="The air" ref={airCanvas} width={1200} height={420} style={styles.canvas} />
            </section>

            <section style={{ ...styles.panel, marginTop: 20 }}>
              <h2 style={styles.heading}>Physics</h2>
              <p>
                The refractive index of air depends on its density: n − 1 ≈
                0.0844 / T (T in kelvin, at sea-level pressure), about
                0.000293 at 15 °C. Warmer air is thinner and has a lower n.
              </p>
              <p>
                In air that is layered in height, a ray obeys Snell&apos;s law
                in the form n(y) cos θ = constant, where θ is its angle above
                the horizontal. Equivalently dθ/dx = n′(y)/n(y): a ray always
                bends towards the higher index, that is towards the cooler air.
              </p>
              <p>
                <strong>Hot ground:</strong> n rises with height, so rays curve
                upward. A ray that heads down into the thin air near the ground
                can turn back up before it reaches the surface and arrive at
                the eye from below, which is the inverted image under the
                object. It can only turn around if it is shallower than the
                critical angle cos θ_c = n(ground)/n(eye).
              </p>
              <p>
                <strong>Cold surface or warm layer above:</strong> n falls with
                height, so rays curve downward, following (or even beating) the
                curve of the Earth. Light from beyond the ordinary horizon
                can then reach the eye, and the object appears raised. If
                dn/dy is more negative than −1/R (R is the Earth&apos;s radius,
                the red line in the air graphs) light can be trapped in a duct.
              </p>
              <p>
                Over distances of many kilometres the Earth falls away from a
                straight line by x²/(2R). The model includes this with the
                standard flat-Earth transformation, replacing n with n(1 + y/R),
                which is why the rays in the first diagram curve even when
                the air is uniform.
              </p>
              <p>
                <strong>How the images are found:</strong> many rays are
                launched from the eye over a range of angles. For each angle
                the page records the height at which the ray arrives at the
                object&apos;s distance. Wherever that height lies between the
                ground and the top of the object, the observer sees the object
                along that direction. If the arrival height rises with the angle
                the image is upright, if it falls the image is inverted. Where
                the arrival height has a minimum or maximum, two images meet at
                a fold, and the part of the object beyond the fold cannot be
                seen.
              </p>
              <p>
                A mirage is a departure from ordinary air, so everything is
                compared with the same scene through air with the same
                temperature and lapse rate but no surface layer and no
                inversion.
              </p>
              <p>
                <strong>Model limits:</strong> the air is assumed to be the same
                everywhere along the line of sight, the surface absorbs any
                ray that touches it (so there are no images made by bouncing
                off the water), and the model is geometric optics, so it
                does not show shimmer, turbulence or colour fringes.
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
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
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
