import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Spherical Mirror Image Formation",
  description: "Switch between the textbook construction and an exact spherical reflection.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
