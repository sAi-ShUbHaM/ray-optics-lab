import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prism and Dispersion",
  description: "Refraction at both faces of a prism, with white light spreading into a spectrum. Includes a total-internal-reflection preset.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
