import { Label, ResultValue } from "../reflection/parts";
import {
  fmt,
  fmtVec,
  maxAbsDiff,
  type RefractionVectors,
  type Vec,
} from "./vectors";

const D = "d\u0302";
const N = "n\u0302";
const T = "t\u0302";
const R = "r\u0302";

function Step({
  index,
  title,
  children,
}: {
  index: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-x-3 border-t border-line py-4 first:border-t-0">
      <span className="font-mono text-[var(--text-label)] leading-6 text-fg-muted">
        {String(index).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <h3 className="text-[0.9375rem] font-medium text-fg">{title}</h3>
        <dl className="mt-2 flex flex-col gap-1.5">{children}</dl>
      </div>
    </li>
  );
}

function Eq({
  formula,
  value,
  accent,
}: {
  formula: string;
  value?: string;
  accent?: "blue" | "red";
}) {
  const colour =
    accent === "blue"
      ? "text-[var(--ray-refracted)]"
      : accent === "red"
        ? "text-[var(--ray-reflected)]"
        : "text-fg";
  return (
    <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
      <dt className="font-mono text-[0.8125rem] text-fg-secondary">{formula}</dt>
      <dd className={`font-mono text-[0.875rem] tabular-nums ${colour}`}>{value}</dd>
    </div>
  );
}

export function RefractionVectorPanel({
  vectors,
  backendDirection,
}: {
  vectors: RefractionVectors;
  /** unit direction of the outgoing ray as the backend returned it */
  backendDirection?: Vec;
}) {
  const v = vectors;
  const out = v.t ?? v.r;
  const matches =
    backendDirection !== undefined && out !== null && maxAbsDiff(out, backendDirection) < 1e-6;
  const snellLeft = v.n1 * Math.sin((v.theta1Deg * Math.PI) / 180);
  const snellRight =
    v.theta2Deg === null ? null : v.n2 * Math.sin((v.theta2Deg * Math.PI) / 180);
  const holds = snellRight !== null && Math.abs(snellLeft - snellRight) < 1e-6;

  return (
    <section
      aria-labelledby="refraction-vector-title"
      className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <Label>Vector analysis</Label>
        <span className="font-mono text-[var(--text-label)] text-fg-muted">
          {v.tir ? "r = d − 2(d·n)n" : "t = η d∥ + cos θ₂ n"}
        </span>
      </div>
      <h2 id="refraction-vector-title" className="sr-only">
        Vector analysis of the refraction
      </h2>

      <div className="mt-5 grid grid-cols-3 gap-4">
        <ResultValue label="Incidence θ₁" value={fmt(v.theta1Deg, 2)} unit="°" primary />
        {v.tir ? (
          <ResultValue label="Refraction θ₂" value="—" primary />
        ) : (
          <ResultValue label="Refraction θ₂" value={fmt(v.theta2Deg ?? 0, 2)} unit="°" primary />
        )}
        {v.tir ? (
          <ResultValue label="Reflection θᵣ" value={fmt(v.theta1Deg, 2)} unit="°" />
        ) : (
          <ResultValue label="Deviation" value={fmt(v.deviationDeg ?? 0, 2)} unit="°" />
        )}
      </div>
      <p className="mt-3 font-mono text-[0.8125rem] text-fg-secondary">
        {v.tir
          ? "Total internal reflection: θᵣ = θ₁"
          : `Bends ${v.bending}${holds ? "  ·  n₁ sin θ₁ = n₂ sin θ₂ ✓" : ""}`}
      </p>

      <ol className="mt-5 border-t border-line">
        <Step index={1} title="Unit vectors">
          <Eq
            formula={`${D} = (sin θ₁, cos θ₁),  θ₁ = ${fmt(v.theta1Deg, 1)}°`}
            value={fmtVec(v.d)}
            accent="blue"
          />
          <Eq formula={`${N} (medium 1 → medium 2)`} value={fmtVec(v.n)} />
          <Eq
            formula={`η = n₁ / n₂ = ${fmt(v.n1, 2)} / ${fmt(v.n2, 2)}`}
            value={fmt(v.eta, 3)}
          />
        </Step>

        <Step index={2} title="Split the incident vector">
          <Eq formula={`${D}·${N} = cos θ₁`} value={fmt(v.cos1)} />
          <Eq formula={`${D}⊥ = (${D}·${N}) ${N}`} value={fmtVec(v.dPerp)} />
          <Eq formula={`${D}∥ = ${D} − ${D}⊥`} value={fmtVec(v.dPar)} />
        </Step>

        <Step index={3} title="Snell's law">
          <Eq formula="sin θ₂ = η sin θ₁" value={fmt(v.sin2)} />
          <Eq
            formula="Critical angle  θc = arcsin(n₂ / n₁)"
            value={v.criticalDeg === null ? "none (n₁ ≤ n₂)" : `${fmt(v.criticalDeg, 2)}°`}
          />
          <Eq
            formula={v.tir ? "sin θ₂ > 1" : "sin θ₂ ≤ 1"}
            value={v.tir ? "total internal reflection" : "light is transmitted"}
            accent={v.tir ? "red" : undefined}
          />
        </Step>

        {v.tir && v.r ? (
          <Step index={4} title="Reflect">
            <Eq formula={`${R} = ${D} − 2(${D}·${N}) ${N}`} value={fmtVec(v.r)} accent="red" />
            <Eq
              formula={`= ${fmtVec(v.d)} − (${fmt(2 * v.cos1)}) ${fmtVec(v.n)}`}
            />
            <Eq formula={`${R} = ${D}∥ − ${D}⊥`} value={fmtVec(v.r)} accent="red" />
          </Step>
        ) : v.t && v.cos2 !== null ? (
          <Step index={4} title="Refract">
            <Eq formula="cos θ₂ = √(1 − η² sin² θ₁)" value={fmt(v.cos2)} />
            <Eq formula={`${T} = η ${D}∥ + cos θ₂ ${N}`} value={fmtVec(v.t)} accent="red" />
            <Eq
              formula={`= ${fmt(v.eta)} ${fmtVec(v.dPar)} + ${fmt(v.cos2)} ${fmtVec(v.n)}`}
            />
          </Step>
        ) : null}

        {!v.tir && v.theta2Deg !== null ? (
          <Step index={5} title="Check Snell's law">
            <Eq
              formula={`θ₂ = arccos(${T}·${N})`}
              value={`${fmt(v.theta2Deg, 2)}°`}
              accent="red"
            />
            <Eq formula="n₁ sin θ₁" value={fmt(snellLeft)} />
            <Eq formula="n₂ sin θ₂" value={snellRight === null ? "" : fmt(snellRight)} />
          </Step>
        ) : null}
      </ol>

      {backendDirection ? (
        <p className="mt-1 border-t border-line pt-4 font-mono text-[0.8125rem] text-fg-secondary">
          Backend {v.tir ? "r̂" : "t̂"} = {fmtVec(backendDirection)}{" "}
          <span className={matches ? "text-success" : "text-error"}>
            {matches ? "✓ matches" : "✗ differs"}
          </span>
        </p>
      ) : null}
    </section>
  );
}
