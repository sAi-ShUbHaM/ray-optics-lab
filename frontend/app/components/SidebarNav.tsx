"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CATEGORIES, SIMULATIONS } from "@/lib/simulations";

function NavLink({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`relative flex min-h-9 items-center rounded-[var(--radius)] py-1.5 pl-3 pr-2 text-[0.875rem] transition-colors ${
        active
          ? "bg-surface text-fg"
          : "text-fg-secondary hover:bg-surface hover:text-fg"
      }`}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-[2px] bg-accent"
        />
      ) : null}
      {children}
    </Link>
  );
}

/** The one navigation list, used by the desktop sidebar and the mobile drawer. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav
      aria-label="Simulations"
      className="flex flex-col gap-6 overflow-y-auto px-3 py-4"
    >
      <div className="flex flex-col gap-0.5">
        <NavLink href="/" onNavigate={onNavigate}>
          Home
        </NavLink>
        <NavLink href="/simulations" onNavigate={onNavigate}>
          All simulations
        </NavLink>
      </div>

      {CATEGORIES.map((category) => (
        <div key={category.id}>
          <p className="px-3 pb-1.5 font-mono text-[var(--text-label)] uppercase tracking-[0.12em] text-fg-muted">
            {category.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {SIMULATIONS.filter((s) => s.category === category.id).map((sim) => (
              <li key={sim.id}>
                <NavLink href={sim.href} onNavigate={onNavigate}>
                  {sim.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
