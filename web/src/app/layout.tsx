import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const displayFont = localFont({ src: "./fonts/noto-serif-jp-latin.woff2", weight: "300", style: "normal", variable: "--font-display", display: "swap" });
const interfaceFont = localFont({ src: [{ path: "./fonts/space-mono-latin-400.woff2", weight: "400", style: "normal" }, { path: "./fonts/space-mono-latin-700.woff2", weight: "700", style: "normal" }], variable: "--font-ui", display: "swap" });

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
  return <html lang="en" className={`${displayFont.variable} ${interfaceFont.variable}`}><body>{children}</body></html>;
}
