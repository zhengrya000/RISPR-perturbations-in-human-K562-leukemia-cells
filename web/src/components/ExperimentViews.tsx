"use client";

import { useMemo, useState } from "react";
import InfoHint from "./InfoHint";
import { assetPath, repositoryUrl } from "@/lib/utils";
import type { DashboardData } from "@/lib/types";

export function PairResults({ data, selectedId, onSelect }: { data: DashboardData; selectedId: string | null; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("difference");
  const pairs = useMemo(() => data.pairs.filter((pair) => pair.id.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "gears" ? pair.improvement > 0 : pair.improvement < 0))).sort((a, b) => sort === "difference" ? b.improvement - a.improvement : sort === "gears" ? a.gearsMse - b.gearsMse : a.additiveMse - b.additiveMse), [data, search, filter, sort]);
  return <section id="results" aria-labelledby="pairs-title">
    <h2 id="pairs-title" className="view-title">Evaluated pairs.</h2>
    <p className="view-description">20 held-out pairs · population means<br/>Top-20 <InfoHint definition="DE · expression differs from control. A separate evaluation ranking for each pair.">DE</InfoHint> <InfoHint definition="MSE · mean squared prediction error. Lower = closer to the observed response.">MSE</InfoHint> · lower is better</p>
    <div className="example-links"><span>Start with</span><button onClick={() => onSelect("IGDCC3+PRTG")}>GEARS closer</button><button onClick={() => onSelect("ETS2+MAPK1")}>Additive closer</button></div>
    <div className="result-filters"><input aria-label="Search evaluated gene pairs" placeholder="Find a gene or pair" value={search} onChange={(event) => setSearch(event.target.value)}/><select aria-label="Filter pair results" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All pairs</option><option value="gears">GEARS closer</option><option value="additive">Additive closer</option></select><select aria-label="Sort pair results" value={sort} onChange={(event) => setSort(event.target.value)}><option value="difference">GEARS advantage</option><option value="gears">GEARS error</option><option value="additive">Additive error</option></select></div>
    <div className="table-scroll"><table className="pair-table"><caption className="sr-only">Mean squared error on held-out gene pairs. Positive advantage means GEARS has lower error.</caption><thead><tr><th scope="col">Pair</th><th scope="col">Additive</th><th scope="col">GEARS</th><th scope="col"><InfoHint definition="Additive MSE − GEARS MSE. Positive = GEARS closer.">Δ</InfoHint></th></tr></thead><tbody>{pairs.map((pair) => <tr key={pair.id} data-selected={pair.id === selectedId}><th scope="row"><button onClick={() => onSelect(pair.id)} aria-label={`Explore ${pair.genes.join(" and ")}`}>{pair.genes.join(" + ")}</button></th><td>{pair.additiveMse.toFixed(4)}</td><td>{pair.gearsMse.toFixed(4)}</td><td className={pair.improvement > 0 ? "positive" : "negative"}>{pair.improvement > 0 ? "+" : ""}{pair.improvement.toFixed(4)}</td></tr>)}</tbody></table></div>
    {pairs.length === 0 && <p className="view-description">No saved pairs match your search.</p>}
    <p className="fine-print">{pairs.length} / {data.summary.total} pairs · Δ = additive − GEARS</p>
    <a className="text-link" href={assetPath("/data/pair-results.csv")} download>Results CSV</a>
  </section>;
}

