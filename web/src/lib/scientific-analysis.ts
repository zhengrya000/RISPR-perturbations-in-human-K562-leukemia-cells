import type { PairResult } from "./types";

/** Descriptive diagnostics on saved condition means, using the same DE genes as MSE. */
export function analyzePair(pair: PairResult) {
  const residuals = pair.features.map((feature) => ({
    gene: feature.geneName,
    additive: feature.additive - feature.observed,
    gears: feature.gears - feature.observed,
  }));
  return {
    residuals,
    largestErrors: [...residuals].sort((a, b) => Math.abs(b.gears) - Math.abs(a.gears)).slice(0, 3),
    additiveRmse: Math.sqrt(pair.additiveMse),
    gearsRmse: Math.sqrt(pair.gearsMse),
    mseReduction: pair.additiveMse > 0 ? 100 * (pair.additiveMse - pair.gearsMse) / pair.additiveMse : null,
  };
}
