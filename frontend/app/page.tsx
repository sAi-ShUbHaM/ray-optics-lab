import Link from "next/link";
import { SiteHeader } from "./components/SiteHeader";
import { SiteFooter } from "./components/SiteFooter";
import { HeroDiagram } from "./components/HeroDiagram";
import { SimulationRow } from "./components/SimulationRow";
import { buttonClass } from "./components/ui";
import { SIMULATIONS, getSimulation } from "@/lib/simulations";

const FEATURED_IDS = ["lens-combination", "instruments", "prism", "rainbow"];

export default function LandingPage() {
  const featured = FEATURED_IDS.map((id) => getSimulation(id)).filter(
    (s): s is NonNullable<typeof s> => Boolean(s),
  );

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-line">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-14 lg:py-20">
            <div>
              <h1 className="text-[length:var(--text-display)] font-medium leading-[1.02] tracking-[-0.03em] text-fg">
                Explore the physics of light.
              </h1>
              <p className="mt-6 max-w-[46ch] text-[var(--text-lead)] leading-relaxed text-fg-secondary">
                Trace rays through mirrors, lenses, prisms and raindrops. Change
                a parameter and watch the diagram and the numbers respond.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/simulations" className={buttonClass("primary", "px-5")}>
                  Explore simulations
                </Link>
                <Link href="/reflection" className={buttonClass("secondary", "px-5")}>
                  Start with reflection
                </Link>
              </div>
            </div>

            <div className="dot-matrix rounded-[var(--radius-lg)] border border-line bg-[var(--diagram-bg)] p-4 sm:p-6">
              <HeroDiagram />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 lg:py-16">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-[length:var(--text-h2)] font-medium text-fg">
              Start somewhere
            </h2>
            <Link
              href="/simulations"
              className="text-[0.875rem] text-fg-secondary underline underline-offset-4 hover:text-fg"
            >
              Browse all {SIMULATIONS.length} simulations
            </Link>
          </div>
          <ul className="mt-6 border-y border-line">
            {featured.map((sim) => (
              <SimulationRow key={sim.id} sim={sim} />
            ))}
          </ul>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
