import Link from "next/link";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <Logo size={20} />
        <p className="max-w-md text-[var(--text-small)] text-fg-muted">
          Each simulation is calculated by the Python backend and drawn live in
          your browser.
        </p>
        <nav aria-label="Footer" className="flex gap-5 text-[var(--text-small)]">
          <Link href="/" className="text-fg-secondary hover:text-fg">
            Home
          </Link>
          <Link href="/simulations" className="text-fg-secondary hover:text-fg">
            Simulations
          </Link>
        </nav>
      </div>
    </footer>
  );
}
