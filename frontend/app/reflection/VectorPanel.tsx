import { Label, ResultValue } from "./parts";
import {
  fmt,
  fmtVec,
  maxAbsDiff,
  type ReflectionVectors,
  type Vec,
} from "./vectors";

const D = "d\u0302";
const N = "n\u0302";
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
  value: string;
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

export function VectorPanel({
  vectors,
  backendReflected,
  message,
}: {
  /** null when the backend reported no reflection (ray parallel to the mirror). */
  vectors: ReflectionVectors | null;
  backendReflected?: Vec;
  message?: string;
}) {
  if (!vectors) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
        <Label>Vector analysis</Label>
        <p className="mt-3 text-[0.9375rem] text-fg-secondary">
          {message ?? "No reflection for these settings."}
        </p>
      </section>
    );
  }

  const v = vectors;
  const dotText = fmt(v.dDotN);
  const coefficient = fmt(2 * v.dDotN);
  const matches =
    backendReflected !== undefined && maxAbsDiff(v.r, backendReflected) < 1e-6;
  const lawHolds = Math.abs(v.incidenceDeg - v.reflectionDeg) < 1e-6;

  return (
    <section
      aria-labelledby="vector-analysis-title"
      className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <Label>Vector analysis</Label>
        <span className="font-mono text-[var(--text-label)] text-fg-muted">
          r = d − 2(d·n)n
        </span>
      </div>
      <h2 id="vector-analysis-title" className="sr-only">
        Vector analysis of the reflection
      </h2>

      <div className="mt-5 grid grid-cols-3 gap-4">
        <ResultValue
          label="Incidence i"
          value={fmt(v.incidenceDeg, 2)}
          unit="°"
          primary
        />
        <ResultValue
          label="Reflection r"
          value={fmt(v.reflectionDeg, 2)}
          unit="°"
          primary
        />
        <ResultValue label="Deviation" value={fmt(v.deviationDeg, 2)} unit="°" />
      </div>
      <p className="mt-3 font-mono text-[0.8125rem] text-fg-secondary">
        {lawHolds ? "i = r  ✓ law of reflection" : "i ≠ r"}
        {"  ·  "}δ = 180° − 2i
      </p>

      <ol className="mt-5 border-t border-line">
        <Step index={1} title="Unit vectors">
          <Eq
            formula={`${D} = (cos α, sin α),  α = ${fmt(v.alphaDeg, 1)}°`}
            value={fmtVec(v.d)}
            accent="blue"
          />
          <Eq
            formula={`${N} = (−sin β, cos β),  β = ${fmt(v.betaDeg, 1)}°`}
            value={fmtVec(v.n)}
          />
        </Step>

        <Step index={2} title="Component along the normal">
          <Eq formula={`${D} · ${N}`} value={dotText} />
        </Step>

        <Step index={3} title="Split the incident vector">
          <Eq formula={`${D}⊥ = (${D}·${N}) ${N}`} value={fmtVec(v.dPerp)} />
          <Eq formula={`${D}∥ = ${D} − ${D}⊥`} value={fmtVec(v.dPar)} />
        </Step>

        <Step index={4} title="Reflect">
          <Eq
            formula={`${R} = ${D} − 2(${D}·${N}) ${N}`}
            value={fmtVec(v.r)}
            accent="red"
          />
          <Eq
            formula={`= ${fmtVec(v.d)} − (${coefficient}) ${fmtVec(v.n)}`}
            value=""
          />
          <Eq formula={`${R} = ${D}∥ − ${D}⊥`} value={fmtVec(v.r)} accent="red" />
        </Step>

        <Step index={5} title="Angles from the normal">
          <Eq formula={`i = arccos |${D}·${N}|`} value={`${fmt(v.incidenceDeg, 2)}°`} accent="blue" />
          <Eq formula={`r = arccos (${R}·${N}ᵢₙ)`} value={`${fmt(v.reflectionDeg, 2)}°`} accent="red" />
        </Step>
      </ol>

      {backendReflected ? (
        <p className="mt-1 border-t border-line pt-4 font-mono text-[0.8125rem] text-fg-secondary">
          Backend r̂ = {fmtVec(backendReflected)}{" "}
          <span className={matches ? "text-success" : "text-error"}>
            {matches ? "✓ matches" : "✗ differs"}
          </span>
        </p>
      ) : null}
    </section>
  );
}
