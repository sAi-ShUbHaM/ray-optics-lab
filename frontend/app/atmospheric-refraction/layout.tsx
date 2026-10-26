import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Atmospheric Refraction",
  description:
    "How the whole atmosphere lifts the Sun and stars, why a setting Sun looks flattened, and why sunset arrives late.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
