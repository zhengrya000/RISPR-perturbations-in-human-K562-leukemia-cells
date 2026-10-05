"use client";

import { useId, useState } from "react";
import { ArrowDownRight, ChevronDown, ChevronUp, FlaskConical, Info, Table2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PairResult } from "@/lib/types";

interface ResultsPanelProps {
  pair: PairResult | null;
  mode: "explorer" | "scientist";
  unsupported?: boolean;
  selectedGenes: string[];
}

const COLORS = {
  observed: "#e9f1f4",
  additive: "#7bd6d0",
  gears: "#ff947d",
  control: "#8399a8",
};

function fixed(value: number, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : "Unavailable";
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${fixed(value, 3)}`;
}

export default function ResultsPanel({ pair, mode, unsupported = false, selectedGenes }: ResultsPanelProps) {
  const [showTable, setShowTable] = useState(false);
  const componentId = useId();
  const headingId = `${componentId}-heading`;
  const tableId = `${componentId}-table`;
  const chartId = `${componentId}-chart`;

  if (unsupported || !pair) {
    return (
      <section
        aria-labelledby={headingId}
        className="specimen-ticket relative flex min-h-[540px] min-w-0 flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#101b23] p-6 text-[#e9f1f4] sm:p-7"
      >
        <div className="flex items-center gap-2 font-mono text-xs tracking-[0.18em] text-[#9aadb8]">
          <FlaskConical size={14} aria-hidden="true" />
          SAVED EXPERIMENT
        </div>
        <div className="my-auto py-14">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#7bd6d0]/20 bg-[#7bd6d0]/5 text-[#7bd6d0]">
            <Info size={23} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.16em] text-[#ff947d]">
            {unsupported ? "Outside the saved results" : "An experiment, waiting to be explored"}
          </p>
          <h2 id={headingId} className="max-w-[25ch] text-2xl font-medium leading-tight tracking-tight">
            {unsupported ? "This pair has no evaluated result here." : "Choose a gene pair to see its response."}
          </h2>
          {selectedGenes.length > 0 && (
            <p className="mt-4 break-words font-mono text-sm text-[#7bd6d0]">{selectedGenes.join(" + ")}</p>
          )}
          <p className="mt-4 max-w-[42ch] text-base leading-7 text-[#a1b1bc]">
            {unsupported
              ? "Select one of the 20 saved pairs to compare measurements with the additive and GEARS predictions."
              : "Each saved pair shows what was measured after CRISPR activation and how closely two predictions follow it."}
          </p>
        </div>
        <p className="border-t border-dashed border-white/10 pt-5 text-xs leading-6 text-[#91a5b1]">
          Results are from a completed experiment. Selecting genes explores saved predictions.
        </p>
      </section>
    );
  }

  const expression = pair.features.map((feature) => ({
    geneId: feature.geneId,
    geneName: feature.geneName,
    observed: feature.observed - feature.control,
    additive: feature.additive - feature.control,
    gears: feature.gears - feature.control,
  }));
  const maximumChange = Math.max(0.1, ...expression.flatMap((gene) => [
    Math.abs(gene.observed), Math.abs(gene.additive), Math.abs(gene.gears),
  ]));
  const errorData = [
    { model: "Control", mse: pair.controlMse, color: COLORS.control },
    { model: "Additive", mse: pair.additiveMse, color: COLORS.additive },
    { model: "GEARS", mse: pair.gearsMse, color: COLORS.gears },
  ];
  const winner = pair.additiveMse < pair.gearsMse ? "Additive" : pair.gearsMse < pair.additiveMse ? "GEARS" : null;
  const winnerColor = winner === "GEARS" ? COLORS.gears : COLORS.additive;
  const errorDifference = Math.abs(pair.additiveMse - pair.gearsMse);

  return (
    <section
      aria-labelledby={headingId}
      className="specimen-ticket relative min-w-0 overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#101b23] text-[#e9f1f4] shadow-[0_22px_70px_-30px_rgba(0,0,0,0.65)]"
    >
      <header className="relative border-b border-dashed border-white/15 px-6 pb-6 pt-6 sm:px-7">
        <div className="mb-6 flex items-center justify-between gap-3 font-mono text-xs tracking-[0.16em] text-[#9aadb8]">
          <span className="flex items-center gap-2"><FlaskConical size={14} aria-hidden="true" /> SAVED EXPERIMENT</span>
          <span className="rounded-full border border-white/10 px-2.5 py-1 text-xs tracking-[0.12em]">K562 / CRISPRa</span>
        </div>
        <h2 id={headingId} className="flex flex-wrap items-center gap-2.5 font-mono text-xl font-medium tracking-tight sm:text-2xl">
          <span className="rounded-lg border border-[#ff947d]/20 bg-[#ff947d]/[0.06] px-3 py-1.5 text-[#ffac97]">{pair.genes[0]}</span>
          <span className="text-lg font-light text-[#718b9b]" aria-hidden="true">+</span>
          <span className="sr-only">and</span>
          <span className="rounded-lg border border-[#7bd6d0]/20 bg-[#7bd6d0]/[0.06] px-3 py-1.5 text-[#9be6e0]">{pair.genes[1]}</span>
        </h2>
        <p className="mt-4 text-xs leading-6 text-[#9aadb8]">
          {pair.cells.toLocaleString()} measured cells <span className="mx-1.5 text-[#526977]">/</span> {pair.features.length} evaluation genes
        </p>
        <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
          <ArrowDownRight size={16} className="mt-0.5 shrink-0" style={{ color: winnerColor }} aria-hidden="true" />
          <div>
            <p className="text-sm font-medium" style={{ color: winnerColor }}>
              {winner ? `${winner} has the lower prediction error for this pair.` : "Both predictions have the same error for this pair."}
            </p>
            <p className="mt-1 text-sm leading-5 text-[#98aeba]">
              {mode === "scientist"
                ? `Absolute MSE difference: ${fixed(errorDifference, 6)}. Lower MSE is better.`
                : "A smaller error means the prediction is closer to what was measured."}
            </p>
          </div>
        </div>
      </header>

      <div className="px-5 pb-6 pt-6 sm:px-7">
        <div className="grid grid-cols-3 gap-2">
          {errorData.map(({ model, mse, color }) => (
            <div key={model} className="min-w-0 rounded-xl border border-white/[0.065] bg-[#0b161e] px-2.5 py-3 sm:px-3">
              <p className="font-mono text-xs uppercase tracking-[0.11em]" style={{ color }}>{model}</p>
              <p className="mt-2 font-mono text-base tracking-tight text-[#e9f1f4] sm:text-lg">{fixed(mse)}</p>
              <p className="mt-1 text-xs text-[#8097a5]">{mode === "scientist" ? "TOP-20 DE MSE" : "prediction error"}</p>
            </div>
          ))}
        </div>

        <figure aria-labelledby={chartId} className="mt-7">
          <figcaption id={chartId} className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium tracking-tight">{mode === "scientist" ? "Condition-mean expression change" : "How the genes responded"}</h3>
            <span className="font-mono text-xs uppercase tracking-[0.12em] text-[#91a7b4]">vs. control</span>
          </figcaption>
          <ul aria-label="Chart legend" className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#bccbd3]">
            {[
              { name: "Observed", color: COLORS.observed, borderStyle: "solid" },
              { name: "Additive", color: COLORS.additive, borderStyle: "dashed" },
              { name: "GEARS", color: COLORS.gears, borderStyle: "dotted" },
            ].map(({ name, color, borderStyle }) => (
              <li key={name} className="flex items-center gap-1.5">
                <span aria-hidden="true" className="w-4 border-t-2" style={{ borderColor: color, borderStyle }} />{name}
              </li>
            ))}
          </ul>
          <div className="h-[245px] min-w-0 sm:h-[270px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={75}>
              <LineChart data={expression} margin={{ top: 8, right: 9, bottom: 12, left: -17 }} accessibilityLayer>
                <CartesianGrid stroke="#29404d" strokeDasharray="2 5" vertical={false} />
                <XAxis dataKey="geneName" tick={{ fill: "#93a9b6", fontSize: 12 }} angle={-55} textAnchor="end" height={68} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
                <YAxis domain={[-maximumChange * 1.12, maximumChange * 1.12]} tick={{ fill: "#93a9b6", fontSize: 12 }} tickFormatter={(value) => Number(value).toFixed(1)} tickLine={false} axisLine={false} width={44} />
                <ReferenceLine y={0} stroke="#637e8f" strokeDasharray="3 3" />
                <Tooltip
                  cursor={{ stroke: "#738e9e", strokeDasharray: "3 3" }}
                  content={({ active, payload, label }) => active && payload?.length ? (
                    <div className="rounded-xl border border-white/15 bg-[#15232d] p-3 text-sm shadow-xl">
                      <p className="mb-2 font-mono font-medium text-[#e9f1f4]">{String(label)}</p>
                      {payload.map((entry) => (
                        <div key={String(entry.dataKey)} className="flex min-w-[130px] justify-between gap-5 py-0.5">
                          <span style={{ color: entry.color }}>{entry.name}</span>
                          <span className="font-mono text-[#e9f1f4]">{signed(Number(entry.value))}</span>
                        </div>
                      ))}
                      <p className="mt-2 border-t border-white/10 pt-2 text-xs text-[#93a9b6]">Expression change from control</p>
                    </div>
                  ) : null}
                />
                <Line type="linear" dataKey="observed" name="Observed" stroke={COLORS.observed} strokeWidth={2} dot={{ r: 2, fill: COLORS.observed, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line type="linear" dataKey="additive" name="Additive" stroke={COLORS.additive} strokeWidth={1.7} strokeDasharray="5 4" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line type="linear" dataKey="gears" name="GEARS" stroke={COLORS.gears} strokeWidth={1.7} strokeDasharray="2 3" dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-center text-xs text-[#8aa1af]">Measured genes · existing processed expression units</p>
        </figure>

        <div className="mt-5 rounded-xl border border-[#7bd6d0]/10 bg-[#7bd6d0]/[0.035] px-3.5 py-3">
          <p className="text-sm leading-6 text-[#a8beca]">
            {mode === "scientist"
              ? "Values are condition means centered on the training-control mean. Gene order follows the saved top-20 DE ranking, which uses held-out observations for evaluation only."
              : "Each point is a measured gene. Above zero means more expression than control; below zero means less. The predictions try to follow the observed response."}
          </p>
        </div>

        <button
          type="button"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((visible) => !visible)}
          className="mt-4 flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2.5 text-sm text-[#b9ccd6] transition-colors hover:border-[#7bd6d0]/35 hover:bg-[#7bd6d0]/5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7bd6d0] motion-reduce:transition-none"
        >
          <span className="flex items-center gap-2"><Table2 size={13} aria-hidden="true" />{showTable ? "Hide gene values" : "View all gene values"}</span>
          {showTable ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
        </button>
        <div id={tableId} hidden={!showTable} className="mt-3 max-h-[320px] overflow-auto rounded-lg border border-white/10">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Expression changes from training control for {pair.genes.join(" and ")}; values are in processed expression units.</caption>
            <thead className="sticky top-0 bg-[#15232d] text-[#abc1ce]">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">Gene</th>
                <th scope="col" className="px-2 py-3 text-right font-medium">Observed</th>
                <th scope="col" className="px-2 py-3 text-right font-medium">Additive</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">GEARS</th>
              </tr>
            </thead>
            <tbody>
              {expression.map((gene) => (
                <tr key={gene.geneId} className="border-t border-white/[0.05] text-[#b6c8d2]">
                  <th scope="row" className="px-3 py-2.5 font-mono font-normal" title={gene.geneId}>{gene.geneName}</th>
                  <td className="px-2 py-2.5 text-right font-mono">{signed(gene.observed)}</td>
                  <td className="px-2 py-2.5 text-right font-mono text-[#7bd6d0]">{signed(gene.additive)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-[#ff947d]">{signed(gene.gears)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {mode === "scientist" && (
          <figure className="mt-6 border-t border-dashed border-white/15 pt-5">
            <figcaption className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">Prediction error</h3>
              <span className="font-mono text-xs uppercase tracking-[0.12em] text-[#91a7b4]">TOP-20 DE MSE ↓</span>
            </figcaption>
            <div className="h-[150px] min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={75}>
                <BarChart data={errorData} layout="vertical" margin={{ top: 0, right: 9, bottom: 0, left: -10 }} accessibilityLayer>
                  <CartesianGrid stroke="#29404d" strokeDasharray="2 5" horizontal={false} />
                  <XAxis type="number" domain={[0, "auto"]} tick={{ fill: "#93a9b6", fontSize: 12 }} tickFormatter={(value) => Number(value).toFixed(2)} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="model" tick={{ fill: "#b4c7d2", fontSize: 12 }} width={70} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.035)" }}
                    content={({ active, payload }) => active && payload?.length ? (
                      <div className="rounded-xl border border-white/15 bg-[#15232d] px-3 py-2 text-sm shadow-xl">
                        <span className="text-[#b9ccd6]">{String(payload[0].payload.model)} MSE </span>
                        <span className="font-mono text-[#e9f1f4]">{fixed(Number(payload[0].value), 6)}</span>
                      </div>
                    ) : null}
                  />
                  <Bar dataKey="mse" name="Top-20 DE MSE" barSize={13} radius={[0, 3, 3, 0]} isAnimationActive={false}>
                    {errorData.map((entry) => <Cell key={entry.model} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>
        )}
      </div>
      <footer className="border-t border-dashed border-white/15 px-6 py-4 sm:px-7">
        <p className="font-mono text-xs leading-5 tracking-[0.03em] text-[#849eae]">
          {mode === "scientist" ? `CONDITION ${pair.condition} · HELD-OUT PAIR · EXPLORATORY TEST` : "Saved CRISPR activation response · expression measurements and predictions"}
        </p>
      </footer>
    </section>
  );
}
