/** Minimal 24px line icons, one per simulation. They use currentColor. */
export function SimIcon({ id, size = 22 }: { id: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const lens = (x: number) =>
    `M${x} 5c-2.4 2.6-2.4 11.4 0 14 2.4-2.6 2.4-11.4 0-14Z`;

  switch (id) {
    case "reflection":
      return (
        <svg {...common}>
          <path d="M3 19h18" />
          <path d="M4 5l8 14 8-14" opacity="0.001" />
          <path d="M5 5l7 14" />
          <path d="M12 19l7-14" />
          <path d="M12 19V4" strokeDasharray="1.5 2.5" opacity="0.6" />
        </svg>
      );
    case "refraction":
      return (
        <svg {...common}>
          <path d="M3 12h18" />
          <path d="M5 3l7 9 3.5 9" />
          <path d="M12 4v16" strokeDasharray="1.5 2.5" opacity="0.6" />
        </svg>
      );
    case "slab":
      return (
        <svg {...common}>
          <rect x="8" y="3.5" width="8" height="17" rx="0.5" />
          <path d="M2.5 8l5.5 2.2M8 10.2l8 3.6M16 13.8l5.5 1.7" />
        </svg>
      );
    case "mirror-image":
      return (
        <svg {...common}>
          <path d="M18 3.5c-4 3-4 14 0 17" />
          <path d="M2.5 12h19" opacity="0.5" />
          <path d="M7 12V8M6 9l1-1.6L8 9" />
        </svg>
      );
    case "curved-mirror":
      return (
        <svg {...common}>
          <path d="M19 3.5c-4.5 3-4.5 14 0 17" />
          <path d="M3 8h13.2M3 16h13.2M16.2 8L10 12M16.2 16L10 12" />
          <circle cx="10" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "lens-image":
      return (
        <svg {...common}>
          <path d={lens(12)} />
          <path d="M2.5 12h19" opacity="0.5" />
          <path d="M5.5 12V8.5M4.5 9.5l1-1.6 1 1.6" />
          <path d="M19 12v3M18 14l1 1.6 1-1.6" />
        </svg>
      );
    case "lens-exact":
      return (
        <svg {...common}>
          <path d="M10.5 5c-3 2.8-3 11.2 0 14h3c3-2.8 3-11.2 0-14Z" />
          <path d="M2.5 9h8M2.5 15h8M13.5 8.2L21 12M13.5 15.8L21 12" />
        </svg>
      );
    case "lens-combination":
      return (
        <svg {...common}>
          <path d={lens(8)} />
          <path d={lens(16)} />
          <path d="M2.5 12h19" opacity="0.5" />
        </svg>
      );
    case "instruments":
      return (
        <svg {...common}>
          <rect x="3" y="9" width="18" height="6" rx="0.5" />
          <path d="M8.5 9v6M15.5 9v6" />
          <path d="M3 12h18" opacity="0.4" strokeDasharray="1.5 2.5" />
        </svg>
      );
    case "prism":
      return (
        <svg {...common}>
          <path d="M9 4l7 15H2L9 4Z" opacity="0.001" />
          <path d="M11 5L4.5 19h13L11 5Z" />
          <path d="M2 14l6.2-1.6" />
          <path d="M14.4 12.5l7-2M14.6 13.4l6.9 1M14.2 14.2l6.4 4.2" />
        </svg>
      );
    case "rainbow":
      return (
        <svg {...common}>
          <path d="M3 19a9 9 0 0 1 18 0" />
          <path d="M6.5 19a5.5 5.5 0 0 1 11 0" />
          <path d="M10 19a2 2 0 0 1 4 0" />
        </svg>
      );
    case "mirage":
      return (
        <svg {...common}>
          <path d="M2.5 12h19" />
          <path d="M9 11V6.5l3 2.5 3-2.5V11" />
          <path d="M9 14v3.5l3-2 3 2V14" strokeDasharray="1.5 2" opacity="0.7" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
  }
}