export function Methodology({ data }: { data: DashboardData }) {
  return <section className="method-copy" aria-labelledby="method-title">
    <h2 id="method-title" className="view-title">The experiment.</h2>
    <p className="view-description">Norman 2019 · K562 · CRISPR activation<br/>K562 · human leukemia cell line<br/>CRISPRa · increased target-gene activity</p>
    <h3>The question</h3>
    <p>Can GEARS predict two-gene activation responses better than adding their separate effects?</p>
    <h3>The model</h3>
    <p>GEARS · graph neural network<br/>Coexpression + Gene Ontology → gene relationships<br/>Perturbation signals → expression predictions</p>
    <p className="fine-print">Published model · Roohani, Huang &amp; Leskovec<br/>Local implementation · corrected batching</p>
    <h3>Built here</h3>
    <p>Data preparation · checked pair split · additive benchmark · sampled training · runtime corrections · reproducible reports · this explorer</p>
    <h3>Additive led overall</h3>
    <p>Additive {data.summary.additiveMse.toFixed(4)} · GEARS {data.summary.gearsMse.toFixed(4)}<br/>Control {data.summary.controlMse.toFixed(4)} · top-20 DE MSE<br/>GEARS closer · {data.summary.wins} / {data.summary.total} pairs</p>
    <p className="method-equation">Additive = mean(A) + mean(B) − mean(control)</p>
    <h3>What this tests</h3>
    <p>New combinations · individually seen genes<br/>Whole-pair holdout · {data.run.trainPairs} train / {data.run.valPairs} validation / {data.run.testPairs} test<br/>Equivalent labels grouped · random cell splits risk exposing the same pair</p>
    <p>GEARS · {data.run.trainingCells.toLocaleString()} sampled outcome cells<br/>Additive · 54,931 single-gene/control observations<br/>Unequal training sample sizes</p>
    <h3>Read the constellation</h3>
    <p>Nodes · perturbation targets<br/>Edges · saved evaluated pairs<br/>Position / depth / distance · decorative<br/>Separate from GEARS training graphs</p>
    <p>Completed predictions · no live inference<br/>Other combinations · no saved result</p>
    <details className="method-details"><summary>Evaluation &amp; limits</summary>
      <p>Single-cell RNA-seq → observed population means<br/>20 evaluation genes per pair · lists can differ<br/>Condition mean − training-control mean<br/>Processed expression scale · not raw counts or fold change</p>
      <p>Held-out DE rankings · scoring only<br/>Equivalent labels averaged within pair<br/>Equal pair weighting · shared training-control reference</p>
      <p>GEARS cell cap · {data.run.cellCap} / original condition<br/>Runtime · {data.run.runtimeVariant}<br/>Training objective · quartic single-cell loss<br/>Evaluation · condition-mean MSE</p>
      <p>Validation-selected epoch · {data.run.bestEpoch} / {data.run.epochsCompleted}<br/>Seed · {data.run.seed}<br/>CPU checkpoint reload · {data.summary.checkpointVerified ? "verified" : "unavailable"}</p>
      <p>One split · one seed · previously inspected test set<br/>Shared genes · exploratory comparison<br/>Unseen genes / other cell types / biological replicates · untested</p>
      <p>Mean additive − GEARS · {data.summary.meanImprovement.toFixed(4)}<br/>95% pair-bootstrap interval · [{data.summary.bootstrap95.map((number) => number.toFixed(4)).join(", ")}]<br/>Descriptive · no biological-replicate uncertainty</p>
      <p className="fingerprint">Split SHA-256<br/>{data.provenance.splitSha256}</p>
    </details>
    <div className="source-links"><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6746554/" target="_blank" rel="noreferrer">Study</a><a href="https://www.nature.com/articles/s41587-023-01905-6" target="_blank" rel="noreferrer">GEARS paper</a><a href="https://github.com/snap-stanford/GEARS" target="_blank" rel="noreferrer">GEARS code</a><a href={`${repositoryUrl}/blob/main/AUDIT.md`} target="_blank" rel="noreferrer">Audit</a><a href={`${repositoryUrl}/blob/main/project06_gears_medium.ipynb`} target="_blank" rel="noreferrer">Notebook</a><a href={`${repositoryUrl}#reproduce-the-experiment`} target="_blank" rel="noreferrer">Reproduce</a><a href={assetPath("/data/results.json")} download>Measured JSON</a></div>
  </section>;
}

export function Instructions({ onSelect }: { onSelect: (id: string) => void }) {
  return <section className="instruction-copy" aria-labelledby="instruction-title">
    <h2 id="instruction-title" className="view-title">Explore a response.</h2>
    <p className="view-description">One gene → brighter saved partners<br/>Two genes → observed vs. predicted expression<br/>An edge → its saved pair</p>
    <p className="view-description">Drag · orbit<br/>Scroll / pinch · approach<br/>Two-finger drag · pan</p>
    <div className="example-links"><span>Try a comparison</span><button onClick={() => onSelect("IGDCC3+PRTG")}>GEARS closer · IGDCC3 + PRTG</button><button onClick={() => onSelect("ETS2+MAPK1")}>Additive closer · ETS2 + MAPK1</button></div>
    <p className="fine-print">20 saved test pairs · real measured results<br/>Layout · decorative</p>
  </section>;
}
