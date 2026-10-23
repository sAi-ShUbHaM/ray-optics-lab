import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refraction",
  description: "Snell's law at a flat boundary between two media, including total internal reflection.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
