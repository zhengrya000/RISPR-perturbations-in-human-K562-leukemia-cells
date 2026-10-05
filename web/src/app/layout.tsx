import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRISPR Constellation · Ryan Zheng",
  description: "Explore measured CRISPR activation responses in human K562 cells. Compare GEARS and additive predictions across 20 held-out gene pairs.",
  openGraph: {
    title: "CRISPR Constellation",
    description: "A hands-on exploration of gene-expression prediction, simple baselines, and surprising results.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
