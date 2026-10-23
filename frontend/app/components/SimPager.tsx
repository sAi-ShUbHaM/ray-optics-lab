import Link from "next/link";
import { getNeighbours } from "@/lib/simulations";

/** Previous / next simulation, in directory order. */
export function SimPager({ href }: { href: string }) {
  const { previous, next } = getNeighbours(href);
  if (!previous && !next) return null;

  const card =
    "group flex flex-col gap-1 rounded-[var(--radius)] border border-line px-4 py-3 transition-colors hover:border-line-strong hover:bg-surface";

  return (
    <nav
      aria-label="Previous and next simulation"
      className="mt-auto border-t border-line px-5 py-6 sm:px-8"
    >
      <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-2">
        {previous ? (
          <Link href={previous.href} className={card} rel="prev">
            <span className="font-mono text-[var(--text-label)] uppercase tracking-[0.12em] text-fg-muted">
              Previous
            </span>
            <span className="text-[0.9375rem] text-fg">{previous.title}</span>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {next ? (
          <Link href={next.href} className={`${card} sm:text-right`} rel="next">
            <span className="font-mono text-[var(--text-label)] uppercase tracking-[0.12em] text-fg-muted">
              Next
            </span>
            <span className="text-[0.9375rem] text-fg">{next.title}</span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
