import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rainbows",
  description: "Sunlight refracted and reflected inside a raindrop, forming the primary and secondary bows.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
