import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Optical Instruments",
  description: "A compound microscope and a refracting telescope, built from thin lenses.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
