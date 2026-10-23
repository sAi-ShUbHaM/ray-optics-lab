import Link from "next/link";
import { getCategory, type Simulation } from "@/lib/simulations";

function Sep({ className = "" }: { className?: string }) {
  return (
    <li aria-hidden="true" className={`font-mono text-fg-muted ${className}`}>
      /
    </li>
  );
}

export function Breadcrumb({ sim }: { sim: Simulation }) {
  const category = getCategory(sim.category);
  const link = "text-fg-secondary transition-colors hover:text-fg";

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-[var(--text-small)]">
        <li className="hidden sm:block">
          <Link href="/" className={link}>
            Home
          </Link>
        </li>
        <Sep className="hidden sm:block" />
        <li>
          <Link href="/simulations" className={link}>
            Simulations
          </Link>
        </li>
        <Sep className="hidden md:block" />
        <li className="hidden md:block">
          <Link href={`/simulations?category=${category.id}`} className={link}>
            {category.label}
          </Link>
        </li>
        <Sep />
        <li className="min-w-0">
          <span aria-current="page" className="block truncate text-fg">
            {sim.title}
          </span>
        </li>
      </ol>
    </nav>
  );
}
