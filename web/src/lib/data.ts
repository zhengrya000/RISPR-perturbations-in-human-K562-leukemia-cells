import type { DashboardData } from "./types";
import { assetPath } from "./utils";

export async function loadDashboardData(signal?: AbortSignal): Promise<DashboardData> {
  const response = await fetch(assetPath("/data/results.json"), { signal });
  if (!response.ok) throw new Error("The measured results could not be loaded. Please try again.");
  const value = await response.json();
  if (value.schemaVersion !== 1 || value.dataStatus !== "measured" || !Array.isArray(value.pairs) || value.pairs.length !== value.summary?.total) {
    throw new Error("This data export does not match the dashboard schema.");
  }
  const finite = (object: Record<string, unknown> | undefined, keys: string[]) =>
    object && keys.every((key) => typeof object[key] === "number" && Number.isFinite(object[key]));
  if (!Array.isArray(value.nodes) || value.nodes.length === 0 || !value.nodes.every((node: { id?: unknown; label?: unknown }) => typeof node?.id === "string" && typeof node.label === "string") ||
      !finite(value.run, ["trainingCells", "cellCap", "trainPairs", "valPairs", "testPairs", "bestEpoch", "epochsCompleted"]) ||
      !finite(value.summary, ["controlMse", "additiveMse", "gearsMse", "wins", "total", "meanImprovement"]) ||
      !Array.isArray(value.summary.bootstrap95) || value.summary.bootstrap95.length !== 2 || !value.summary.bootstrap95.every(Number.isFinite) ||
      typeof value.provenance?.splitSha256 !== "string" || typeof value.run.runtimeVariant !== "string") {
    throw new Error("This data export is missing its experiment summary or gene graph.");
  }
  const nodeIds = new Set(value.nodes.map((node: { id: string }) => node.id));
  for (const pair of value.pairs) {
    if (!Array.isArray(pair.genes) || pair.genes.length !== 2 || pair.genes[0] === pair.genes[1] || !pair.genes.every((gene: string) => nodeIds.has(gene)) ||
        pair.id !== [...pair.genes].sort().join("+") || typeof pair.condition !== "string" ||
        !finite(pair, ["cells", "controlMse", "gearsMse", "additiveMse", "improvement"]) ||
        !Array.isArray(pair.features) || pair.features.length !== 20 || !pair.features.every((feature: Record<string, unknown>) => typeof feature?.geneId === "string" && typeof feature.geneName === "string" && finite(feature, ["control", "observed", "additive", "gears"]))) {
      throw new Error("A saved pair is missing its measured expression data.");
    }
  }
  return value as DashboardData;
}
