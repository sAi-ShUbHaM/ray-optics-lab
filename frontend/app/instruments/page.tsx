"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { API_BASE } from "@/lib/config";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme } from "@/lib/canvasTheme";
import {
  drawMicroscope,
  drawTelescope,
  fmt,
  type MicroscopeResult,
  type TelescopeResult,
} from "./drawing";

type Tab = "microscope" | "telescope";
type TelescopeKind = "keplerian" | "galilean";
type Focus = "infinity" | "near_point";

const API = `${API_BASE}/simulate`;

// One fetch helper shared by both instruments.
async function postJson<T extends { valid: boolean }>(
  path: string,
  body: string,
  signal: AbortSignal
): Promise<T> {
  const response = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
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

  const result: T = await response.json();

  if (!result.valid) {
    throw new Error("Invalid simulation result.");
  }

  return result;
}

function describeError(err: unknown): string {
  return err instanceof TypeError
    ? "Backend connection failed. Check that FastAPI is running."
    : err instanceof Error
    ? err.message
    : "Unknown error.";
}

export default function InstrumentsPage() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tab, setTab] = useState<Tab>("microscope");

  // ----- microscope inputs -----
  const [mObjective, setMObjective] = useState(3);
  const [mEyepiece, setMEyepiece] = useState(10);
  const [mRatio, setMRatio] = useState(1.2); // object distance = ratio x f_objective
  const [mHeight, setMHeight] = useState(1);
  const [mFocus, setMFocus] = useState<Focus>("infinity");

  // ----- telescope inputs -----
  const [tKind, setTKind] = useState<TelescopeKind>("keplerian");
  const [tObjective, setTObjective] = useState(60);
  const [tEyepiece, setTEyepiece] = useState(6);
  const [tAngle, setTAngle] = useState(3);
  const [tAperture, setTAperture] = useState(4);
  const [tDefocus, setTDefocus] = useState(0);
  const [tRays, setTRays] = useState(3);

  const [micro, setMicro] = useState<MicroscopeResult | null>(null);
  const [tele, setTele] = useState<TelescopeResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const microscopeBody = JSON.stringify({
    objective_focal_length: mObjective,
    eyepiece_focal_length: mEyepiece,
    object_distance: Number((mRatio * mObjective).toFixed(4)),
    object_height: mHeight,
    focus: mFocus,
  });

  const telescopeBody = JSON.stringify({
    kind: tKind,
    objective_focal_length: tObjective,
    eyepiece_focal_length: tEyepiece,
    field_angle: tAngle,
    aperture: tAperture,
    defocus: tDefocus,
    ray_count: tRays,
  });

  useEffect(() => {
    if (tab !== "microscope") return;

    const controller = new AbortController();

    async function run() {
      setLoading(true);
      setError("");

      try {
        setMicro(
          await postJson<MicroscopeResult>("microscope", microscopeBody, controller.signal)
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error(err);
        setError(describeError(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [tab, microscopeBody]);

  useEffect(() => {
    if (tab !== "telescope") return;

    const controller = new AbortController();

    async function run() {
      setLoading(true);
      setError("");

      try {
        setTele(
          await postJson<TelescopeResult>("telescope", telescopeBody, controller.signal)
        );
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error(err);
        setError(describeError(err));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    run();
    return () => controller.abort();
  }, [tab, telescopeBody]);

  useEffect(() => {
    setCanvasTheme(theme);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (tab === "microscope" && micro) drawMicroscope(ctx, canvas, micro);
    if (tab === "telescope" && tele) drawTelescope(ctx, canvas, tele);
  }, [tab, micro, tele, theme]);

  function switchTab(next: Tab) {
    setError("");
    setTab(next);
  }

  return (
    <main style={styles.page}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <h1 style={{ fontSize: "clamp(1.625rem, 1.2rem + 1.4vw, 2.125rem)", fontWeight: 500, letterSpacing: "-0.015em", marginBottom: 8, color: "var(--text)" }}>Optical Instruments</h1>

        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          A compound microscope and a refracting telescope, built from the same
          thin-lens model as the lens combinations.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => switchTab("microscope")}
            style={tab === "microscope" ? styles.tabActive : styles.tab}
          >
            Compound microscope
          </button>
          <button
            type="button"
            onClick={() => switchTab("telescope")}
            style={tab === "telescope" ? styles.tabActive : styles.tab}
          >
            Telescope
          </button>
        </div>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Controls</h2>

          {tab === "microscope" ? (
            <div style={styles.controls}>
              <label style={styles.label}>
                Objective focal length: {mObjective}
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="0.5"
                  value={mObjective}
                  onChange={(e) => setMObjective(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Eyepiece focal length: {mEyepiece}
                <input
                  type="range"
                  min="4"
                  max="20"
                  step="0.5"
                  value={mEyepiece}
                  onChange={(e) => setMEyepiece(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Object distance = {mRatio.toFixed(2)} × f
                <span style={{ fontWeight: "normal", color: "var(--text-secondary)" }}>
                  (= {(mRatio * mObjective).toFixed(2)}, just beyond the
                  objective focus)
                </span>
                <input
                  type="range"
                  min="1.05"
                  max="2"
                  step="0.01"
                  value={mRatio}
                  onChange={(e) => setMRatio(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Object height: {mHeight.toFixed(1)}
                <input
                  type="range"
                  min="0.2"
                  max="2"
                  step="0.1"
                  value={mHeight}
                  onChange={(e) => setMHeight(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Final image
                <select
                  value={mFocus}
                  onChange={(e) => setMFocus(e.target.value as Focus)}
                  style={styles.select}
                >
                  <option value="infinity">At infinity (relaxed eye)</option>
                  <option value="near_point">At the near point (25)</option>
                </select>
              </label>
            </div>
          ) : (
            <div style={styles.controls}>
              <label style={styles.label}>
                Telescope type
                <select
                  value={tKind}
                  onChange={(e) => setTKind(e.target.value as TelescopeKind)}
                  style={styles.select}
                >
                  <option value="keplerian">Keplerian (convex eyepiece)</option>
                  <option value="galilean">Galilean (concave eyepiece)</option>
                </select>
              </label>

              <label style={styles.label}>
                Objective focal length: {tObjective}
                <input
                  type="range"
                  min="20"
                  max="120"
                  step="1"
                  value={tObjective}
                  onChange={(e) => setTObjective(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Eyepiece focal length: {tEyepiece}
                <input
                  type="range"
                  min="3"
                  max="20"
                  step="0.5"
                  value={tEyepiece}
                  onChange={(e) => setTEyepiece(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Angle of the distant object: {tAngle.toFixed(1)}°
                <input
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={tAngle}
                  onChange={(e) => setTAngle(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Objective half-aperture: {tAperture}
                <input
                  type="range"
                  min="2"
                  max="8"
                  step="0.5"
                  value={tAperture}
                  onChange={(e) => setTAperture(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Focus adjustment: {tDefocus.toFixed(2)}
                <span style={{ fontWeight: "normal", color: "var(--text-secondary)" }}>
                  (0 = normal adjustment)
                </span>
                <input
                  type="range"
                  min="-5"
                  max="5"
                  step="0.25"
                  value={tDefocus}
                  onChange={(e) => setTDefocus(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Rays per beam: {tRays}
                <input
                  type="range"
                  min="1"
                  max="9"
                  step="2"
                  value={tRays}
                  onChange={(e) => setTRays(Number(e.target.value))}
                />
              </label>
            </div>
          )}

          {loading && <p>Updating simulation...</p>}
          {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Ray diagram</h2>
          <canvas role="img" aria-label="Ray diagram for the optical instruments simulation"
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

        {tab === "microscope" && micro && <MicroscopeResults data={micro} />}
        {tab === "telescope" && tele && <TelescopeResults data={tele} />}
      </div>
    </main>
  );
}

// ============================================================
// RESULT PANELS
// ============================================================

function MicroscopeResults({ data }: { data: MicroscopeResult }) {
  const ins = data.instrument;
  const exact = ins.focus === "infinity";

  return (
    <>
      <section style={styles.results}>
        <ResultCard title="Objective magnification mₒ" value={fmt(ins.objective_magnification)} />
        <ResultCard title="Eyepiece magnification Mₑ" value={fmt(ins.eyepiece_magnification)} />
        <ResultCard title="Total angular magnification" value={`${fmt(ins.angular_magnification, 1)}×`} />
        <ResultCard title="Final image" value={data.image_type} />
        <ResultCard title="Orientation" value={data.orientation} />
        <ResultCard title="Tube length L" value={fmt(ins.tube_length)} />
        <ResultCard title="Lens separation" value={fmt(ins.separation)} />
        <ResultCard title="(L/fₒ)(D/fₑ)" value={fmt(ins.approx_magnification, 1)} />
      </section>

      <section style={{ ...styles.panel, marginTop: 20 }}>
        <h2 style={styles.heading}>Physics</h2>
        <p>Objective: 1/v − 1/u = 1/fₒ, lateral magnification mₒ = v/u (negative: inverted).</p>
        <p>
          Eyepiece used as a magnifier: Mₑ = D/fₑ with the final image at
          infinity, or 1 + D/fₑ with the final image at the near point D.
        </p>
        <p>Total angular magnification: M = |mₒ| × Mₑ.</p>
        <p>
          Tube length L is the gap between the objective&apos;s inner focal
          point and the eyepiece&apos;s inner focal point (separation − fₒ − fₑ).
          {exact
            ? " With the final image at infinity, (L/fₒ)(D/fₑ) equals the exact magnification, so the two cards above match."
            : " At the near point the formula (L/fₒ)(D/fₑ) is only approximate, which is why it differs from the exact total above."}
        </p>
        <p>
          The eyepiece position is set for you so the final image lands where
          you chose. The model uses thin lenses and paraxial rays, so lens
          sizes in the diagram are not to scale.
        </p>
      </section>
    </>
  );
}

function TelescopeResults({ data }: { data: TelescopeResult }) {
  const pupil = data.exit_pupil;
  const M = data.angular_magnification;

  return (
    <>
      <section style={styles.results}>
        <ResultCard title="Angular magnification" value={`${fmt(M, 2)}×`} />
        <ResultCard title="Image orientation" value={data.orientation} />
        <ResultCard title="Tube length (lens separation)" value={fmt(data.tube_length)} />
        <ResultCard title="Exit angle" value={`${fmt(data.exit_angle, 2)}°`} />
        <ResultCard
          title="Exit pupil diameter"
          value={pupil.diameter === null ? "—" : fmt(pupil.diameter)}
        />
        <ResultCard
          title="Eye relief (exit pupil)"
          value={
            pupil.distance_from_eyepiece === null
              ? "—"
              : pupil.real
              ? fmt(pupil.distance_from_eyepiece)
              : "Virtual pupil"
          }
        />
        <ResultCard
          title="Intermediate image height"
          value={data.intermediate_image ? fmt(data.intermediate_image.height) : "—"}
        />
        <ResultCard
          title="Final image"
          value={data.final_image.at_infinity ? "At infinity" : data.final_image.kind}
        />
      </section>

      <section style={{ ...styles.panel, marginTop: 20 }}>
        <h2 style={styles.heading}>Physics</h2>
        <p>
          A distant object is a set of parallel rays arriving at a small angle
          θ. The objective brings them to a focus in its focal plane, forming an
          intermediate image of height fₒ tan θ.
        </p>
        <p>
          Normal adjustment: separation = fₒ + fₑ, so the intermediate image
          sits at the eyepiece&apos;s focal point and the light leaves parallel.
          Angular magnification M = θ′/θ = −fₒ/fₑ (Keplerian, inverted) or
          +fₒ/|fₑ| (Galilean, upright).
        </p>
        <p>
          Exit pupil diameter = objective diameter / |M|. The Keplerian
          telescope has a real exit pupil just behind the eyepiece where the eye
          goes. The Galilean telescope has no real exit pupil.
        </p>
        <p>
          Move the focus adjustment away from 0 and the light no longer leaves
          parallel: a finite final image appears and the angular magnification
          is that of the chief ray.
        </p>
      </section>
    </>
  );
}

function ResultCard({ title, value }: { title: string; value: string }) {
  return (
    <div style={styles.card}>
      <div style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 7 }}>{title}</div>
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
  tab: {
    padding: "10px 18px",
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--surface)",
    color: "var(--text)",
    cursor: "pointer",
  },
  tabActive: {
    padding: "10px 18px",
    border: "1px solid var(--text)",
    borderRadius: 8,
    background: "var(--text)",
    color: "var(--bg)",
    cursor: "pointer",
    fontWeight: "bold",
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
