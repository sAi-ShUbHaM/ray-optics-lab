"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { API_BASE } from "@/lib/config";
import { useTheme } from "../components/ThemeProvider";
import { setCanvasTheme } from "@/lib/canvasTheme";
import {
  drawApparentDepth,
  drawSlab,
  fmt,
  type ApparentDepthResult,
  type SlabResult,
} from "./drawing";

type Tab = "slab" | "depth";

const API = `${API_BASE}/simulate`;

type SlabScenario = {
  label: string;
  angle: number;
  thickness: number;
  nSlab: number;
  nIn: number;
  nOut: number | null; // null = same medium on both sides
};

const SLAB_SCENARIOS: SlabScenario[] = [
  { label: "Glass slab in air", angle: 40, thickness: 6, nSlab: 1.5, nIn: 1.0, nOut: null },
  { label: "Normal incidence (no shift)", angle: 0, thickness: 6, nSlab: 1.5, nIn: 1.0, nOut: null },
  { label: "Thick high-index slab, steep angle", angle: 75, thickness: 12, nSlab: 2.4, nIn: 1.0, nOut: null },
  { label: "Total internal reflection at the entry face", angle: 60, thickness: 4, nSlab: 1.2, nIn: 1.5, nOut: null },
  { label: "Water, glass, air: reflected at the exit face", angle: 60, thickness: 4, nSlab: 1.5, nIn: 1.33, nOut: 1.0 },
];

type DepthScenario = {
  label: string;
  depth: number;
  nBelow: number;
  nAbove: number;
  maxAngle: number;
};

const DEPTH_SCENARIOS: DepthScenario[] = [
  { label: "Coin at the bottom of water", depth: 10, nBelow: 1.33, nAbove: 1.0, maxAngle: 45 },
  { label: "Object inside a glass block", depth: 10, nBelow: 1.5, nAbove: 1.0, maxAngle: 40 },
  { label: "Diamond (strong effect)", depth: 10, nBelow: 2.42, nAbove: 1.0, maxAngle: 20 },
  { label: "Seeing total internal reflection", depth: 10, nBelow: 1.33, nAbove: 1.0, maxAngle: 65 },
  { label: "Bird seen from under water", depth: 10, nBelow: 1.0, nAbove: 1.33, maxAngle: 50 },
];

// One fetch helper shared by both simulations.
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

