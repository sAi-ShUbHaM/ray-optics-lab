import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Small presentational pieces used only by the reflection page. They live here
 * so this page does not depend on what app/components/ui.tsx happens to export.
 */

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[var(--text-label)] uppercase tracking-[0.12em] text-fg-muted">
      {children}
    </span>
  );
}

export function ResultValue({
  label,
  value,
  unit,
  primary = false,
}: {
  label: string;
  value: string;
  unit?: string;
  primary?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label>{label}</Label>
      <div className="flex items-baseline gap-1.5">
        <span
          className={`font-mono tabular-nums text-fg ${
            primary ? "text-[1.75rem] leading-none" : "text-[1.0625rem]"
          }`}
        >
          {value}
        </span>
        {unit ? (
          <span className="font-mono text-[0.75rem] text-fg-muted">{unit}</span>
        ) : null}
      </div>
    </div>
  );
}

export function ActionButton({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "secondary" | "ghost" }) {
  const look =
    variant === "ghost"
      ? "text-fg-secondary hover:text-fg"
      : "border border-line-strong text-fg hover:bg-surface-elevated";
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-[0.875rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`}
      {...props}
    />
  );
}
