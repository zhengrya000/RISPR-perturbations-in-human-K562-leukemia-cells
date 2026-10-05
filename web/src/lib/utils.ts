import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const repositoryUrl = "https://github.com/zhengrya000/RISPR-perturbations-in-human-K562-leukemia-cells";
export const assetPath = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${path}`;

export function canonicalPair(genes: string[]): string {
  return [...genes].sort().join("+");
}