export default function SlabPage() {
  const { theme } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [tab, setTab] = useState<Tab>("slab");

  // ----- glass slab inputs -----
  const [angle, setAngle] = useState(40);
  const [thickness, setThickness] = useState(6);
  const [nSlab, setNSlab] = useState(1.5);
  const [nIn, setNIn] = useState(1.0);
  const [sameMedia, setSameMedia] = useState(true);
  const [nOut, setNOut] = useState(1.0);
  const [beam, setBeam] = useState(3);

  // ----- apparent depth inputs -----
  const [depth, setDepth] = useState(10);
  const [nBelow, setNBelow] = useState(1.33);
  const [nAbove, setNAbove] = useState(1.0);
  const [maxAngle, setMaxAngle] = useState(45);
  const [rayCount, setRayCount] = useState(7);

  const [slab, setSlab] = useState<SlabResult | null>(null);
  const [apparent, setApparent] = useState<ApparentDepthResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const slabBody = JSON.stringify({
    incident_angle: angle,
    thickness,
    n_slab: nSlab,
    n_in: nIn,
    n_out: sameMedia ? null : nOut,
    ray_count: beam,
  });

  const depthBody = JSON.stringify({
    depth,
    n_below: nBelow,
    n_above: nAbove,
    max_angle: maxAngle,
    ray_count: rayCount,
  });

  useEffect(() => {
    if (tab !== "slab") return;

    const controller = new AbortController();

    async function run() {
      setLoading(true);
      setError("");

      try {
        setSlab(await postJson<SlabResult>("slab", slabBody, controller.signal));
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
  }, [tab, slabBody]);

  useEffect(() => {
    if (tab !== "depth") return;

    const controller = new AbortController();

    async function run() {
      setLoading(true);
      setError("");

      try {
        setApparent(
          await postJson<ApparentDepthResult>("apparent-depth", depthBody, controller.signal)
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
  }, [tab, depthBody]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setCanvasTheme(theme);
    if (tab === "slab" && slab) drawSlab(ctx, canvas, slab);
    if (tab === "depth" && apparent) drawApparentDepth(ctx, canvas, apparent);
  }, [tab, slab, apparent, theme]);

  function switchTab(next: Tab) {
    setError("");
    setTab(next);
  }

  function applySlabScenario(label: string) {
    const s = SLAB_SCENARIOS.find((x) => x.label === label);
    if (!s) return;
    setAngle(s.angle);
    setThickness(s.thickness);
    setNSlab(s.nSlab);
    setNIn(s.nIn);
    setSameMedia(s.nOut === null);
    setNOut(s.nOut ?? s.nIn);
  }

  function applyDepthScenario(label: string) {
    const s = DEPTH_SCENARIOS.find((x) => x.label === label);
    if (!s) return;
    setDepth(s.depth);
    setNBelow(s.nBelow);
    setNAbove(s.nAbove);
    setMaxAngle(s.maxAngle);
  }

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
        >Glass Slab and Apparent Depth</h1>

        <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
          Two everyday refraction effects: a ray passing through a parallel-sided
          block shifts sideways, and an object under water looks shallower than
          it really is.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => switchTab("slab")}
            style={tab === "slab" ? styles.tabActive : styles.tab}
          >
            Glass slab
          </button>
          <button
            type="button"
            onClick={() => switchTab("depth")}
            style={tab === "depth" ? styles.tabActive : styles.tab}
          >
            Apparent depth
          </button>
        </div>

        <section style={styles.panel}>
          <h2 style={styles.heading}>Controls</h2>

          {tab === "slab" ? (
            <div style={styles.controls}>
              <label style={styles.label}>
                Example setup
                <select
                  defaultValue=""
                  onChange={(e) => applySlabScenario(e.target.value)}
                  style={styles.select}
                >
                  <option value="" disabled>
                    Choose a setup...
                  </option>
                  {SLAB_SCENARIOS.map((s) => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={styles.label}>
                Angle of incidence θ₁: {angle}°
                <input
                  type="range"
                  min="-80"
                  max="80"
                  step="1"
                  value={angle}
                  onChange={(e) => setAngle(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Slab thickness: {thickness}
                <input
                  type="range"
                  min="1"
                  max="20"
                  step="0.5"
                  value={thickness}
                  onChange={(e) => setThickness(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Slab index n: {nSlab.toFixed(2)}
                <input
                  type="range"
                  min="1.1"
                  max="2.5"
                  step="0.01"
                  value={nSlab}
                  onChange={(e) => setNSlab(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Index of the medium on the left: {nIn.toFixed(2)}
                <input
                  type="range"
                  min="1"
                  max="1.8"
                  step="0.01"
                  value={nIn}
                  onChange={(e) => setNIn(Number(e.target.value))}
                />
              </label>

              <label style={{ ...styles.label, flexDirection: "row", alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={sameMedia}
                  onChange={(e) => setSameMedia(e.target.checked)}
                />
                Same medium on both sides
              </label>

              {!sameMedia && (
                <label style={styles.label}>
                  Index of the medium on the right: {nOut.toFixed(2)}
                  <input
                    type="range"
                    min="1"
                    max="1.8"
                    step="0.01"
                    value={nOut}
                    onChange={(e) => setNOut(Number(e.target.value))}
                  />
                </label>
              )}

              <label style={styles.label}>
                Rays in the beam: {beam}
                <input
                  type="range"
                  min="1"
                  max="7"
                  step="2"
                  value={beam}
                  onChange={(e) => setBeam(Number(e.target.value))}
                />
              </label>
            </div>
          ) : (
            <div style={styles.controls}>
              <label style={styles.label}>
                Example
                <select
                  defaultValue=""
                  onChange={(e) => applyDepthScenario(e.target.value)}
                  style={styles.select}
                >
                  <option value="" disabled>
                    Choose an example...
                  </option>
                  {DEPTH_SCENARIOS.map((s) => (
                    <option key={s.label} value={s.label}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={styles.label}>
                Real depth: {depth}
                <input
                  type="range"
                  min="2"
                  max="20"
                  step="0.5"
                  value={depth}
                  onChange={(e) => setDepth(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Index below the surface: {nBelow.toFixed(2)}
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.01"
                  value={nBelow}
                  onChange={(e) => setNBelow(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Index above the surface: {nAbove.toFixed(2)}
                <input
                  type="range"
                  min="1"
                  max="1.8"
                  step="0.01"
                  value={nAbove}
                  onChange={(e) => setNAbove(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Widest ray angle: {maxAngle}°
                <input
                  type="range"
                  min="10"
                  max="75"
                  step="1"
                  value={maxAngle}
                  onChange={(e) => setMaxAngle(Number(e.target.value))}
                />
              </label>

              <label style={styles.label}>
                Rays: {rayCount}
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="2"
                  value={rayCount}
                  onChange={(e) => setRayCount(Number(e.target.value))}
                />
              </label>
            </div>
          )}

          {loading && <p>Updating simulation...</p>}
          {error && <p style={{ color: "var(--error)" }}>{error}</p>}
        </section>

        <section style={{ ...styles.panel, marginTop: 20 }}>
          <h2 style={styles.heading}>Ray diagram</h2>
          <canvas role="img" aria-label="Ray diagram for the glass slab and apparent depth simulation"
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

        {tab === "slab" && slab && <SlabResults data={slab} />}
        {tab === "depth" && apparent && <DepthResults data={apparent} />}
      </div>
    </main>
  );
}

// ============================================================
// RESULT PANELS
// ============================================================

function SlabResults({ data }: { data: SlabResult }) {
  return (
    <>
      <section style={styles.results}>
        <ResultCard
          title="Lateral displacement d"
          value={data.lateral_displacement === null ? "—" : fmt(data.lateral_displacement, 3)}
        />
        <ResultCard
          title="Formula t sin(θ₁−θ₂)/cos θ₂"
          value={
            data.lateral_displacement_formula === null
              ? "—"
              : fmt(data.lateral_displacement_formula, 3)
          }
        />
        <ResultCard
          title="θ₁ / θ₂ / θ₃"
          value={`${fmt(data.theta1, 1)}° / ${
            data.theta2 === null ? "—" : fmt(data.theta2, 1) + "°"
          } / ${data.theta3 === null ? "—" : fmt(data.theta3, 1) + "°"}`}
        />
        <ResultCard
          title="Change of direction"
          value={data.deviation === null ? "—" : `${fmt(data.deviation, 2)}°`}
        />
        <ResultCard
          title="Path length in the slab"
          value={data.path_length === null ? "—" : fmt(data.path_length, 2)}
        />
        <ResultCard
          title="Apparent shift (looking straight through)"
          value={fmt(data.apparent_shift, 2)}
        />
        <ResultCard
          title="Critical angle at the entry face"
          value={data.critical_angle_entry === null ? "—" : `${fmt(data.critical_angle_entry, 1)}°`}
        />
        <ResultCard title="What happens" value={data.status} />
      </section>

      <section style={{ ...styles.panel, marginTop: 20 }}>
        <h2 style={styles.heading}>Ray path</h2>
        <ol style={{ marginTop: 0 }}>
          {data.events.map((event, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              {event}
            </li>
          ))}
        </ol>
      </section>

      <section style={{ ...styles.panel, marginTop: 20 }}>
        <h2 style={styles.heading}>Physics</h2>
        <p>Entry face: n₁ sin θ₁ = n₂ sin θ₂. Exit face: n₂ sin θ₂ = n₃ sin θ₃.</p>
        <p>
          With the same medium on both sides (n₃ = n₁) the emergent ray is
          parallel to the incident ray, so the slab only shifts the beam
          sideways by d = t sin(θ₁ − θ₂) / cos θ₂. The card above compares the
          formula with the distance measured from the traced rays.
        </p>
        <p>
          The shift grows with the thickness (linearly), the angle of incidence
          and the refractive index, and it is zero at normal incidence.
        </p>
        <p>
          The product n sin θ is the same in every layer. That is why the
          emergent angle does not depend on the slab at all, and why a ray that
          gets into a plane slab can always get out again. If the media on the
          two sides differ, the ray may be totally reflected at the exit face and
          come back out through the entry face, as in the water, glass, air
          example.
        </p>
        <p>
          Looking straight through a slab, an object behind it seems nearer by
          t(1 − n₁/n), the &quot;apparent shift&quot; above.
        </p>
      </section>
    </>
  );
}

function DepthResults({ data }: { data: ApparentDepthResult }) {
  return (
    <>
      <section style={styles.results}>
        <ResultCard title="Real depth h" value={fmt(data.depth, 2)} />
        <ResultCard
          title="Apparent depth (near vertical)"
          value={fmt(data.paraxial_apparent_depth, 3)}
        />
        <ResultCard title="Ratio n_above / n_below" value={fmt(data.ratio, 3)} />
        <ResultCard title="Apparent rise" value={fmt(data.apparent_shift, 2)} />
        <ResultCard
          title="Widest ray: apparent depth"
          value={
            data.widest_apparent_depth === null
              ? "—"
              : `${fmt(data.widest_apparent_depth, 2)} (at ${fmt(data.widest_angle, 0)}°)`
          }
        />
        <ResultCard
          title="Critical angle"
          value={data.critical_angle === null ? "—" : `${fmt(data.critical_angle, 1)}°`}
        />
        <ResultCard title="Rays totally reflected" value={String(data.tir_ray_count)} />
      </section>

      <section style={{ ...styles.panel, marginTop: 20 }}>
        <h2 style={styles.heading}>Physics</h2>
        <p>At the surface: n_below sin φ_w = n_above sin φ_a.</p>
        <p>
          A ray leaving the object at angle φ_w meets the surface at x = h tan
          φ_w. Extending the emerging ray backwards to the vertical through the
          object gives the depth the eye reads along that ray:
          h tan φ_w / tan φ_a.
        </p>
        <p>
          For viewing almost straight down this becomes the textbook result
          apparent depth = real depth × n_above / n_below. For water that is
          h/1.33, about three quarters of the real depth.
        </p>
        <p>
          The more obliquely you look, the shallower the object seems. The rays
          do not meet at a single point, so the image is smeared along a curve
          called a caustic (purple). Its height for a ray is
          −h (n_above/n_below) cos³φ_a / cos³φ_w.
        </p>
        <p>
          Beyond the critical angle (sin θ_c = n_above/n_below) a ray is totally
          internally reflected and never leaves. If the object is in the less
          dense medium (a bird seen from under water) it looks deeper, not
          shallower, and no total internal reflection can happen.
        </p>
      </section>
    </>
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
