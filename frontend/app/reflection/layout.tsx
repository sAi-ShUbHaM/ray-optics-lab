import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reflection",
  description: "Reflect a ray from a plane mirror. Set the ray angle, mirror angle and ray length.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
