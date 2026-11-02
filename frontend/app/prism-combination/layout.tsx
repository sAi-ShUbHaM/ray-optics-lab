import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Prism Combinations",
  description:
    "Two prisms in a row: achromatic pairs that cancel the colours, direct-vision pairs that cancel the bend, and pairs that add.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
