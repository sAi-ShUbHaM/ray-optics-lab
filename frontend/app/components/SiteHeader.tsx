"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/simulations", label: "Simulations" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur-0">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link href="/" aria-label="Ray Optics Lab, home" className="shrink-0">
          <Logo />
        </Link>
        <div className="flex items-center gap-1 sm:gap-3">
          <nav aria-label="Main" className="flex items-center">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-14 items-center px-3 text-[0.875rem] transition-colors ${
                    active ? "text-fg" : "text-fg-secondary hover:text-fg"
                  }`}
                >
                  {item.label}
                  {active ? (
                    <span className="absolute inset-x-3 bottom-0 h-[2px] bg-accent" />
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
