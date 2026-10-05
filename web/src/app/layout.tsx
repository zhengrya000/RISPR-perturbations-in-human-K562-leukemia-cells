import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRISPR Perturbation Explorer — Two genes, a new response",
  description: "Explore measured CRISPR activation responses in human K562 cells. Compare GEARS and additive predictions across 20 held-out gene pairs.",
  openGraph: {
    title: "CRISPR Perturbation Explorer",
    description: "A hands-on exploration of gene-expression prediction, simple baselines, and surprising results.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
