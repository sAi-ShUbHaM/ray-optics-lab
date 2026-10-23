import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exact Lens",
  description: "Build a glass lens from its refractive index, surface radii and thickness. Rays refract at both surfaces, so spherical aberration appears.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
