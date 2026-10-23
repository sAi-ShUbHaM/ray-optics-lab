import type { Metadata } from "next";
import { SiteHeader } from "../components/SiteHeader";
import { SiteFooter } from "../components/SiteFooter";
import { Directory } from "../components/Directory";
import { CATEGORIES, type CategoryId } from "@/lib/simulations";

export const metadata: Metadata = {
  title: "Simulations",
  description: "Every Ray Optics Lab simulation, searchable and grouped by topic.",
};

export default async function SimulationsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  const initialCategory: CategoryId | "all" = CATEGORIES.some(
    (c) => c.id === category,
  )
    ? (category as CategoryId)
    : "all";

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 lg:py-14">
          <h1 className="text-[length:var(--text-h1)] font-medium text-fg">
            Simulations
          </h1>
          <p className="mt-3 max-w-[56ch] text-fg-secondary">
            Pick a topic, or search for a term such as “microscope”, “critical
            angle” or “spectrum”.
          </p>
          <div className="mt-8">
            <Directory key={initialCategory} initialCategory={initialCategory} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
