"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { Code2, RotateCcw } from "lucide-react";
import ResultsPanel from "./ResultsPanel";
import InfoHint from "./InfoHint";
import { Instructions, Methodology, PairResults } from "./ExperimentViews";
import { Switch } from "./ui/switch";
import { loadDashboardData } from "@/lib/data";
import { assetPath, canonicalPair, repositoryUrl } from "@/lib/utils";
import type { DashboardData, ViewMode } from "@/lib/types";

const ConstellationScene = dynamic(() => import("./ConstellationScene"), { ssr: false });
type Phase = "intro" | "entering" | "explore";
type SceneView = "explorer" | "pairs" | "method" | "genes" | "instructions";
const viewNames: Record<SceneView, string> = { explorer: "Selected gene pair result", pairs: "All evaluated pairs", method: "The experiment", genes: "Choose genes", instructions: "Explorer instructions" };

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<ViewMode>("explorer");
  const [selectedGenes, setSelectedGenes] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [view, setView] = useState<SceneView>("explorer");
  const [shownView, setShownView] = useState<SceneView>("explorer");
  const [leaving, setLeaving] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [resetNonce, setResetNonce] = useState(0);
  const pairSelector = useRef<HTMLSelectElement>(null);
  const thread = useRef<HTMLElement>(null);
  const lastViewTrigger = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    if (view === shownView) { setLeaving(false); return; }
    setLeaving(true);
    const timer = window.setTimeout(() => { setShownView(view); setLeaving(false); }, reducedMotion ? 0 : 160);
    return () => window.clearTimeout(timer);
  }, [view, shownView, reducedMotion]);
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = 0;
    if (shownView !== "explorer") thread.current?.focus({ preventScroll: true });
    else lastViewTrigger.current?.focus({ preventScroll: true });
  }, [shownView]);
  useEffect(() => {
    const back = (event: KeyboardEvent) => {
      if (event.key === "Escape" && view !== "explorer") setView("explorer");
    };
    window.addEventListener("keydown", back);
    return () => window.removeEventListener("keydown", back);
  }, [view]);

  const selectedPair = selectedGenes.length === 2 ? data?.pairs.find((pair) => pair.id === canonicalPair(selectedGenes)) ?? null : null;
  const unsupported = selectedGenes.length === 2 && !selectedPair;
  const partners = new Set(data?.pairs.filter((pair) => selectedGenes.length === 1 && pair.genes.includes(selectedGenes[0])).flatMap((pair) => pair.genes) ?? []);
  const openView = (next: SceneView) => {
    if (next !== "explorer") lastViewTrigger.current = document.activeElement as HTMLElement;
    setView((current) => current === next ? "explorer" : next);
  };
  const returnToIntro = () => { setView("explorer"); setPhase("intro"); };
  const selectGene = (gene: string) => {
    const next = selectedGenes.includes(gene) ? selectedGenes.filter((value) => value !== gene) : selectedGenes.length < 2 ? [...selectedGenes, gene] : [selectedGenes[0], gene];
    setSelectedGenes(next);
    if (next.length === 2) setView("explorer");
  };
  const selectPair = (id: string) => { const pair = data?.pairs.find((value) => value.id === id); if (pair) { setSelectedGenes(pair.genes); setView("explorer"); } };

  return <main className="observatory" data-phase={phase} data-view={view}>
    <h1 className="sr-only">CRISPR Perturbation Explorer</h1>
    {data && <SceneBoundary onFailure={() => { setSceneFailed(true); setSceneReady(true); }}><ConstellationScene data={data} entered={phase !== "intro"} interactive={phase === "explore"} contextOpen={view !== "explorer"} reducedMotion={reducedMotion} selectedGenes={selectedGenes} selectedPairId={selectedPair?.id ?? null} resetNonce={resetNonce} onReady={() => setSceneReady(true)} onGeneSelect={selectGene} onPairSelect={selectPair}/></SceneBoundary>}
    <div className="scene-grain" style={{ backgroundImage: `url("${assetPath("/grain.svg")}")` }} aria-hidden="true"/>
    {phase !== "explore" && !error && <section className="intro-hub" aria-label="Project introduction" inert={phase !== "intro"} aria-hidden={phase !== "intro"}>
      <span className="intro-index">A computational biology study / 06</span>
      <h2>CRISPR<br/><em>Constellation</em><span className="intro-punct" aria-hidden="true">·</span></h2>
      <p className="intro-description">Predicting two-gene activation responses.</p>
      <p className="intro-skills"><span>Graph neural networks</span><span>Single-cell RNA-seq</span><span>Bioinformatics</span></p>
      <button className="intro-entry" aria-label="Enter constellation" disabled={!data || !sceneReady} onClick={() => setPhase("entering")}><span className="entry-reticle" aria-hidden="true"><i/><i/></span><span>{!data || !sceneReady ? "Preparing the scene" : "Enter constellation"}</span></button>
    </section>}
    <span className="project-signature">CRISPR Constellation <span>·</span> Ryan Zheng</span>
    {!data && !error && <span role="status" className="sr-only">Loading the measured experiment</span>}
    {error && <section role="alert" className="scene-error"><h2>The saved results couldn’t be loaded.</h2><p>{error}</p><button className="text-link" onClick={() => setRetry((value) => value + 1)}>Try again</button></section>}
    {data && <div className="scene-interface" inert={phase !== "explore"} aria-hidden={phase !== "explore"}>
      <header className="scene-header">
        <a className="scene-wordmark" href="#" onClick={(event) => { event.preventDefault(); returnToIntro(); }}>CRISPR<span>/ 06</span></a>
        <div className="scene-pair-picker"><select ref={pairSelector} aria-label="Select an evaluated gene pair" value={selectedPair?.id ?? ""} onChange={(event) => selectPair(event.target.value)}><option value="" disabled>Choose a saved pair</option>{data.pairs.map((pair) => <option key={pair.id} value={pair.id}>{pair.genes.join(" + ")}</option>)}</select></div>
        <nav aria-label="Experiment navigation"><button aria-pressed={view === "pairs"} onClick={() => openView("pairs")}>Pairs</button><button aria-pressed={view === "method"} onClick={() => openView("method")}>Methods</button><a href={repositoryUrl} aria-label="View project source" target="_blank" rel="noreferrer"><Code2 size={17}/></a></nav>
      </header>
      <div className="mode-control"><span className={mode === "explorer" ? "active" : ""}>Explorer</span><Switch className="scene-switch" aria-label="Scientist mode" checked={mode === "scientist"} onCheckedChange={(checked) => setMode(checked ? "scientist" : "explorer")}/><span className={mode === "scientist" ? "active" : ""}>Scientist</span></div>
      <aside ref={thread} tabIndex={-1} className={`result-thread ${selectedGenes.length ? "has-selection" : ""} ${shownView !== "explorer" ? "context-thread" : ""}`} aria-label={viewNames[shownView]} data-transition={leaving ? "leaving" : "ready"}>
        <div key={shownView} className="thread-content">
          {shownView === "explorer" && <><div className="thread-actions"><span className="section-label">{selectedGenes.length ? "Selected pair" : "Constellation / 20 pairs"}</span>{selectedGenes.length > 0 && <button onClick={() => setSelectedGenes([])}>Clear</button>}</div><div aria-live="polite"><ResultsPanel pair={selectedPair} mode={mode} unsupported={unsupported} selectedGenes={selectedGenes} onSelectPair={selectPair}/></div></>}
          {shownView === "pairs" && <PairResults data={data} selectedId={selectedPair?.id ?? null} onSelect={selectPair}/>}
          {shownView === "method" && <Methodology data={data}/>}
          {shownView === "instructions" && <Instructions onSelect={selectPair}/>}
          {shownView === "genes" && <section aria-labelledby="genes-title"><h2 id="genes-title" className="view-title">Choose genes.</h2><p className="view-description">Two targets · one expression response<br/>Brighter partners · saved evaluated pairs</p><div className="gene-index">{data.nodes.map((node) => <button key={node.id} aria-label={node.label} aria-pressed={selectedGenes.includes(node.id)} data-partner={partners.has(node.id)} onClick={() => selectGene(node.id)}>{node.label}<span>{selectedGenes.includes(node.id) ? "Selected" : partners.has(node.id) ? "Saved partner" : ""}</span></button>)}</div></section>}
        </div>
      </aside>
      <div className="scene-tools"><button aria-pressed={view === "genes"} onClick={() => openView("genes")}>Choose genes</button><button className="icon-control" aria-label="Reset gene-pair graph view" onClick={() => setResetNonce((value) => value + 1)}><RotateCcw size={16}/></button><button className="instructions-link" aria-pressed={view === "instructions"} onClick={() => openView("instructions")}>Instructions</button><span className="navigation-hint">Drag to orbit · scroll to approach</span></div>
      <footer className="scene-footer"><div><span>Norman 2019 · <InfoHint definition="K562 · human leukemia cell line used in this dataset.">K562</InfoHint> · <InfoHint definition="CRISPR activation · increases target-gene activity.">CRISPRa</InfoHint></span><span className="footer-detail">{data.run.trainingCells.toLocaleString()} sampled cells · decorative layout</span></div><button onClick={() => openView("method")} className="overall-result"><span>Additive <b>{data.summary.additiveMse.toFixed(4)}</b> / GEARS <b>{data.summary.gearsMse.toFixed(4)}</b></span><span className="footer-detail">Top-20 DE MSE · additive led · GEARS closer {data.summary.wins}/{data.summary.total}</span></button></footer>
      <button className="scene-back" onClick={() => view !== "explorer" ? setView("explorer") : returnToIntro()}>{view !== "explorer" ? "← Explorer" : "← Intro"}</button>
      {sceneFailed && <p className="fallback-note">The 3D view is unavailable. Use the saved-pair selector or Choose genes.</p>}
    </div>}
  </main>;
}
