import type { ButtonHTMLAttributes, ReactNode } from "react";

/* Small shared primitives. Pages migrate to these in Phase 5. */

type ButtonVariant = "primary" | "secondary" | "ghost";

const buttonBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-[0.875rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-contrast hover:brightness-110",
  secondary: "border border-line-strong text-fg hover:bg-surface-elevated",
  ghost: "text-fg-secondary hover:text-fg",
};

export function buttonClass(variant: ButtonVariant = "secondary", extra = "") {
  return `${buttonBase} ${buttonVariants[variant]} ${extra}`.trim();
}

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={buttonClass(variant, className)}
      {...props}
    />
  );
}

/** Compact technical label (Space Mono). Use for section tags and metadata. */
export function Label({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[var(--text-label)] uppercase tracking-[0.12em] text-fg-muted ${className}`}
    >
      {children}
    </span>
  );
}

/** A measured value: mono number, smaller mono unit. */
export function ResultValue({
  label,
  value,
  unit,
  primary = false,
  note,
}: {
  label: string;
  value: string;
  unit?: string;
  primary?: boolean;
  note?: string;
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
      {note ? (
        <span className="text-[var(--text-small)] text-fg-secondary">{note}</span>
      ) : null}
    </div>
  );
}
