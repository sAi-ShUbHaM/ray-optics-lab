import type { ReactNode } from "react";

/**
 * Small building blocks shared by the newer simulation pages (panels, result
 * figures, sliders, legend entries). Layout-critical spacing is written as plain
 * CSS so it never depends on whether a utility class was generated.
 */

export function f(x: number | null | undefined, digits = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const s = x.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

export const controlButtonClass =
  "inline-flex min-h-9 items-center justify-center rounded-[var(--radius)] border border-line-strong px-3 text-[0.8125rem] text-fg transition-colors hover:bg-surface-elevated disabled:cursor-not-allowed disabled:opacity-50";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-surface p-5 sm:p-6">
      <h2 className="font-mono text-[var(--text-label)] font-normal uppercase tracking-[0.12em] text-fg-muted">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Stat({
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

export function StatGrid({ children }: { children: ReactNode }) {
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

export function Slider({
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

export function LegendItem({ colour, dash, text }: { colour: string; dash?: boolean; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        aria-hidden="true"
        style={{ width: 30, height: 0, borderTop: `3px ${dash ? "dashed" : "solid"} ${colour}` }}
      />
      {text}
    </span>
  );
}
