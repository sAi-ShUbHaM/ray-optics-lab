import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Optical Fibre",
  description:
    "Light guided by total internal reflection: acceptance angle, numerical aperture, bends and pulse spreading in a step-index optical fibre.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
