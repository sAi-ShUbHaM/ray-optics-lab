import Link from "next/link";
import { getCategory, type Simulation } from "@/lib/simulations";
import { SimIcon } from "./SimIcon";

/** One simulation entry: compact row used by the directory and the landing preview. */
export function SimulationRow({ sim }: { sim: Simulation }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={sim.href}
        className="group relative flex items-start gap-4 py-4 pl-4 pr-3 transition-colors hover:bg-surface sm:items-center sm:gap-5 sm:pl-5"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-[2px] bg-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] border border-line text-fg-secondary transition-colors group-hover:border-line-strong group-hover:text-fg sm:mt-0">
          <SimIcon id={sim.id} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[1rem] font-medium text-fg">{sim.title}</span>
          <span className="mt-0.5 block max-w-[62ch] text-[var(--text-small)] leading-snug text-fg-secondary">
            {sim.description}
          </span>
        </span>
        <span className="hidden shrink-0 text-right font-mono text-[var(--text-label)] uppercase tracking-[0.1em] text-fg-muted md:block">
          {getCategory(sim.category).label}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          aria-hidden="true"
          className="mt-3 shrink-0 text-fg-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg sm:mt-0"
        >
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </Link>
    </li>
  );
}
