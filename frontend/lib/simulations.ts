/**
 * Single source of truth for every simulation route. The landing page,
 * directory, search and (in Phase 4) the shell navigation all read this.
 * Every entry maps to a real page under app/.
 */

export type CategoryId =
  | "reflection-refraction"
  | "mirrors-lenses"
  | "prisms-dispersion"
  | "instruments"
  | "phenomena";

export type Category = { id: CategoryId; label: string; description: string };

export const CATEGORIES: Category[] = [
  {
    id: "reflection-refraction",
    label: "Reflection & Refraction",
    description: "Light at flat boundaries and through parallel-sided media.",
  },
  {
    id: "mirrors-lenses",
    label: "Mirrors & Lenses",
    description: "Image formation with curved mirrors and lenses.",
  },
  {
    id: "prisms-dispersion",
    label: "Prisms & Dispersion",
    description: "Deviation of light and its spread into a spectrum.",
  },
  {
    id: "instruments",
    label: "Optical Instruments",
    description: "Lens systems that magnify near and distant objects.",
  },
  {
    id: "phenomena",
    label: "Optical Phenomena",
    description: "Optics in the sky and the atmosphere.",
  },
];

export type Simulation = {
  id: string;
  title: string;
  href: string;
  category: CategoryId;
  description: string;
  /** Extra search terms that appear on the page but not in title/description. */
  keywords: string[];
};

export const SIMULATIONS: Simulation[] = [
  {
    id: "reflection",
    title: "Reflection",
    href: "/reflection",
    category: "reflection-refraction",
    description:
      "Reflect a ray from a plane mirror. Set the ray angle, mirror angle and ray length.",
    keywords: ["plane mirror", "law of reflection", "angle of incidence"],
  },
  {
    id: "refraction",
    title: "Refraction",
    href: "/refraction",
    category: "reflection-refraction",
    description:
      "Snell's law at a flat boundary between two media, including total internal reflection.",
    keywords: ["snell", "refractive index", "total internal reflection", "tir", "critical angle"],
  },
  {
    id: "optical-fibre",
    title: "Optical Fibre",
    href: "/optical-fibre",
    category: "reflection-refraction",
    description:
      "Light guided by total internal reflection: acceptance angle, numerical aperture, bends that leak, and pulse spreading.",
    keywords: [
      "total internal reflection",
      "tir",
      "acceptance angle",
      "numerical aperture",
      "na",
      "core",
      "cladding",
      "critical angle",
      "bend",
      "modal dispersion",
      "communication",
    ],
  },
  {
    id: "slab",
    title: "Glass Slab and Apparent Depth",
    href: "/slab",
    category: "reflection-refraction",
    description:
      "How a ray shifts sideways through a parallel-sided slab, and why an object under water looks shallower.",
    keywords: ["lateral shift", "water", "real depth", "parallel slab"],
  },
  {
    id: "mirror-image",
    title: "Spherical Mirror Image Formation",
    href: "/mirror-image",
    category: "mirrors-lenses",
    description:
      "Switch between the textbook construction and an exact spherical reflection.",
    keywords: ["concave", "convex", "focal length", "principal rays", "mirror formula"],
  },
  {
    id: "curved-mirror",
    title: "Curved Mirror",
    href: "/curved-mirror",
    category: "mirrors-lenses",
    description:
      "Exact spherical reflection compared with the paraxial approximation, with image formation.",
    keywords: ["concave", "convex", "spherical aberration", "paraxial", "focal point"],
  },
  {
    id: "lens-image",
    title: "Thin Lens Image Formation",
    href: "/lens-image",
    category: "mirrors-lenses",
    description:
      "Convex and concave lenses with the standard principal-ray construction.",
    keywords: ["convex", "concave", "focal length", "lens formula", "magnification"],
  },
  {
    id: "lens-exact",
    title: "Exact Lens",
    href: "/lens-exact",
    category: "mirrors-lenses",
    description:
      "Build a glass lens from its refractive index, surface radii and thickness. Rays refract at both surfaces, so spherical aberration appears.",
    keywords: ["spherical aberration", "snell", "radius of curvature", "thick lens"],
  },
  {
    id: "lens-combination",
    title: "Lens Combinations",
    href: "/lens-combination",
    category: "mirrors-lenses",
    description:
      "Two or three thin lenses in a row. Each image becomes the object for the next lens.",
    keywords: ["lens system", "virtual object", "two lenses", "three lenses"],
  },
  {
    id: "instruments",
    title: "Optical Instruments",
    href: "/instruments",
    category: "instruments",
    description:
      "A compound microscope and a refracting telescope, built from thin lenses.",
    keywords: ["microscope", "telescope", "objective", "eyepiece", "magnifying power"],
  },
  {
    id: "prism",
    title: "Prism and Dispersion",
    href: "/prism",
    category: "prisms-dispersion",
    description:
      "Refraction at both faces of a prism, with white light spreading into a spectrum. Includes a total-internal-reflection preset.",
    keywords: ["dispersion", "spectrum", "deviation", "abbe", "critical angle", "tir", "total internal reflection"],
  },
  {
    id: "rainbow",
    title: "Rainbows",
    href: "/rainbow",
    category: "phenomena",
    description:
      "Sunlight refracted and reflected inside a raindrop, forming the primary and secondary bows.",
    keywords: ["raindrop", "primary bow", "secondary bow", "deviation curve", "dispersion"],
  },
  {
    id: "mirage",
    title: "Mirages",
    href: "/mirage",
    category: "phenomena",
    description:
      "Light bending through layers of air: inferior mirages over a hot road and superior mirages such as the Fata Morgana.",
    keywords: ["inferior mirage", "superior mirage", "fata morgana", "hot road", "temperature gradient"],
  },
  {
    id: "atmospheric-refraction",
    title: "Atmospheric Refraction",
    href: "/atmospheric-refraction",
    category: "phenomena",
    description:
      "How the whole atmosphere lifts the Sun and stars, why a setting Sun looks flattened, and why sunset arrives late.",
    keywords: [
      "sunset",
      "sunrise",
      "horizon",
      "flattened sun",
      "astronomical refraction",
      "bennett",
      "temperature",
      "pressure",
      "lapse rate",
      "tropopause",
      "dispersion",
    ],
  },
];

export function getCategory(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id)!;
}

export function getSimulation(id: string): Simulation | undefined {
  return SIMULATIONS.find((s) => s.id === id);
}

/** Case-insensitive search. Every word typed must appear somewhere in the entry. */
export function filterSimulations(
  query: string,
  category: CategoryId | "all" = "all",
): Simulation[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return SIMULATIONS.filter((sim) => {
    if (category !== "all" && sim.category !== category) return false;
    if (terms.length === 0) return true;
    const haystack = [
      sim.title,
      sim.description,
      ...sim.keywords,
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Previous/next entries in directory order (used by the shell in Phase 4). */
export function getNeighbours(href: string) {
  const index = SIMULATIONS.findIndex((s) => s.href === href);
  if (index === -1) return { previous: undefined, next: undefined };
  return {
    previous: index > 0 ? SIMULATIONS[index - 1] : undefined,
    next: index < SIMULATIONS.length - 1 ? SIMULATIONS[index + 1] : undefined,
  };
}
