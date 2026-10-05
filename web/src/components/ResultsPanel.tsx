"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PairResult, ViewMode } from "@/lib/types";

const colors = { observed: "#ece7dc", additive: "#cfaf8b", gears: "#8ca6c6", control: "#667183" };

export default function ResultsPanel({ pair, mode, unsupported, selectedGenes }: { pair: PairResult | null; mode: ViewMode; unsupported: boolean; selectedGenes: string[] }) {
  const [showTable, setShowTable] = useState(false);
  if (!pair) return <section className="empty-result">
    <h2>{unsupported ? "No saved result." : selectedGenes.length === 1 ? selectedGenes[0] : "Choose two genes."}</h2>
    <p>{unsupported ? `${selectedGenes.join(" + ")} has no saved test result in this explorer. Choose a saved pair to compare predictions.` : selectedGenes.length === 1 ? "Choose a highlighted partner to explore its measured response." : "Follow an edge, select its two genes, or choose a saved pair above."}</p>
    <div className="thread-key"><span style={{ color: colors.gears }}>— GEARS closer</span><span style={{ color: colors.additive }}>— Additive closer</span></div>
  </section>;

  const expression = pair.features.map((feature) => ({ gene: feature.geneName, observed: feature.observed - feature.control, additive: feature.additive - feature.control, gears: feature.gears - feature.control }));
  const maximum = Math.max(0.1, ...expression.flatMap((gene) => [Math.abs(gene.observed), Math.abs(gene.additive), Math.abs(gene.gears)])) * 1.1;
  const errors = [{ model: "Control", mse: pair.controlMse, color: colors.control }, { model: "Additive", mse: pair.additiveMse, color: colors.additive }, { model: "GEARS", mse: pair.gearsMse, color: colors.gears }];
  const winner = pair.improvement > 0 ? "GEARS" : pair.improvement < 0 ? "Additive" : "Neither model";
  return <section className="pair-response">
    <h2 aria-label={pair.genes.join(" and ")}>{pair.genes[0]}<span> + </span>{pair.genes[1]}</h2>
    <p className="response-context">{pair.cells.toLocaleString()} measured cells · 20 evaluation genes</p>
    <div className="error-ledger">{errors.map((error) => <div key={error.model}><span style={{ color: error.color }}>{error.model}</span><b>{error.mse.toFixed(4)}</b></div>)}</div>
    <p className="pair-verdict">{winner === "Neither model" ? "Both models have the same prediction error." : `${winner} has the lower prediction error for this pair.`}<span>{mode === "scientist" ? `Top-20 DE MSE. Additive − GEARS: ${pair.improvement.toFixed(6)}.` : "Lower error means a closer prediction."}</span></p>
    <figure className="expression-figure"><figcaption><h3>{mode === "scientist" ? "Condition-mean expression change" : "How the genes responded"}</h3><span>vs. control</span></figcaption>
      <div className="thread-key"><span style={{ color: colors.observed }}>— Observed</span><span style={{ color: colors.additive }}>┄ Additive</span><span style={{ color: colors.gears }}>┈ GEARS</span></div>
      <div className="expression-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><LineChart data={expression} margin={{ top: 8, right: 8, bottom: 0, left: -17 }} accessibilityLayer>
        <CartesianGrid stroke="#222936" strokeDasharray="2 6" vertical={false}/><XAxis dataKey="gene" tick={{ fill: "#8993a2", fontSize: 12 }} angle={-52} textAnchor="end" height={74} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16}/><YAxis domain={[-maximum, maximum]} tick={{ fill: "#8993a2", fontSize: 12 }} tickFormatter={(value) => Number(value).toFixed(1)} tickLine={false} axisLine={false} width={44}/><ReferenceLine y={0} stroke="#555f6f" strokeDasharray="3 5"/>
        <Tooltip contentStyle={{ background: "#12161d", border: "1px solid #303844", borderRadius: 0, fontSize: 12 }} formatter={(value) => Number(value).toFixed(3)}/>
        <Line dataKey="observed" name="Observed" stroke={colors.observed} strokeWidth={1.6} dot={false} activeDot={{ r: 3 }} isAnimationActive={false}/><Line dataKey="additive" name="Additive" stroke={colors.additive} strokeDasharray="5 4" strokeWidth={1.3} dot={false} isAnimationActive={false}/><Line dataKey="gears" name="GEARS" stroke={colors.gears} strokeDasharray="2 3" strokeWidth={1.3} dot={false} isAnimationActive={false}/>
      </LineChart></ResponsiveContainer></div>
    </figure>
    <p className="expression-note">{mode === "scientist" ? "Condition means minus the training-control mean. Gene order follows the saved top-20 DE ranking, used for evaluation only." : "Above zero: more expression than control. Below zero: less. Lines compare two predictions with the observed response."}</p>
    <button className="values-toggle" aria-expanded={showTable} aria-controls="expression-values" onClick={() => setShowTable((value) => !value)}>{showTable ? "Hide gene values" : "View all gene values"}<span aria-hidden="true">{showTable ? "−" : "+"}</span></button>
    <div id="expression-values" hidden={!showTable} className="gene-values-scroll"><table className="gene-values"><caption className="sr-only">Control-centered expression values for {pair.genes.join(" and ")}</caption><thead><tr><th scope="col">Gene</th><th scope="col">Observed</th><th scope="col">Additive</th><th scope="col">GEARS</th></tr></thead><tbody>{expression.map((gene) => <tr key={gene.gene}><th scope="row">{gene.gene}</th><td>{gene.observed.toFixed(3)}</td><td>{gene.additive.toFixed(3)}</td><td>{gene.gears.toFixed(3)}</td></tr>)}</tbody></table></div>
    {mode === "scientist" && <figure className="error-figure"><figcaption><h3>Prediction error</h3><span>MSE · lower is better</span></figcaption><div className="error-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={errors} layout="vertical" margin={{ top: 0, left: -10, right: 9 }} accessibilityLayer><CartesianGrid stroke="#222936" strokeDasharray="2 6" horizontal={false}/><XAxis type="number" tick={{ fill: "#8993a2", fontSize: 12 }} tickLine={false} axisLine={false} tickFormatter={(value) => Number(value).toFixed(2)}/><YAxis type="category" dataKey="model" tick={{ fill: "#8993a2", fontSize: 12 }} width={72} tickLine={false} axisLine={false}/><Tooltip contentStyle={{ background: "#12161d", border: "1px solid #303844", fontSize: 12 }} formatter={(value) => Number(value).toFixed(4)}/><Bar dataKey="mse" barSize={10} isAnimationActive={false}>{errors.map((error) => <Cell key={error.model} fill={error.color}/>)}</Bar></BarChart></ResponsiveContainer></div></figure>}
    {mode === "scientist" && <p className="condition-note">{pair.condition} · held-out pair · exploratory test</p>}
  </section>;
}
