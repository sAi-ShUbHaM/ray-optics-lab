import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Curved Mirror",
  description: "Exact spherical reflection compared with the paraxial approximation, with image formation.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
