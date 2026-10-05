"use client";

import dynamic from "next/dynamic";
import {
  Component,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type {
  ForceGraphMethods,
  LinkObject,
  NodeObject,
} from "react-force-graph-2d";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-64 items-center justify-center text-sm text-slate-400">
      Loading saved gene pairs…
    </div>
  ),
});

export interface GenePairGraphProps {
  nodes: { id: string; label: string }[];
  pairs: {
    id: string;
    genes: [string, string];
    gearsMse: number;
    additiveMse: number;
    improvement: number;
  }[];
  selectedPairId: string | null;
  selectedGenes: string[];
  onGeneSelect: (gene: string) => void;
  onPairSelect: (id: string) => void;
}

type RenderNode = NodeObject & GenePairGraphProps["nodes"][number] & {
  labelSide?: -1 | 1;
};
type RenderLink = LinkObject & GenePairGraphProps["pairs"][number];

class GraphBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function hash(value: string) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function constellationPositions(
  nodes: GenePairGraphProps["nodes"],
  pairs: GenePairGraphProps["pairs"],
) {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const pair of pairs) {
    if (pair.genes.every((gene) => adjacency.has(gene))) {
      adjacency.get(pair.genes[0])!.add(pair.genes[1]);
      adjacency.get(pair.genes[1])!.add(pair.genes[0]);
    }
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const gene of [...adjacency.keys()].sort()) {
    if (visited.has(gene)) continue;
    const pending = [gene];
    const component: string[] = [];
    visited.add(gene);
    while (pending.length) {
      const current = pending.shift()!;
      component.push(current);
      for (const partner of [...adjacency.get(current)!].sort()) {
        if (!visited.has(partner)) {
          visited.add(partner);
          pending.push(partner);
        }
      }
    }
    components.push(component.sort());
  }
  components.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  const positions = new Map<string, { x: number; y: number; labelSide: -1 | 1 }>();
  components.forEach((component, group) => {
    const groupAngle = ((group - 1) / Math.max(1, components.length - 1)) * Math.PI * 2 + 0.25;
    const centerX = group === 0 ? 0 : Math.cos(groupAngle) * 235;
    const centerY = group === 0 ? 0 : Math.sin(groupAngle) * 165;
    const radius = component.length === 1 ? 0 : 20 + component.length * 6;
    const rotation = component.length === 2
      ? Math.PI / 2
      : (hash(component.join("+")) / 4294967296) * Math.PI * 2;
    component.forEach((gene, index) => {
      const angle = rotation + (index / component.length) * Math.PI * 2;
      const relativeX = Math.cos(angle) * radius;
      positions.set(gene, {
        x: centerX + relativeX,
        y: centerY + Math.sin(angle) * radius,
        labelSide: Math.abs(relativeX) < 3
          ? centerX < 0 ? -1 : 1
          : relativeX < 0 ? -1 : 1,
      });
    });
  });
  return positions;
}

