export type ViewMode = "explorer" | "scientist";

export interface ExpressionFeature {
  geneId: string;
  geneName: string;
  control: number;
  observed: number;
  additive: number;
  gears: number;
}

export interface PairResult {
  id: string;
  genes: [string, string];
  condition: string;
  cells: number;
  controlMse: number;
  additiveMse: number;
  gearsMse: number;
  improvement: number;
  features: ExpressionFeature[];
}

export interface DashboardData {
  schemaVersion: number;
  dataStatus: "measured";
  run: {
    trainingCells: number;
    cellCap: number;
    seed: number;
    hiddenSize: number;
    bestEpoch: number;
    epochsCompleted: number;
    trainingSeconds: number;
    device: string;
    measuredGenes: number;
    trainPairs: number;
    valPairs: number;
    testPairs: number;
    availableTrainingCells: number;
    validationCells: number;
    testCells: number;
    runtimeVariant: string;
  };
  summary: {
    controlMse: number;
    additiveMse: number;
    gearsMse: number;
    wins: number;
    total: number;
    meanImprovement: number;
    bootstrap95: [number, number];
    checkpointVerified: boolean;
  };
  nodes: { id: string; label: string }[];
  pairs: PairResult[];
  provenance: { runSummary: string; evaluationGenes: string; splitSha256: string; sourceHashes: Record<string, string> };
}
