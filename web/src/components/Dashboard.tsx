"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Code2, RotateCcw, X } from "lucide-react";
import ResultsPanel from "./ResultsPanel";
import { Switch } from "./ui/switch";
import { loadDashboardData } from "@/lib/data";
import { assetPath, canonicalPair, repositoryUrl } from "@/lib/utils";
import type { DashboardData, PairResult, ViewMode } from "@/lib/types";

const ConstellationScene = dynamic(() => import("./ConstellationScene"), { ssr: false });
type Phase = "intro" | "entering" | "explore";
type DrawerName = "pairs" | "method" | "genes" | null;

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function Drawer({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current?.close();
  }, [open]);
  return <dialog ref={ref} className="scene-drawer" aria-labelledby="drawer-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="drawer-content">
      <header className="drawer-header"><h2 id="drawer-title">{title}</h2><button onClick={onClose} className="icon-control" aria-label="Close drawer"><X size={20}/></button></header>
      {children}
    </div>
  </dialog>;
}

function PairResults({ data, selectedId, onSelect }: { data: DashboardData; selectedId: string | null; onSelect: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("difference");
  const pairs = useMemo(() => data.pairs.filter((pair) => pair.id.toLowerCase().includes(search.toLowerCase()) && (filter === "all" || (filter === "gears" ? pair.improvement > 0 : pair.improvement < 0))).sort((a, b) => sort === "difference" ? b.improvement - a.improvement : sort === "gears" ? a.gearsMse - b.gearsMse : a.additiveMse - b.additiveMse), [data, search, filter, sort]);
  return <section id="results">
    <p className="drawer-description">Twenty whole gene pairs held out. Errors compare population means on each pair’s top 20 evaluation genes. Lower is better.</p>
    <div className="result-filters"><input aria-label="Search evaluated gene pairs" placeholder="Find a gene or pair" value={search} onChange={(event) => setSearch(event.target.value)}/><select aria-label="Filter pair results" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All pairs</option><option value="gears">GEARS closer</option><option value="additive">Additive closer</option></select><select aria-label="Sort pair results" value={sort} onChange={(event) => setSort(event.target.value)}><option value="difference">GEARS advantage</option><option value="gears">GEARS error</option><option value="additive">Additive error</option></select></div>
    <div className="table-scroll"><table className="pair-table"><caption className="sr-only">Mean squared error on held-out gene pairs. Positive advantage means GEARS has lower error.</caption><thead><tr><th scope="col">Gene pair</th><th scope="col">Additive</th><th scope="col">GEARS</th><th scope="col">Advantage</th></tr></thead><tbody>{pairs.map((pair) => <tr key={pair.id} data-selected={pair.id === selectedId}><th scope="row"><button onClick={() => onSelect(pair.id)} aria-label={`Explore ${pair.genes.join(" and ")}`}>{pair.genes.join(" + ")}</button></th><td>{pair.additiveMse.toFixed(4)}</td><td>{pair.gearsMse.toFixed(4)}</td><td className={pair.improvement > 0 ? "positive" : "negative"}>{pair.improvement > 0 ? "+" : ""}{pair.improvement.toFixed(4)}</td></tr>)}</tbody></table></div>
    {pairs.length === 0 && <p className="drawer-description">No saved pairs match your search.</p>}
    <p className="fine-print">{pairs.length} of {data.summary.total} pairs · Advantage = additive MSE − GEARS MSE</p>
    <a className="text-link" href={assetPath("/data/pair-results.csv")} download>Download results CSV</a>
  </section>;
}

function Methodology({ data }: { data: DashboardData }) {
  return <section className="method-copy">
    <p className="drawer-description">Norman et al., 2019 · Human K562 cells · CRISPR activation</p>
    <h3>What is being measured</h3>
    <p>CRISPR activation increases target-gene activity. Single-cell RNA sequencing measures the resulting expression pattern. These plots compare observed and predicted population means on 20 evaluation genes selected for each pair.</p>
    <h3>Hold out the whole pair</h3>
    <p>A random cell split could expose the same gene pair during training and testing. This split keeps entire pairs and equivalent labels together: {data.run.trainPairs} training, {data.run.valPairs} validation, and {data.run.testPairs} test pairs. It tests new combinations of genes already seen individually.</p>
    <h3>The baseline led overall</h3>
    <p>Additive predicts mean(A) + mean(B) − mean(control). Mean test MSE was {data.summary.additiveMse.toFixed(4)} for additive, {data.summary.gearsMse.toFixed(4)} for GEARS, and {data.summary.controlMse.toFixed(4)} for control. GEARS was closer on {data.summary.wins} of {data.summary.total} pairs.</p>
    <p>GEARS learned from {data.run.trainingCells.toLocaleString()} sampled outcome cells, capped at {data.run.cellCap} per original condition. Additive used all 54,931 training single-gene/control observations. Both use the training-control reference. The comparison includes different sample sizes.</p>
    <h3>Evaluation and limits</h3>
    <p>The top-20 DE rankings use held-out observations for scoring only. Equivalent labels are averaged within each pair, then pairs receive equal weight. Expression values use the existing processed scale, centered on training-control means.</p>
    <p>The local GEARS runtime ({data.run.runtimeVariant}) corrects training-batch processing and uses a quartic single-cell loss. Evaluation uses condition-mean MSE. Validation selected epoch {data.run.bestEpoch} from {data.run.epochsCompleted} completed epochs; seed {data.run.seed}. {data.summary.checkpointVerified ? "CPU checkpoint reload was verified." : "Checkpoint verification is unavailable."}</p>
    <p>One split, one seed, a previously inspected test set, and shared genes limit interpretation. Mean additive − GEARS MSE: {data.summary.meanImprovement.toFixed(4)}. The descriptive 95% pair-bootstrap interval is [{data.summary.bootstrap95.map((number) => number.toFixed(4)).join(", ")}]. It does not quantify biological-replicate uncertainty.</p>
    <h3>How to read the constellation</h3>
    <p>Nodes are actual perturbation targets. Edges are saved evaluated pairs. Position, depth, and distance are decorative. Selecting a pair reads a completed prediction; unsupported combinations have no saved result.</p>
    <p className="fingerprint">Split SHA-256<br/>{data.provenance.splitSha256}</p>
    <div className="source-links"><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6746554/" target="_blank" rel="noreferrer">Original study</a><a href={`${repositoryUrl}/blob/main/AUDIT.md`} target="_blank" rel="noreferrer">Training audit</a><a href={`${repositoryUrl}/blob/main/project06_gears_medium.ipynb`} target="_blank" rel="noreferrer">Results notebook</a><a href="https://github.com/snap-stanford/GEARS" target="_blank" rel="noreferrer">GEARS</a><a href={assetPath("/data/results.json")} download>Measured JSON</a></div>
  </section>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<ViewMode>("explorer");
  const [selectedGenes, setSelectedGenes] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [drawer, setDrawer] = useState<DrawerName>(null);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [resetNonce, setResetNonce] = useState(0);
  const pairSelector = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    loadDashboardData(controller.signal).then((value) => {
      const requested = new URL(window.location.href).searchParams.get("pair")?.split("+") ?? [];
      const known = new Set(value.nodes.map((node) => node.id));
      setSelectedGenes(requested.length === 2 && requested[0] !== requested[1] && requested.every((gene) => known.has(gene)) ? requested : []);
      setData(value);
    }).catch((issue: Error) => { if (issue.name !== "AbortError") setError(issue.message); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!data) return;
    const url = new URL(window.location.href);
    if (selectedGenes.length === 2) url.searchParams.set("pair", canonicalPair(selectedGenes)); else url.searchParams.delete("pair");
    window.history.replaceState(null, "", url);
  }, [data, selectedGenes]);

  useEffect(() => {
    if (phase !== "entering") return;
    const timer = window.setTimeout(() => setPhase("explore"), reducedMotion ? 0 : 1650);
    return () => window.clearTimeout(timer);
  }, [phase, reducedMotion]);
  useEffect(() => { if (phase === "explore") pairSelector.current?.focus({ preventScroll: true }); }, [phase]);

  const selectedPair = selectedGenes.length === 2 ? data?.pairs.find((pair) => pair.id === canonicalPair(selectedGenes)) ?? null : null;
  const unsupported = selectedGenes.length === 2 && !selectedPair;
  const partners = new Set(data?.pairs.filter((pair) => selectedGenes.length === 1 && pair.genes.includes(selectedGenes[0])).flatMap((pair) => pair.genes) ?? []);
  const selectGene = (gene: string) => {
    const next = selectedGenes.includes(gene) ? selectedGenes.filter((value) => value !== gene) : selectedGenes.length < 2 ? [...selectedGenes, gene] : [selectedGenes[0], gene];
    setSelectedGenes(next);
    if (next.length === 2) setDrawer(null);
  };
  const selectPair = (id: string) => { const pair = data?.pairs.find((value) => value.id === id); if (pair) { setSelectedGenes(pair.genes); setDrawer(null); } };

  return <main className="observatory" data-phase={phase}>
    <h1 className="sr-only">CRISPR Perturbation Explorer</h1>
    {data && <SceneBoundary onFailure={() => { setSceneFailed(true); setSceneReady(true); }}><ConstellationScene data={data} entered={phase !== "intro"} interactive={phase === "explore"} reducedMotion={reducedMotion} selectedGenes={selectedGenes} selectedPairId={selectedPair?.id ?? null} resetNonce={resetNonce} onReady={() => setSceneReady(true)} onGeneSelect={selectGene} onPairSelect={selectPair}/></SceneBoundary>}
    {phase === "intro" && !error && <button className="intro-entry" aria-label="Enter constellation" disabled={!data || !sceneReady} onClick={() => setPhase("entering")}><span className="entry-reticle" aria-hidden="true"><i/><i/></span><span className="sr-only">Enter constellation</span></button>}
    {!data && !error && <span role="status" className="sr-only">Loading the measured experiment</span>}
    {error && <section role="alert" className="scene-error"><h2>The saved results couldn’t be loaded.</h2><p>{error}</p><button className="text-link" onClick={() => setRetry((value) => value + 1)}>Try again</button></section>}
    {data && <div className="scene-interface" inert={phase !== "explore"} aria-hidden={phase !== "explore"}>
      <header className="scene-header">
        <a className="scene-wordmark" href="#" onClick={(event) => { event.preventDefault(); setPhase("intro"); setDrawer(null); }}>CRISPR<span>/ 06</span></a>
        <div className="scene-pair-picker"><select ref={pairSelector} aria-label="Select an evaluated gene pair" value={selectedPair?.id ?? ""} onChange={(event) => selectPair(event.target.value)}><option value="" disabled>Choose a saved pair</option>{data.pairs.map((pair) => <option key={pair.id} value={pair.id}>{pair.genes.join(" + ")}</option>)}</select></div>
        <nav aria-label="Experiment navigation"><button onClick={() => setDrawer("pairs")}>Pairs</button><button onClick={() => setDrawer("method")}>Methods</button><a href={repositoryUrl} aria-label="View project source" target="_blank" rel="noreferrer"><Code2 size={17}/></a></nav>
      </header>
      <div className="mode-control"><span className={mode === "explorer" ? "active" : ""}>Explorer</span><Switch className="scene-switch" aria-label="Scientist mode" checked={mode === "scientist"} onCheckedChange={(checked) => setMode(checked ? "scientist" : "explorer")}/><span className={mode === "scientist" ? "active" : ""}>Scientist</span></div>
      <aside className={`result-thread ${selectedGenes.length ? "has-selection" : ""}`} aria-label="Selected gene pair result" aria-live="polite">
        <div className="thread-actions"><span className="section-label">{selectedGenes.length ? "Selected pair" : "Constellation / 20 pairs"}</span>{selectedGenes.length > 0 && <button onClick={() => setSelectedGenes([])}>Clear</button>}</div>
        <ResultsPanel pair={selectedPair} mode={mode} unsupported={unsupported} selectedGenes={selectedGenes}/>
      </aside>
      <div className="scene-tools"><button onClick={() => setDrawer("genes")}>Choose genes</button><button className="icon-control" aria-label="Reset gene-pair graph view" onClick={() => setResetNonce((value) => value + 1)}><RotateCcw size={16}/></button><span className="navigation-hint">Drag to orbit · scroll to approach</span></div>
      <footer className="scene-footer"><div><span>Norman 2019 · K562 · CRISPRa</span><span className="footer-detail">{data.run.trainingCells.toLocaleString()} sampled cells · decorative layout</span></div><button onClick={() => setDrawer("method")} className="overall-result"><span>Additive <b>{data.summary.additiveMse.toFixed(4)}</b> / GEARS <b>{data.summary.gearsMse.toFixed(4)}</b></span><span className="footer-detail">Overall top-20 DE MSE · additive led · GEARS closer on {data.summary.wins}/{data.summary.total}</span></button></footer>
      {sceneFailed && <p className="fallback-note">The 3D view is unavailable. Use the saved-pair selector or Choose genes.</p>}
    </div>}
    {data && <Drawer open={drawer !== null} title={drawer === "pairs" ? "All evaluated pairs" : drawer === "method" ? "The experiment" : "Choose genes"} onClose={() => setDrawer(null)}>
      {drawer === "pairs" && <PairResults data={data} selectedId={selectedPair?.id ?? null} onSelect={selectPair}/>}
      {drawer === "method" && <Methodology data={data}/>}
      {drawer === "genes" && <section><p className="drawer-description">Select two genes. Highlighted partners have saved evaluated results; other combinations may have no result.</p><div className="gene-index">{data.nodes.map((node) => <button key={node.id} aria-label={node.label} aria-pressed={selectedGenes.includes(node.id)} data-partner={partners.has(node.id)} onClick={() => selectGene(node.id)}>{node.label}<span>{selectedGenes.includes(node.id) ? "Selected" : partners.has(node.id) ? "Saved partner" : ""}</span></button>)}</div></section>}
    </Drawer>}
  </main>;
}
