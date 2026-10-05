"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import { AdditiveBlending, CanvasTexture, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, SphereGeometry, Sprite, SpriteMaterial } from "three";
import SpriteText from "three-spritetext";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { constellationLayout, type SceneNode } from "@/lib/constellation-layout";
import type { DashboardData, PairResult, ViewMode } from "@/lib/types";
import { palettes } from "@/lib/palette";

interface Props {
  data: DashboardData;
  mode: ViewMode;
  entered: boolean;
  interactive: boolean;
  contextOpen: boolean;
  reducedMotion: boolean;
  selectedGenes: string[];
  selectedPairId: string | null;
  resetNonce: number;
  onReady: () => void;
  onGeneSelect: (id: string) => void;
  onPairSelect: (id: string) => void;
}

export default function ConstellationScene({ data, mode, entered, interactive, contextOpen, reducedMotion, selectedGenes, selectedPairId, resetNonce, onReady, onGeneSelect, onPairSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<ForceGraphMethods<SceneNode, PairResult> | undefined>(undefined);
  const initialized = useRef(false);
  const arrived = useRef(false);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredPair, setHoveredPair] = useState<string | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const palette = palettes[mode];

  useEffect(() => { let mounted = true; document.fonts.ready.then(() => { if (mounted) setFontsReady(true); }); return () => { mounted = false; }; }, []);

  useEffect(() => {
    const element = container.current!;
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => ({
    nodes: constellationLayout(data.nodes, data.pairs),
    links: data.pairs.map((pair) => ({ ...pair, source: pair.genes[0], target: pair.genes[1] })),
  }), [data]);
  const partners = useMemo(() => {
    const result = new Set<string>();
    if (selectedGenes.length === 1) data.pairs.filter((pair) => pair.genes.includes(selectedGenes[0])).forEach((pair) => pair.genes.forEach((gene) => result.add(gene)));
    return result;
  }, [data, selectedGenes]);

  const mobile = size.width < 760;
  const usableWidth = mobile ? Math.max(180, size.width - 70) : Math.max(300, size.width - 430);
  const usableHeight = mobile
    ? Math.max(160, size.height * (selectedGenes.length || contextOpen ? 0.57 : 0.79) - 265)
    : Math.max(250, size.height - 230);
  const projection = Math.min(usableWidth / 720, usableHeight / 550);
  const distance = Math.max(700, Math.max(1, size.height) / (2 * Math.tan(Math.PI / 8) * projection) + 40);
  const pixelsPerUnit = Math.max(1, size.height) / (2 * Math.tan(Math.PI / 8) * distance);
  const target = {
    x: mobile ? 0 : (size.width / 2 - (usableWidth / 2 + 36)) / pixelsPerUnit,
    y: mobile ? (114 + usableHeight / 2 - size.height / 2) / pixelsPerUnit : 0,
    z: 0,
  };
  const introProjection = Math.min(usableWidth / 720, (mobile ? Math.max(160, size.height * 0.79 - 265) : usableHeight) / 550);
  const introDistance = Math.max(700, Math.max(1, size.height) / (2 * Math.tan(Math.PI / 8) * introProjection) + 40) * (mobile ? 1.35 : 1.55);
  const introPixelsPerUnit = Math.max(1, size.height) / (2 * Math.tan(Math.PI / 8) * introDistance);
  const introTarget = {
    x: mobile ? 0 : (size.width / 2 - size.width * 0.61) / introPixelsPerUnit,
    y: (size.height * (mobile ? 0.65 : 0.56) - size.height / 2) / introPixelsPerUnit,
    z: 0,
  };
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,0.9)");
    gradient.addColorStop(0.18, "rgba(255,255,255,0.4)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);

  const initialize = useCallback(() => {
    if (initialized.current || !graph.current) return;
    initialized.current = true;
    const camera = graph.current.camera() as PerspectiveCamera;
    camera.fov = 45;
    camera.updateProjectionMatrix();
    graph.current.cameraPosition({ ...introTarget, z: introDistance }, introTarget, 0);
    const controls = graph.current.controls() as OrbitControls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 150;
    controls.maxDistance = 20000;
    controls.autoRotate = false;
    setReady(true);
    onReady();
  }, [onReady, introDistance, introTarget.x, introTarget.y]);

  useEffect(() => {
    if (!ready || !graph.current) return;
    const travel = entered && !arrived.current && !reducedMotion;
    // OrbitControls must stay enabled while its target is tweened; DOM pointer
    // events keep the scene untouchable until the entry transition completes.
    const controls = graph.current.controls() as OrbitControls;
    controls.enabled = true;
    graph.current.cameraPosition(
      entered ? { x: target.x, y: target.y, z: distance } : { ...introTarget, z: introDistance },
      entered ? target : introTarget,
      reducedMotion ? 0 : travel ? 1600 : entered ? 650 : arrived.current ? 1100 : 0,
    );
    arrived.current = entered;
  }, [entered, ready, reducedMotion, size.width, size.height, distance, introDistance, resetNonce]); // Mobile framing reserves room for the continuous results area.

  const nodeObject = useCallback((node: SceneNode) => {
    const selected = selectedGenes.includes(node.id);
    const related = partners.has(node.id);
    const focused = entered && (selected || hovered === node.id);
    const dimmed = entered && selectedGenes.length === 1 && !related && !focused;
    const color = focused ? palette.focus : entered && related ? palette.partner : palette.node;
    const group = new Group();
    const radius = (mobile ? 5 : 2.5) * (focused ? 1.4 : 1);
    group.add(new Mesh(new SphereGeometry(radius, 12, 8), new MeshBasicMaterial({ color, transparent: true, opacity: entered ? (dimmed ? 0.28 : 0.95) : 0.65 })));
    const glow = new Sprite(new SpriteMaterial({ map: texture, color, transparent: true, opacity: focused ? 0.65 : entered ? related ? 0.20 : 0.14 : 0.10, blending: AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(radius * (focused ? 10 : entered ? 7 : 6));
    group.add(glow);
    if (entered && (!mobile || focused || related)) {
      const label = new SpriteText(node.label);
      label.color = focused ? palette.label : related ? palette.partnerLabel : dimmed ? "#48515e" : "#8b96a7";
      label.fontFace = container.current ? getComputedStyle(container.current).fontFamily : "monospace";
      label.fontSize = 60;
      label.textHeight = (focused ? 14 : 12) * 2 * distance * Math.tan(Math.PI / 8) / Math.max(1, size.height);
      label.material.depthWrite = false;
      label.position.x = node.labelSide * (label.scale.x / 2 + radius + 5);
      group.add(label);
    }
    return group;
  }, [selectedGenes, partners, hovered, entered, mobile, distance, size.height, texture, palette, fontsReady]);

  return <div ref={container} className="constellation-canvas" style={{ pointerEvents: interactive ? "auto" : "none" }} aria-label="Interactive three-dimensional map of the evaluated gene pairs">
    {size.width > 0 && <ForceGraph3D<SceneNode, PairResult>
      ref={graph}
      graphData={graphData}
      width={size.width}
      height={size.height}
      backgroundColor={palette.background}
      controlType="orbit"
      numDimensions={3}
      warmupTicks={0}
      cooldownTicks={0}
      showNavInfo={false}
      enableNodeDrag={false}
      enableNavigationControls={true}
      enablePointerInteraction={interactive}
      nodeThreeObject={nodeObject}
      nodeLabel={() => ""}
      linkLabel={() => ""}
      linkColor={(pair) => {
        if (entered && (pair.id === selectedPairId || pair.id === hoveredPair)) return `rgba(${palette.selectedEdge},1)`;
        const related = entered && selectedGenes.length === 1 && pair.genes.includes(selectedGenes[0]);
        const alpha = related ? 0.86 : entered && selectedGenes.length === 1 ? 0.64 : 0.72;
        const rgb = pair.improvement > 0 ? related ? palette.partnerGoodEdge : palette.goodEdge : related ? palette.partnerOtherEdge : palette.otherEdge;
        return `rgba(${rgb},${alpha})`;
      }}
      linkOpacity={entered ? 0.5 : 0.25}
      linkWidth={(pair) => !entered ? 0 : pair.id === selectedPairId || pair.id === hoveredPair ? 0.65 : selectedGenes.length === 1 && pair.genes.includes(selectedGenes[0]) ? 0.22 : 0.15}
      linkDirectionalParticles={0}
      onEngineStop={initialize}
      onNodeHover={(node) => setHovered(node ? String(node.id) : null)}
      onLinkHover={(pair) => setHoveredPair(pair ? pair.id : null)}
      onNodeClick={(node) => onGeneSelect(String(node.id))}
      onLinkClick={(pair) => onPairSelect(pair.id)}
    />}
  </div>;
}
