"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown, Code2, Compass, Download, FlaskConical, Info, Layers3, Link2, Search, Sparkles, X } from "lucide-react";
import GenePairGraph from "./GenePairGraph";
import ResultsPanel from "./ResultsPanel";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { loadDashboardData } from "@/lib/data";
import { assetPath, canonicalPair, repositoryUrl } from "@/lib/utils";
import type { DashboardData, PairResult, ViewMode } from "@/lib/types";

function Logo() {
  return <svg aria-hidden="true" width="31" height="31" viewBox="0 0 32 32" fill="none"><path d="m7 19 9-13 10 16-16 5Z" stroke="#7bd6d0" strokeWidth="1.2"/><circle cx="7" cy="19" r="2.4" fill="#ff947d"/><circle cx="16" cy="6" r="2.4" fill="#7bd6d0"/><circle cx="26" cy="22" r="2.4" fill="#7bd6d0"/><circle cx="10" cy="27" r="1.7" fill="#e9f1f4"/></svg>;
}

function Header() {
  return <header className="flex min-h-[83px] items-center justify-between gap-4 border-b border-white/[0.07]">
    <a href="#" aria-label="CRISPR Perturbation Explorer home" className="flex items-center gap-3"><Logo /><span className="text-sm font-semibold tracking-[.01em]">CRISPR<span className="ml-2 font-normal text-[#8da4b1]">/ explorer</span></span></a>
    <nav aria-label="Main navigation" className="flex items-center gap-5 text-xs text-[#a4b7c2] sm:gap-8"><a href="#explore" className="hidden transition-colors hover:text-white sm:block">Explore</a><a href="#results" className="transition-colors hover:text-white">Results</a><a href="#method" className="transition-colors hover:text-white">Method</a><a href={repositoryUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2.5 text-[#d5e0e6] transition-colors hover:border-white/30"><Code2 size={14} aria-hidden="true"/><span className="hidden sm:inline">View project</span><ArrowUpRight size={12} aria-hidden="true"/></a></nav>
  </header>;
}

function ModeToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return <div className="flex items-center gap-3 rounded-full border border-white/10 bg-[#101b23] px-4 py-3">
    <span className={`flex items-center gap-1.5 text-xs ${mode === "explorer" ? "text-[#a5e5de]" : "text-[#849aa8]"}`}><Compass size={13} aria-hidden="true"/>Explorer</span>
    <Switch checked={mode === "scientist"} onCheckedChange={(value) => onChange(value ? "scientist" : "explorer")} aria-label="Scientist mode" />
    <span className={`flex items-center gap-1.5 text-xs ${mode === "scientist" ? "text-[#d0c0f2]" : "text-[#849aa8]"}`}><FlaskConical size={13} aria-hidden="true"/>Scientist</span>
  </div>;
}

function StatStrip({ data }: { data: DashboardData }) {
  const metrics = [
    { label: "TRAINING CELLS", value: data.run.trainingCells.toLocaleString(), detail: `${data.run.cellCap} max. per condition`, color: "#e9f1f4" },
    { label: "TEST GENE PAIRS", value: String(data.summary.total).padStart(2, "0"), detail: "whole pairs held out", color: "#e9f1f4" },
    { label: "ADDITIVE ERROR", value: data.summary.additiveMse.toFixed(4), detail: "lower overall error", color: "#7bd6d0" },
    { label: "GEARS ERROR", value: data.summary.gearsMse.toFixed(4), detail: `${data.summary.wins}/${data.summary.total} pairs beat additive`, color: "#ff947d" },
  ];
  return <div className="mb-9"><div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-[#101b23]/70 md:grid-cols-4">
    {metrics.map(({ label, value, detail, color }, index) => <div key={label} className={`px-5 py-5 sm:px-6 ${index > 0 ? "border-l border-white/10" : ""} ${index > 1 ? "border-t border-white/10 md:border-t-0" : ""}`}><p className="kicker text-[#8da5b3]">{label}</p><p className="stat-value mt-2 text-3xl font-medium sm:text-[33px]" style={{ color }}>{value}</p><p className="mt-1.5 text-sm text-[#8fa6b4]">{detail}</p></div>)}
  </div><p className="mt-3 text-xs text-[#9ab2c0]">Errors are mean squared error across each pair’s top 20 evaluation genes, averaged equally over the 20 test pairs. Lower is better.</p></div>;
}

function PairSelector({ pairs, selectedId, selectedGenes, onPair, onGene, onClear }: { pairs: PairResult[]; selectedId: string | null; selectedGenes: string[]; onPair: (id: string) => void; onGene: (id: string) => void; onClear: () => void }) {
  return <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#101b23] p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><label htmlFor="pair-selector" className="kicker flex items-center gap-2 text-[#a6bcc7]"><Link2 size={13} aria-hidden="true"/>Your gene pair</label><button onClick={onClear} className="flex items-center gap-1 text-sm text-[#8ea6b3] hover:text-white" type="button">Clear<X size={12} aria-hidden="true"/></button></div>
    <div className="flex flex-wrap items-center gap-2">
      {[0, 1].map((index) => <span key={index} className={`flex min-h-9 min-w-25 items-center justify-center gap-2 rounded-lg border px-3 font-mono text-xs ${selectedGenes[index] ? "border-[#7bd6d0]/25 bg-[#7bd6d0]/5 text-[#afe9e3]" : "border-dashed border-white/15 text-[#718997]"}`}>{selectedGenes[index] || `Gene ${index + 1}`}{selectedGenes[index] && <button type="button" onClick={() => onGene(selectedGenes[index])} aria-label={`Deselect ${selectedGenes[index]}`} className="text-[#6c9d9c] hover:text-white"><X size={11}/></button>}</span>)}
      <span className="ml-auto font-mono text-xs text-[#8da5b3]">CRISPR ACTIVATION</span>
    </div>
    <div className="relative"><select id="pair-selector" aria-label="Select an evaluated gene pair" value={selectedId ?? ""} onChange={(event) => { if (event.target.value) onPair(event.target.value); }} className="w-full appearance-none rounded-xl border border-white/10 bg-[#0a151c] py-3 pl-3.5 pr-9 text-sm text-[#bcced8]"><option value="" disabled>Select from 20 evaluated pairs</option>{pairs.map((pair) => <option key={pair.id} value={pair.id}>{pair.genes.join(" + ")}</option>)}</select><ChevronDown aria-hidden="true" size={14} className="pointer-events-none absolute right-3 top-3.5 text-[#8da5b3]"/></div>
  </div>;
}

function ResultsTable({ data, onPair, selectedId }: { data: DashboardData; onPair: (id: string) => void; selectedId: string | null }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("difference");
  const pairs = useMemo(() => data.pairs.filter((pair) => pair.id.toLowerCase().includes(search.toLowerCase().replace(/\s/g, "")) && (filter === "all" || (filter === "gears" ? pair.improvement > 0 : pair.improvement <= 0))).sort((a, b) => sort === "difference" ? b.improvement - a.improvement : sort === "gears" ? a.gearsMse - b.gearsMse : a.additiveMse - b.additiveMse), [data, search, filter, sort]);
  return <section id="results" className="mt-20">
    <div className="mb-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="kicker mb-3 text-[#7bd6d0]">THE COMPLETE PICTURE</p><h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Every pair. Every comparison.</h2><p className="mt-3 max-w-2xl text-base leading-7 text-[#9aafbc]">A simpler model won overall. Explore the exceptions and the places where the graph model fell short.</p></div><Button asChild variant="outline" size="sm"><a href={assetPath("/data/pair-results.csv")} download><Download size={13}/>Download results</a></Button></div>
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101b23]/60">
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 p-4"><div className="relative min-w-40 flex-1"><Search size={14} className="absolute left-3 top-3 text-[#7f99a8]" aria-hidden="true"/><input aria-label="Search evaluated gene pairs" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search a gene or pair…" className="h-10 w-full rounded-lg border border-white/10 bg-[#0a151c] pl-9 pr-3 text-sm text-[#d5e1e8] placeholder:text-[#7f96a4]"/></div><select aria-label="Filter pair results" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#0a151c] px-3 text-sm text-[#abc1cf]"><option value="all">All pairs</option><option value="gears">GEARS closer</option><option value="additive">Additive closer</option></select><select aria-label="Sort pair results" value={sort} onChange={(event) => setSort(event.target.value)} className="h-10 rounded-lg border border-white/10 bg-[#0a151c] px-3 text-sm text-[#abc1cf]"><option value="difference">GEARS advantage ↓</option><option value="gears">GEARS error ↑</option><option value="additive">Additive error ↑</option></select></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left"><caption className="sr-only">Top-20 DE mean squared error on {data.summary.total} held-out gene pairs. Lower error is better. Positive advantage means GEARS performed better than additive.</caption><thead><tr className="border-b border-white/10 bg-white/[0.015] text-xs uppercase tracking-wider text-[#849cab]"><th scope="col" className="px-5 py-4 font-normal">Gene pair</th><th scope="col" className="px-4 py-4 text-right font-normal">Additive MSE</th><th scope="col" className="px-4 py-4 text-right font-normal">GEARS MSE</th><th scope="col" className="px-4 py-4 text-right font-normal">GEARS advantage</th><th scope="col" className="px-5 py-4 font-normal">Closer prediction</th></tr></thead><tbody>{pairs.map((pair) => <tr key={pair.id} className={`data-row border-b border-white/[0.045] text-sm ${pair.id === selectedId ? "bg-[#7bd6d0]/[0.025]" : ""}`}><th scope="row" className="px-5 py-4"><button onClick={() => { onPair(pair.id); document.getElementById("explore")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }} className="flex items-center gap-2 font-mono font-normal text-[#d0e0e8] hover:text-[#7bd6d0]" aria-label={`Explore ${pair.genes.join(" and ")}`}>{pair.genes.join(" + ")}<ArrowUpRight size={12} className="text-[#7792a2]" aria-hidden="true"/></button></th><td className="px-4 py-4 text-right font-mono text-[#a8c0cf]">{pair.additiveMse.toFixed(4)}</td><td className="px-4 py-4 text-right font-mono text-[#a8c0cf]">{pair.gearsMse.toFixed(4)}</td><td className={`px-4 py-4 text-right font-mono ${pair.improvement > 0 ? "text-[#7bd6d0]" : "text-[#ffad96]"}`}>{pair.improvement > 0 ? "+" : ""}{pair.improvement.toFixed(4)}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${pair.improvement > 0 ? "border-[#7bd6d0]/15 text-[#a5dfd9]" : "border-[#ff947d]/15 text-[#e8b09c]"}`}><Check size={10} aria-hidden="true"/>{pair.improvement > 0 ? "GEARS" : "Additive"}</span></td></tr>)}</tbody></table></div>
      {pairs.length === 0 && <p className="px-5 py-10 text-center text-sm text-[#91a8b6]">No saved pairs match your search.</p>}
      <p className="px-5 py-3 font-mono text-xs tracking-wide text-[#819aa9]">{pairs.length} OF {data.summary.total} PAIRS · ADVANTAGE = ADDITIVE MSE − GEARS MSE</p>
    </div>
  </section>;
}

function Methodology({ data }: { data: DashboardData }) {
  return <section id="method" className="mb-16 mt-20">
    <div className="mb-7 flex items-end justify-between gap-6"><div><p className="kicker mb-3 text-[#bda8e7]">BEHIND THE EXPERIMENT</p><h2 className="text-2xl font-medium tracking-tight sm:text-3xl">How to read this result.</h2></div><a href={`${repositoryUrl}/blob/main/AUDIT.md`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-[#a9c2ce] hover:text-white">Read the audit<ArrowUpRight size={13}/></a></div>
    <div className="grid gap-4 lg:grid-cols-3">
      <article className="rounded-2xl border border-white/10 bg-[#111b23] p-6"><span className="mb-5 flex size-10 items-center justify-center rounded-xl border border-[#7bd6d0]/20 bg-[#7bd6d0]/5 text-[#7bd6d0]"><FlaskConical size={18}/></span><p className="kicker mb-3 text-[#8fa7b6]">01 / THE BIOLOGY</p><h3 className="mb-3 text-lg font-medium">Turn up two genes.</h3><p className="text-base leading-7 text-[#a1b7c5]">CRISPR activation increases target-gene activity in human K562 cells. Single-cell RNA sequencing measures the resulting expression pattern. Here, we compare population means on 20 evaluation genes selected for each pair.</p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6746554/" target="_blank" rel="noreferrer" className="mt-5 flex items-center gap-1.5 text-xs text-[#7bd6d0]">Norman et al., 2019<ArrowUpRight size={12}/></a></article>
      <article className="rounded-2xl border border-white/10 bg-[#111b23] p-6"><span className="mb-5 flex size-10 items-center justify-center rounded-xl border border-[#bda8e7]/20 bg-[#bda8e7]/5 text-[#bda8e7]"><Layers3 size={18}/></span><p className="kicker mb-3 text-[#8fa7b6]">02 / THE SPLIT</p><h3 className="mb-3 text-lg font-medium">Hold out the whole pair.</h3><p className="text-base leading-7 text-[#a1b7c5]">A random cell split could expose the same gene pair in both training and testing. We hold out entire pairs and keep equivalent labels together. This tests new combinations of genes already seen individually.</p><div className="mt-5 flex items-center gap-2 font-mono text-xs"><span className="rounded-md border border-white/10 px-2 py-1.5 text-[#b2c6d2]">{data.run.trainPairs} train</span><span className="rounded-md border border-white/10 px-2 py-1.5 text-[#b2c6d2]">{data.run.valPairs} validation</span><span className="rounded-md border border-white/10 px-2 py-1.5 text-[#b2c6d2]">{data.run.testPairs} test</span></div></article>
      <article className="rounded-2xl border border-white/10 bg-[#111b23] p-6"><span className="mb-5 flex size-10 items-center justify-center rounded-xl border border-[#ff947d]/20 bg-[#ff947d]/5 text-[#ff947d]"><Info size={18}/></span><p className="kicker mb-3 text-[#8fa7b6]">03 / THE TAKEAWAY</p><h3 className="mb-3 text-lg font-medium">Give the baseline its credit.</h3><p className="text-base leading-7 text-[#a1b7c5]">Additive predicts mean(A) + mean(B) − mean(control). It has lower average error in this run. It also uses more single-gene observations than sampled GEARS, so this comparison includes different data sizes.</p><p className="mt-4 text-sm leading-6 text-[#bfabc1]">One split, one seed, and a previously inspected test set make this an exploratory finding.</p></article>
    </div>
    <details className="mt-5 rounded-xl border border-white/10 bg-white/[0.015] px-5 py-4"><summary className="cursor-pointer text-xs text-[#b5cad6]">Scientific details & provenance</summary><div className="mt-5 grid gap-6 text-base leading-7 text-[#a2b8c5] md:grid-cols-2"><div><p>Errors compare observed and predicted condition means on each condition’s saved top 20 differentially expressed genes. Equivalent labels are averaged within each pair, then pairs receive equal weight. DE rankings are used for scoring only.</p><p className="mt-3">This local GEARS variant with corrected training-batch processing ({data.run.runtimeVariant}) uses a quartic single-cell loss, while this evaluation uses mean-expression MSE. Its best checkpoint was selected by validation error at epoch {data.run.bestEpoch}, with {data.run.epochsCompleted} epochs completed.</p></div><div><p>Training used {data.run.trainingCells.toLocaleString()} sampled outcomes. The additive baseline used all 54,931 training single-gene/control cells. Both models use the training-control reference.</p><p className="mt-3">Mean additive − GEARS MSE: {data.summary.meanImprovement.toFixed(4)}. Descriptive 95% pair-bootstrap interval: [{data.summary.bootstrap95.map((value) => value.toFixed(4)).join(", ")}]. Shared genes limit independence between pairs.</p><p className="mt-3">{data.summary.checkpointVerified ? "CPU checkpoint reload verified." : "Checkpoint verification unavailable."} The constellation shows evaluated pairs; its positions and distances have no biological interpretation.</p></div><p className="break-all font-mono text-xs text-[#7993a4] md:col-span-2">Split SHA-256: {data.provenance.splitSha256}</p></div></details>
  </section>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<ViewMode>("explorer");
  const [selectedGenes, setSelectedGenes] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    loadDashboardData(controller.signal).then((value) => {
      setData(value);
      const query = new URL(window.location.href).searchParams.get("pair");
      const initial = value.pairs.find((pair) => pair.id === query) || value.pairs.find((pair) => pair.id === "IGDCC3+PRTG") || value.pairs[0];
      const requestedGenes = query?.split("+") ?? [];
      const knownGenes = new Set(value.nodes.map((node) => node.id));
      const isKnownPair = requestedGenes.length === 2 && requestedGenes[0] !== requestedGenes[1] && requestedGenes.every((gene) => knownGenes.has(gene));
      setSelectedGenes(isKnownPair ? requestedGenes : initial.genes);
    }).catch((issue: Error) => { if (issue.name !== "AbortError") setError(issue.message); });
    return () => controller.abort();
  }, [retry]);

  const selectedPair = useMemo(() => selectedGenes.length === 2 ? data?.pairs.find((pair) => pair.id === canonicalPair(selectedGenes)) ?? null : null, [data, selectedGenes]);
  const unsupported = selectedGenes.length === 2 && !selectedPair;

  useEffect(() => {
    if (!data) return;
    const url = new URL(window.location.href);
    if (selectedGenes.length === 2) url.searchParams.set("pair", canonicalPair(selectedGenes)); else url.searchParams.delete("pair");
    window.history.replaceState(null, "", url);
  }, [data, selectedGenes]);

  const onGeneSelect = (gene: string) => setSelectedGenes((previous) => previous.includes(gene) ? previous.filter((value) => value !== gene) : previous.length < 2 ? [...previous, gene] : [previous[0], gene]);
  const onPairSelect = (id: string) => { const pair = data?.pairs.find((value) => value.id === id); if (pair) setSelectedGenes(pair.genes); };

  return <div className="workspace-shell min-h-screen"><a href="#explore" className="skip-link">Skip to explorer</a><div className="mx-auto max-w-[1540px] px-5 sm:px-8 lg:px-12"><Header/>
    <main>
      <section className="rise-in flex flex-col justify-between gap-7 py-9 sm:py-11 lg:flex-row lg:items-end">
        <div><p className="kicker mb-4 flex items-center gap-2.5 text-[#9fc2c9]"><span className="status-dot size-1.5 rounded-full bg-[#7bd6d0]"/>NORMAN 2019 · A MEASURED ML EXPERIMENT</p><h1 className="display-title text-[43px] sm:text-[59px] lg:text-[65px]">Two genes.<span className="text-[#a5dad4]"> A new response.</span></h1></div>
        <p className="max-w-[380px] text-base leading-7 text-[#9fb4c1]">Can a graph neural network predict what happens when two genes are activated together?<span className="text-[#d0e1e8]"> Explore the evidence.</span></p>
      </section>
      {!data && !error && <div role="status" className="my-16 flex min-h-96 flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-[#101b23]"><Logo/><p className="text-sm text-[#a9c2ce]">Loading the measured experiment…</p></div>}
      {error && <section role="alert" className="my-16 rounded-2xl border border-[#ff947d]/20 bg-[#101b23] p-8"><h2 className="mb-3 text-xl">The saved results couldn’t be loaded.</h2><p className="mb-6 text-sm text-[#b1c4cf]">{error}</p><Button onClick={() => setRetry((value) => value + 1)}>Try again<ArrowRight size={15}/></Button></section>}
      {data && <><StatStrip data={data}/>
        <section id="explore" aria-label="Interactive gene-pair explorer">
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-[#101b23] text-[#9acdc8]"><Sparkles size={16} strokeWidth={1.5}/></span><div><h2 className="text-[15px] font-medium tracking-tight">The response constellation</h2><p className="mt-1 text-sm text-[#8ca5b5]">Choose two connected genes, or a saved pair.</p></div></div><ModeToggle mode={mode} onChange={setMode}/></div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(400px,1fr)]">
            <div className="min-w-0 space-y-4"><PairSelector pairs={data.pairs} selectedId={selectedPair?.id ?? null} selectedGenes={selectedGenes} onPair={onPairSelect} onGene={onGeneSelect} onClear={() => setSelectedGenes([])}/><GenePairGraph nodes={data.nodes} pairs={data.pairs} selectedPairId={selectedPair?.id ?? null} selectedGenes={selectedGenes} onGeneSelect={onGeneSelect} onPairSelect={onPairSelect}/>
              <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => onPairSelect("IGDCC3+PRTG")} className="group rounded-xl border border-white/10 bg-white/[0.025] p-4 text-left transition-colors hover:bg-white/[0.05]"><p className="kicker mb-2 text-[#ff947d]">WHERE GEARS WAS CLOSER</p><p className="flex items-center justify-between font-mono text-xs text-[#d1e7e7]">IGDCC3 + PRTG<ArrowUpRight size={14} className="text-[#7bd6d0]"/></p></button><button type="button" onClick={() => onPairSelect("ETS2+MAPK1")} className="group rounded-xl border border-white/10 bg-white/[0.025] p-4 text-left transition-colors hover:bg-white/[0.05]"><p className="kicker mb-2 text-[#7bd6d0]">WHERE ADDITIVE WAS CLOSER</p><p className="flex items-center justify-between font-mono text-xs text-[#ead9d2]">ETS2 + MAPK1<ArrowUpRight size={14} className="text-[#ff947d]"/></p></button></div>
              <p className="flex items-center gap-2 px-1 text-xs leading-5 text-[#8ca6b6]"><CheckCheck size={13} className="shrink-0 text-[#73a9a6]" aria-hidden="true"/>All displayed values come from saved results. Selection explores the completed experiment.</p>
            </div>
            <div aria-live="polite" aria-atomic="false" className="min-w-0"><ResultsPanel pair={selectedPair} mode={mode} selectedGenes={selectedGenes} unsupported={unsupported}/></div>
          </div>
        </section>
        <ResultsTable data={data} onPair={onPairSelect} selectedId={selectedPair?.id ?? null}/><Methodology data={data}/>
      </>}
    </main>
    <div className="soft-divider"/><footer className="flex flex-col justify-between gap-4 py-7 text-xs text-[#859eae] sm:flex-row sm:items-center"><div className="flex items-center gap-2"><Logo/><span>CRISPR Perturbation Explorer<span className="mx-2 text-[#506875]">/</span>K562 · CRISPR activation</span></div><div className="flex flex-wrap items-center gap-5"><a href={`${repositoryUrl}/blob/main/project06_gears_medium.ipynb`} target="_blank" rel="noreferrer" className="hover:text-white">Results notebook ↗</a><a href="https://github.com/snap-stanford/GEARS" target="_blank" rel="noreferrer" className="hover:text-white">GEARS ↗</a><a href={assetPath("/data/results.json")} download className="hover:text-white">Measured data ↓</a></div></footer>
    </div></div>;
}
