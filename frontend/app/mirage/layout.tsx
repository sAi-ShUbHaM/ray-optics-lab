import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mirages",
  description: "Light bending through layers of air: inferior mirages over a hot road and superior mirages such as the Fata Morgana.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
