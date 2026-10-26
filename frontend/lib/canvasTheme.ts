/**
 * Theme-aware colours for the canvas drawing code.
 *
 * The drawing files were written with light-theme literals. Each literal is now
 * passed through tcol(), which returns it unchanged in the light theme and a
 * dark-theme equivalent otherwise. Only colours change. Coordinates, geometry
 * and physics are untouched.
 */

type Theme = "light" | "dark";

let current: Theme = "light";

/** Call at the start of a draw pass, before any drawing function runs. */
export function setCanvasTheme(theme: Theme) {
  current = theme;
}

function dim(hex: string, k: number): string {
  const full =
    hex.length === 4
      ? "#" + [...hex.slice(1)].map((c) => c + c).join("")
      : hex;
  const n = (i: number) =>
    Math.round(parseInt(full.slice(i, i + 2), 16) * k)
      .toString(16)
      .padStart(2, "0");
  return `#${n(1)}${n(3)}${n(5)}`;
}

// Paper and ink: inverted so labels, axes and halos stay legible on black.
const NEUTRAL: Record<string, string> = {
  "#fff": "#0b0b0b",
  "#eee": "#1a1a1a",
  "#ddd": "#262626",
  "#ccc": "#333333",
  "#bbb": "#404040",
  "#aaa": "#585858",
  "#999": "#6b6b6b",
  "#888": "#7f7f7f",
  "#777": "#8f8f8f",
  "#666": "#a0a0a0",
  "#555": "#b0b0b0",
  "#444": "#c4c4c4",
  "#334": "#d0d4e0",
  "#333": "#d8d8d8",
  "#223": "#dadde8",
  "#222": "#e8e8e8",
  "#111": "#f5f5f5",
  "#f8fafc": "#0b0b0b",
  "#111827": "#f5f5f5",
  "#475569": "#b0b0b0",
  "#64748b": "#9a9a9a",
  "#cbd5e1": "#333333",
  "#b8b8b8": "#4a4a4a",
  "#234": "#cdd6ea",
  "#6b7280": "#9ca3af",
  "#9aa3b2": "#7b8394",
};

// Data colours (rays, markers): lifted so they keep contrast on a dark ground.
const DATA: Record<string, string> = {
  "#1671d9": "#5ab0ff",
  "#dc2626": "#ff5a50",
  "#e11d48": "#ff5a78",
  "#b91c1c": "#ff6b61",
  "#16a34a": "#4ade80",
  "#b45309": "#f0a030",
  "#92400e": "#d9902f",
  "#7c3aed": "#a78bfa",
  "#0e7490": "#2cc6dd",
  "#e67e00": "#ffa733",
  "#c026d3": "#e879f9",
  "#2563eb": "#5ab0ff",
  "#0891b2": "#38d0ea",
};

// Scene fills (sky, ground, water): darkened rather than inverted.
const SCENE: Record<string, string> = {
  "#eaf5ff": dim("#eaf5ff", 0.1),
  "#eef7ff": dim("#eef7ff", 0.1),
  "#b8dcf8": dim("#b8dcf8", 0.2),
  "#a6d0f6": dim("#a6d0f6", 0.22),
  "#9fcdf6": dim("#9fcdf6", 0.24),
  "#6aa7d8": dim("#6aa7d8", 0.32),
  "#86a874": dim("#86a874", 0.3),
  "#8bb07c": dim("#8bb07c", 0.3),
  "#c9a36b": dim("#c9a36b", 0.34),
  "#eef2ff": dim("#eef2ff", 0.1),
  "#7fb2ea": dim("#7fb2ea", 0.42),
  "#fbe6c8": dim("#fbe6c8", 0.45),
  "#6b7a55": dim("#6b7a55", 0.42),
  "#2f3b22": "#a8c080",
  "#5a6a8c": dim("#5a6a8c", 0.7),
  "#3b4a2f": dim("#3b4a2f", 0.8),
};

const ALPHA: Record<string, string> = {
  "rgba(14, 116, 144, 0.14)": "rgba(44, 198, 221, 0.16)",
  "rgba(14, 116, 144, 0.12)": "rgba(44, 198, 221, 0.14)",
  "rgba(30, 40, 90, 0.12)": "rgba(150, 170, 255, 0.12)",
  "rgba(25, 35, 90, 0.22)": "rgba(150, 170, 255, 0.2)",
  "rgba(255,255,255,0.92)": "rgba(10, 10, 10, 0.92)",
  "rgba(255,255,255,0.35)": "rgba(255, 255, 255, 0.16)",
  "rgba(40,50,30,0.6)": "rgba(120, 150, 90, 0.32)",
  "rgba(255,255,255,0.94)": "rgba(10, 10, 10, 0.94)",
  "rgba(255,255,255,0.95)": "rgba(10, 10, 10, 0.95)",
  "rgba(14, 116, 144, 0.16)": "rgba(44, 198, 221, 0.18)",
};

const DARK: Record<string, string> = { ...NEUTRAL, ...DATA, ...SCENE, ...ALPHA };

/** Map a light-theme canvas colour to the active theme. */
export function tcol(color: string): string {
  return current === "dark" ? (DARK[color] ?? color) : color;
}

/** Same mapping for React-rendered UI (legend swatches) that must match the canvas. */
export function themedColor(theme: Theme, color: string): string {
  return theme === "dark" ? (DARK[color] ?? color) : color;
}

/**
 * Set to false to draw all canvas text in Arial again (a one-line way back if a
 * label ever looks too wide). Everything else keeps working either way.
 */
export const CANVAS_THEME_FONTS = true;

/**
 * Canvas font string using the page's own fonts (Space Grotesk / Space Mono).
 * ctx.font cannot read CSS variables directly, so the family is resolved from
 * the variable next/font defines on <html>. Text drawn before the font file has
 * loaded falls back to Arial and picks up the real font on the next redraw.
 */
export function canvasFont(
  size: number,
  kind: "sans" | "mono" = "sans",
  weight: number | string = 400,
): string {
  const fallback = kind === "mono" ? "ui-monospace, Menlo, monospace" : "Arial, sans-serif";
  if (!CANVAS_THEME_FONTS) return `${weight} ${size}px ${kind === "mono" ? fallback : "Arial, sans-serif"}`;

  const family = resolveFamily(kind);
  return `${weight} ${size}px ${family ? `${family}, ` : ""}${fallback}`;
}

// The family strings never change once the page has loaded, so look them up once.
const familyCache: { sans?: string; mono?: string } = {};

function resolveFamily(kind: "sans" | "mono"): string {
  if (typeof document === "undefined") return "";
  const cached = familyCache[kind];
  if (cached) return cached;
  const variable = kind === "mono" ? "--font-space-mono" : "--font-space-grotesk";
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  if (value) familyCache[kind] = value;
  return value;
}
