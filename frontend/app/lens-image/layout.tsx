import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thin Lens Image Formation",
  description: "Convex and concave lenses with the standard principal-ray construction.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
