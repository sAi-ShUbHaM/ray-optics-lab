import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lens Combinations",
  description: "Two or three thin lenses in a row. Each image becomes the object for the next lens.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
