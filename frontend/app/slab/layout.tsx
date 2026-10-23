import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Glass Slab and Apparent Depth",
  description: "How a ray shifts sideways through a parallel-sided slab, and why an object under water looks shallower.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
