"use client";

import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-line text-fg-secondary transition-colors hover:border-line-strong hover:text-fg ${className}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        aria-hidden="true"
      >
        {theme === "dark" ? (
          // sun: shown in dark theme, offers light
          <>
            <circle cx="8" cy="8" r="2.75" />
            <path d="M8 1.5v1.75M8 12.75v1.75M1.5 8h1.75M12.75 8h1.75M3.4 3.4l1.25 1.25M11.35 11.35l1.25 1.25M3.4 12.6l1.25-1.25M11.35 4.65l1.25-1.25" />
          </>
        ) : (
          // moon: shown in light theme, offers dark
          <path d="M13.25 9.4A5.5 5.5 0 0 1 6.6 2.75a5.5 5.5 0 1 0 6.65 6.65Z" />
        )}
      </svg>
    </button>
  );
}
