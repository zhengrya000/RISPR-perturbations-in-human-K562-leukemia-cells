"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import { AdditiveBlending, CanvasTexture, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, SphereGeometry, Sprite, SpriteMaterial } from "three";
import SpriteText from "three-spritetext";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { constellationLayout, type SceneNode } from "@/lib/constellation-layout";
import type { DashboardData, PairResult } from "@/lib/types";

interface Props {
  data: DashboardData;
  entered: boolean;
  interactive: boolean;
  reducedMotion: boolean;
  selectedGenes: string[];
  selectedPairId: string | null;
  resetNonce: number;
  onReady: () => void;
  onGeneSelect: (id: string) => void;
  onPairSelect: (id: string) => void;
}

export default function ConstellationScene({ data, entered, interactive, reducedMotion, selectedGenes, selectedPairId, resetNonce, onReady, onGeneSelect, onPairSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const graph = useRef<ForceGraphMethods<SceneNode, PairResult> | undefined>(undefined);
  const initialized = useRef(false);
  const arrived = useRef(false);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredPair, setHoveredPair] = useState<string | null>(null);

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
    ? Math.max(160, size.height * (selectedGenes.length ? 0.57 : 0.79) - 265)
    : Math.max(250, size.height - 230);
  const projection = Math.min(usableWidth / 720, usableHeight / 550);
  const distance = Math.max(700, Math.max(1, size.height) / (2 * Math.tan(Math.PI / 8) * projection) + 40);
  const pixelsPerUnit = Math.max(1, size.height) / (2 * Math.tan(Math.PI / 8) * distance);
  const target = {
    x: mobile ? 0 : (size.width / 2 - (usableWidth / 2 + 36)) / pixelsPerUnit,
    y: mobile ? (114 + usableHeight / 2 - size.height / 2) / pixelsPerUnit : 0,
    z: 0,
  };
  const introDistance = Math.max(3400, distance * 4.5);
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
    graph.current.cameraPosition({ x: 0, y: 0, z: 3400 }, { x: 0, y: 0, z: 0 }, 0);
    const controls = graph.current.controls() as OrbitControls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 150;
    controls.maxDistance = 20000;
    controls.autoRotate = false;
    setReady(true);
    onReady();
  }, [onReady]);

  useEffect(() => {
    if (!ready || !graph.current) return;
    const travel = entered && !arrived.current && !reducedMotion;
    // OrbitControls must stay enabled while its target is tweened; DOM pointer
    // events keep the scene untouchable until the entry transition completes.
    const controls = graph.current.controls() as OrbitControls;
    controls.enabled = entered;
    if (!entered) controls.target.set(0, 0, 0);
    graph.current.cameraPosition(
      entered ? { x: target.x, y: target.y, z: distance } : { x: 0, y: 0, z: introDistance },
      entered ? target : { x: 0, y: 0, z: 0 },
      reducedMotion ? 0 : travel ? 1600 : entered ? 650 : 0,
    );
    arrived.current = entered;
  }, [entered, ready, reducedMotion, size.width, size.height, distance, resetNonce]); // Mobile framing reserves room for the continuous results area.

  const nodeObject = useCallback((node: SceneNode) => {
    const selected = selectedGenes.includes(node.id);
    const related = partners.has(node.id);
    const focused = selected || hovered === node.id;
    const dimmed = selectedGenes.length === 1 && !related && !focused;
    const color = focused ? "#e0cf9e" : related ? "#ece7d9" : "#a8b2c1";
    const group = new Group();
    const radius = (mobile ? 5 : 2.5) * (focused ? 1.4 : 1);
    group.add(new Mesh(new SphereGeometry(radius, 12, 8), new MeshBasicMaterial({ color, transparent: true, opacity: entered ? (dimmed ? 0.28 : 0.95) : 0.32 })));
    const glow = new Sprite(new SpriteMaterial({ map: texture, color, transparent: true, opacity: focused ? 0.65 : entered ? 0.14 : 0.04, blending: AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(radius * (focused ? 10 : 7));
    group.add(glow);
    if (entered && (!mobile || focused || related)) {
      const label = new SpriteText(node.label);
      label.color = focused ? "#f0e7cd" : dimmed ? "#48515e" : "#8b96a7";
      label.fontFace = "Menlo, Consolas, monospace";
      label.fontSize = 60;
      label.textHeight = (focused ? 14 : 12) * 2 * distance * Math.tan(Math.PI / 8) / Math.max(1, size.height);
      label.material.depthWrite = false;
      label.position.x = node.labelSide * (label.scale.x / 2 + radius + 5);
      group.add(label);
    }
    return group;
  }, [selectedGenes, partners, hovered, entered, mobile, distance, size.height, texture]);

  return <div ref={container} className="constellation-canvas" style={{ pointerEvents: interactive ? "auto" : "none" }} aria-label="Interactive three-dimensional map of the evaluated gene pairs">
    {size.width > 0 && <ForceGraph3D<SceneNode, PairResult>
      ref={graph}
      graphData={graphData}
      width={size.width}
      height={size.height}
      backgroundColor="#07090d"
      controlType="orbit"
      numDimensions={3}
      warmupTicks={0}
      cooldownTicks={0}
      showNavInfo={false}
      enableNodeDrag={false}
      enableNavigationControls={entered}
      enablePointerInteraction={interactive}
      nodeThreeObject={nodeObject}
      nodeLabel={() => ""}
      linkLabel={() => ""}
      linkColor={(pair) => pair.id === selectedPairId || pair.id === hoveredPair ? "#d6c69a" : pair.improvement > 0 ? "#7f97b3" : "#af9881"}
      linkOpacity={entered ? 0.36 : 0.025}
      linkWidth={(pair) => pair.id === selectedPairId || pair.id === hoveredPair ? 0.65 : 0.15}
      linkDirectionalParticles={0}
      onEngineStop={initialize}
      onNodeHover={(node) => setHovered(node ? String(node.id) : null)}
      onLinkHover={(pair) => setHoveredPair(pair ? pair.id : null)}
      onNodeClick={(node) => onGeneSelect(String(node.id))}
      onLinkClick={(pair) => onPairSelect(pair.id)}
    />}
  </div>;
}
