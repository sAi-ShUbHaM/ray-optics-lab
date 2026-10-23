"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SIMULATIONS } from "@/lib/simulations";
import { Breadcrumb } from "./Breadcrumb";
import { Logo } from "./Logo";
import { SidebarNav } from "./SidebarNav";
import { SimPager } from "./SimPager";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Wraps every simulation route in the shared workspace shell. The landing page
 * and directory (and any unknown route) render untouched, so no simulation
 * page file has to move or change for the shell to apply.
 */
export function ShellGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const normalized =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const sim = SIMULATIONS.find((s) => s.href === normalized);

  if (!sim) return <>{children}</>;
  return <Workspace sim={sim}>{children}</Workspace>;
}

function Workspace({
  sim,
  children,
}: {
  sim: (typeof SIMULATIONS)[number];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The drawer counts as open only on the page where it was opened, so any
  // navigation (links, browser back/forward) closes it without an effect.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const open = drawerPath === pathname;
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="flex min-h-screen flex-1">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-[var(--radius)] focus:bg-fg focus:px-3 focus:py-2 focus:text-bg"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-bg lg:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-line px-5">
          <Link href="/" aria-label="Ray Optics Lab, home">
            <Logo size={22} />
          </Link>
        </div>
        <SidebarNav />
      </aside>

      <dialog
        ref={dialogRef}
        onClose={() => setDrawerPath(null)}
        onClick={(e) => {
          if (e.target === dialogRef.current) setDrawerPath(null);
        }}
        aria-label="Navigation"
        className="m-0 h-full max-h-none w-[min(86vw,320px)] max-w-none flex-col border-r border-line bg-bg p-0 text-fg backdrop:bg-black/60 open:flex"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pl-5 pr-2">
          <Logo size={22} />
          <button
            type="button"
            onClick={() => setDrawerPath(null)}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-fg-secondary hover:text-fg"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.25"
              aria-hidden="true"
            >
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
        <SidebarNav onNavigate={() => setDrawerPath(null)} />
      </dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerPath(pathname)}
            aria-label="Open navigation"
            aria-expanded={open}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-line text-fg-secondary hover:border-line-strong hover:text-fg lg:hidden"
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
              <path d="M2 4.5h12M2 8h12M2 11.5h12" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <Breadcrumb sim={sim} />
          </div>
          <Link
            href="/simulations"
            aria-label="Search simulations"
            title="Search simulations"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-line text-fg-secondary transition-colors hover:border-line-strong hover:text-fg"
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
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5L14 14" />
            </svg>
          </Link>
          <ThemeToggle />
        </header>

        <main id="main" className="flex-1">
          {children}
        </main>
        <SimPager href={sim.href} />
      </div>
    </div>
  );
}
