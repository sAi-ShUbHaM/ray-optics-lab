"use client";

import { useRef, useState } from "react";
import {
  CATEGORIES,
  SIMULATIONS,
  filterSimulations,
  type CategoryId,
} from "@/lib/simulations";
import { SimulationRow } from "./SimulationRow";

export function Directory({
  initialCategory = "all",
}: {
  initialCategory?: CategoryId | "all";
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId | "all">(initialCategory);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = filterSimulations(query, category);
  const filtering = query.trim() !== "" || category !== "all";

  function reset() {
    setQuery("");
    setCategory("all");
    inputRef.current?.focus();
  }

  const countFor = (id: CategoryId) =>
    filterSimulations(query, id).length;

  return (
    <div>
      <div className="flex flex-col gap-4">
        <div className="relative">
          <label htmlFor="sim-search" className="sr-only">
            Search simulations
          </label>
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-muted"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" />
          </svg>
          <input
            ref={inputRef}
            id="sim-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Search by name or topic, e.g. microscope, critical angle"
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full rounded-[var(--radius)] border border-line-strong bg-surface pl-10 pr-10 text-[0.9375rem] text-fg placeholder:text-fg-muted focus:border-fg [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[var(--radius)] text-fg-muted hover:text-fg"
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
          ) : null}
        </div>

        <div
          role="group"
          aria-label="Filter by category"
          className="flex flex-wrap items-center gap-2"
        >
          <FilterChip
            label="All"
            count={filterSimulations(query, "all").length}
            active={category === "all"}
            onClick={() => setCategory("all")}
          />
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c.id}
              label={c.label}
              count={countFor(c.id)}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            />
          ))}
          {filtering ? (
            <button
              type="button"
              onClick={reset}
              className="ml-1 h-8 px-2 text-[var(--text-small)] text-fg-secondary underline underline-offset-4 hover:text-fg"
            >
              Reset
            </button>
          ) : null}
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        className="mt-6 font-mono text-[var(--text-label)] uppercase tracking-[0.1em] text-fg-muted"
      >
        {results.length} of {SIMULATIONS.length} simulations
      </p>

      {results.length > 0 ? (
        <ul className="mt-3 border-y border-line">
          {results.map((sim) => (
            <SimulationRow key={sim.id} sim={sim} />
          ))}
        </ul>
      ) : (
        <div className="mt-3 border-y border-line py-14 text-center">
          <p className="text-[1rem] text-fg">
            No simulations match
            {query.trim() ? (
              <>
                {" "}
                <span className="font-mono">“{query.trim()}”</span>
              </>
            ) : null}
            {category !== "all" ? (
              <>
                {" "}
                in {CATEGORIES.find((c) => c.id === category)?.label}
              </>
            ) : null}
            .
          </p>
          <p className="mt-1 text-[var(--text-small)] text-fg-secondary">
            Try a shorter term, or look at every category.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 inline-flex h-10 items-center rounded-[var(--radius)] border border-line-strong px-4 text-[0.875rem] text-fg hover:bg-surface-elevated"
          >
            Clear search and filters
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-8 items-center gap-2 rounded-[var(--radius)] border px-3 text-[var(--text-small)] transition-colors ${
        active
          ? "border-fg bg-fg text-bg"
          : "border-line text-fg-secondary hover:border-line-strong hover:text-fg"
      }`}
    >
      {label}
      <span
        className={`font-mono text-[0.6875rem] tabular-nums ${
          active ? "text-bg/70" : "text-fg-muted"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