/** Only supplied, evaluated pairs become edges; positions carry no biology. */
export default function GenePairGraph({
  nodes,
  pairs,
  selectedPairId,
  selectedGenes,
  onGeneSelect,
  onPairSelect,
}: GenePairGraphProps) {
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<ForceGraphMethods | undefined>(undefined);
  const geneChooserId = useId();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [reducedMotion, setReducedMotion] = useState(true);
  const [hoveredGene, setHoveredGene] = useState<string | null>(null);
  const [hoveredPair, setHoveredPair] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [chooserOpen, setChooserOpen] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => {
      const bounds = element.getBoundingClientRect();
      setDimensions((previous) => {
        const next = {
          width: Math.max(1, Math.round(bounds.width)),
          height: Math.max(1, Math.round(bounds.height)),
        };
        return previous.width === next.width && previous.height === next.height
          ? previous
          : next;
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const validGenes = new Set(nodes.map((node) => node.id));
    const positions = constellationPositions(nodes, pairs);
    return {
      nodes: nodes.map((node): RenderNode => {
        const position = positions.get(node.id)!;
        return {
          ...node,
          ...position,
          fx: position.x,
          fy: position.y,
        };
      }),
      links: pairs
        .filter((pair) => pair.genes.every((gene) => validGenes.has(gene)))
        .map((pair): RenderLink => ({
          ...pair,
          source: pair.genes[0],
          target: pair.genes[1],
        })),
    };
  }, [nodes, pairs]);

  const selectedPair = useMemo(
    () => pairs.find((pair) => pair.id === selectedPairId),
    [pairs, selectedPairId],
  );
  const highlightedGenes = useMemo(
    () => new Set([...selectedGenes, ...(selectedPair?.genes ?? [])]),
    [selectedGenes, selectedPair],
  );
  const singleSelectedGene = selectedGenes.length === 1 ? selectedGenes[0] : null;
  const evaluatedPartners = useMemo(() => {
    const partners = new Set<string>();
    if (singleSelectedGene) {
      for (const pair of pairs) {
        if (pair.genes.includes(singleSelectedGene)) {
          pair.genes.forEach((gene) => {
            if (gene !== singleSelectedGene) partners.add(gene);
          });
        }
      }
    }
    return partners;
  }, [pairs, singleSelectedGene]);
  const pairUnderPointer = pairs.find((pair) => pair.id === hoveredPair);
  const geneUnderPointer = nodes.find((node) => node.id === hoveredGene);

  const fitView = useCallback(() => {
    // Include room for fixed screen-space labels outside the node bounds.
    graph.current?.zoomToFit(reducedMotion ? 0 : 450, 68);
  }, [reducedMotion]);

  useEffect(() => {
    if (dimensions.width && dimensions.height && graph.current) fitView();
  }, [dimensions.width, dimensions.height, fitView]);

  const zoomView = (factor: number) => {
    const current = graph.current;
    if (!current) return;
    const nextZoom = Math.max(0.35, Math.min(6, current.zoom() * factor));
    current.zoom(nextZoom, reducedMotion ? 0 : 180);
  };

  const drawNode = useCallback(
    (raw: NodeObject, context: CanvasRenderingContext2D, globalScale: number) => {
      const node = raw as RenderNode;
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const emphasized = highlightedGenes.has(node.id);
      const partner = evaluatedPartners.has(node.id);
      const hovered = hoveredGene === node.id;
      const dimmed = Boolean(singleSelectedGene) && !emphasized && !partner && !hovered;
      const radius = (emphasized ? 5 : hovered ? 4.5 : partner ? 4 : 3.2) / globalScale;
      context.save();

      if (emphasized || hovered) {
        const haloRadius = 18 / globalScale;
        const halo = context.createRadialGradient(x, y, 0, x, y, haloRadius);
        halo.addColorStop(0, "rgba(103, 232, 249, 0.30)");
        halo.addColorStop(1, "rgba(103, 232, 249, 0)");
        context.fillStyle = halo;
        context.beginPath();
        context.arc(x, y, haloRadius, 0, Math.PI * 2);
        context.fill();
      }

      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fillStyle = emphasized || hovered
        ? "#67e8f9"
        : partner ? "#9bddd8" : dimmed ? "#475569" : "#94a3b8";
      context.fill();
      context.strokeStyle = emphasized ? "#e0faff" : partner ? "#67e8f9" : "#182534";
      context.lineWidth = 1 / globalScale;
      context.stroke();
      context.font = `${12 / globalScale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const labelSide = node.labelSide ?? (x < 0 ? -1 : 1);
      context.textAlign = labelSide < 0 ? "right" : "left";
      context.textBaseline = "middle";
      context.fillStyle = emphasized || hovered
        ? "#e2faff"
        : partner ? "#b9eeea" : dimmed ? "rgba(148,163,184,0.35)" : "rgba(203,213,225,0.85)";
      if (dimensions.width >= 480 || globalScale > 0.8 || emphasized || partner || hovered) {
        context.fillText(node.label, x + (labelSide * 9) / globalScale, y + 0.5 / globalScale);
      }
      context.restore();
    },
    [highlightedGenes, hoveredGene, evaluatedPartners, singleSelectedGene, dimensions.width],
  );

  const geneButtons = (
    <div className="flex flex-wrap gap-2" aria-label="Select a gene from the saved pairs">
      {nodes.map((node) => (
        <button
          key={node.id}
          type="button"
          aria-label={node.label}
          aria-pressed={selectedGenes.includes(node.id)}
          data-evaluated-partner={evaluatedPartners.has(node.id) || undefined}
          title={evaluatedPartners.has(node.id) ? `Evaluated partner for ${singleSelectedGene}` : undefined}
          onClick={() => onGeneSelect(node.id)}
          className={`rounded-md border px-2.5 py-1.5 font-mono text-sm transition-colors hover:border-cyan-300/60 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${selectedGenes.includes(node.id) ? "border-cyan-200/55 bg-cyan-200/10 text-cyan-100" : evaluatedPartners.has(node.id) ? "border-cyan-300/35 bg-cyan-300/5 text-cyan-200" : singleSelectedGene ? "border-white/10 bg-slate-900/60 text-slate-400" : "border-white/15 bg-slate-900 text-slate-200"}`}
        >
          {node.label}
        </button>
      ))}
    </div>
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c131c]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">Pair constellation</h2>
          <p className="mt-1 text-xs text-slate-400">Saved test pairs • layout is decorative</p>
        </div>
        <div className="flex items-center gap-1" aria-label="Graph view controls">
          <button
            type="button"
            title="Zoom out"
            aria-label="Zoom out of gene-pair graph"
            onClick={() => zoomView(1 / 1.3)}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Zoom in"
            aria-label="Zoom into gene-pair graph"
            onClick={() => zoomView(1.3)}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            title="Reset view"
            aria-label="Reset gene-pair graph view"
            onClick={() => {
              fitView();
              setResetKey((key) => key + 1);
            }}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            <RotateCcw size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={container}
        className="relative h-[350px] w-full sm:h-[420px] xl:h-[460px]"
        role="group"
        aria-label="Interactive graph of saved evaluated gene pairs. Select a gene or click a pair edge."
      >
        <GraphBoundary
          key={resetKey}
          fallback={
            <div className="flex h-full flex-col justify-center gap-5 overflow-auto px-6 py-8">
              <p className="text-sm text-slate-300">
                The graph could not load. Use the gene chooser below or the saved-pair selector.
              </p>
              {!chooserOpen && geneButtons}
            </div>
          }
        >
          {dimensions.width > 0 && dimensions.height > 0 && (
            <ForceGraph2D
              ref={graph}
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
              backgroundColor="#0c131c"
              nodeId="id"
              nodeLabel={() => ""}
              nodeCanvasObject={drawNode}
              nodePointerAreaPaint={(node, color, context) => {
                context.fillStyle = color;
                context.beginPath();
                context.arc(node.x ?? 0, node.y ?? 0, 14 / (graph.current?.zoom() ?? 1), 0, Math.PI * 2);
                context.fill();
              }}
              linkLabel={() => ""}
              linkColor={(raw) => {
                const pair = raw as RenderLink;
                const active = pair.id === selectedPairId || pair.id === hoveredPair;
                const related = Boolean(singleSelectedGene && pair.genes.includes(singleSelectedGene));
                if (singleSelectedGene && !related && !active) return "rgba(148,163,184,0.075)";
                if (pair.improvement === 0) return active ? "#cbd5e1" : "rgba(148,163,184,0.3)";
                return pair.improvement > 0
                  ? active ? "#ff947d" : related ? "rgba(255,148,125,0.7)" : "rgba(255,148,125,0.28)"
                  : active ? "#7bd6d0" : related ? "rgba(123,214,208,0.7)" : "rgba(123,214,208,0.28)";
              }}
              linkWidth={(raw) => {
                const pair = raw as RenderLink;
                return pair.id === selectedPairId || pair.id === hoveredPair ? 2.4 : 0.85;
              }}
              linkDirectionalParticles={0}
              linkHoverPrecision={7}
              enableNodeDrag={false}
              minZoom={0.35}
              maxZoom={6}
              warmupTicks={0}
              cooldownTicks={0}
              onEngineStop={fitView}
              onNodeHover={(node) => {
                setHoveredGene(node ? String(node.id) : null);
              }}
              onLinkHover={(link) => {
                setHoveredPair(link ? String((link as RenderLink).id) : null);
              }}
              onNodeClick={(node) => onGeneSelect(String(node.id))}
              onLinkClick={(link) => onPairSelect(String((link as RenderLink).id))}
              onBackgroundClick={() => {
                setHoveredGene(null);
                setHoveredPair(null);
              }}
            />
          )}
        </GraphBoundary>

        <div className="pointer-events-none absolute bottom-4 left-5 max-w-[calc(100%-2.5rem)]" aria-live="polite">
          {geneUnderPointer ? (
            <div className="rounded-lg border border-cyan-300/20 bg-[#111f2c]/95 px-3 py-2 text-xs text-slate-200">
              <span className="font-mono text-cyan-200">{geneUnderPointer.label}</span>
              <span className="ml-2 text-slate-400">Click to select gene</span>
            </div>
          ) : pairUnderPointer ? (
            <div className="rounded-lg border border-white/15 bg-[#111f2c]/95 px-3 py-2 text-xs text-slate-200">
              <div className="font-mono">{pairUnderPointer.genes.join(" + ")}</div>
              <div className="mt-1 text-slate-400">
                GEARS MSE {pairUnderPointer.gearsMse.toFixed(4)}
                <span className="mx-2 text-slate-600">/</span>
                Additive {pairUnderPointer.additiveMse.toFixed(4)}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Click a gene or pair edge · scroll to zoom</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/8 px-5 py-3 text-xs text-slate-400">
        <span className="flex items-center gap-2">
          <span className="h-px w-5 bg-[#ff947d]" aria-hidden="true" />
          GEARS lower error
        </span>
        <span className="flex items-center gap-2">
          <span className="h-px w-5 bg-[#7bd6d0]" aria-hidden="true" />
          Additive lower error
        </span>
        <span className="ml-auto font-mono text-slate-500">{pairs.length} evaluated pairs</span>
      </div>

      <div className="border-t border-white/10">
        <button
          type="button"
          aria-label="Choose genes"
          aria-expanded={chooserOpen}
          aria-controls={geneChooserId}
          onClick={() => setChooserOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left text-sm text-slate-300 hover:bg-white/3 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-cyan-300"
        >
          <span>Choose genes <span className="ml-2 text-slate-500" aria-hidden="true">{nodes.length} available</span></span>
          <ChevronDown size={15} aria-hidden="true" className={`shrink-0 motion-safe:transition-transform ${chooserOpen ? "rotate-180" : ""}`} />
        </button>
        <div id={geneChooserId} hidden={!chooserOpen} className="px-5 pb-5">
          <p className="mb-3 text-xs leading-relaxed text-slate-400" aria-live="polite">
            {singleSelectedGene
              ? `${singleSelectedGene} has ${evaluatedPartners.size} evaluated ${evaluatedPartners.size === 1 ? "partner" : "partners"}. Highlighted genes have saved pair results; other combinations may have no result.`
              : "Select any two genes. Only the 20 saved pairs have evaluated results."}
          </p>
          {geneButtons}
        </div>
      </div>
    </section>
  );
}
