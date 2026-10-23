/**
 * Brand mark: an optical axis, a thin lens profile, and a ray that bends
 * through the lens to meet the axis at the focal point (the accent dot).
 * Uses currentColor so it follows the theme.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M1.5 12h21" opacity="0.45" />
      <path d="M10 4.5c-2.2 2.2-2.2 12.8 0 15 2.2-2.2 2.2-12.8 0-15Z" />
      <path d="M1.5 7.5h8.6M10.4 7.5 19 12" />
      <circle cx="19" cy="12" r="1.6" fill="var(--accent)" stroke="none" />
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-fg">
      <LogoMark size={size} />
      <span className="font-mono text-[0.75rem] font-bold tracking-[0.14em]">
        RAY OPTICS LAB
      </span>
    </span>
  );
}
