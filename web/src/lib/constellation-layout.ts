import type { DashboardData, PairResult } from "./types";

export interface SceneNode {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
  fz: number;
  labelSide: number;
}

function hash(text: string) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** A decorative 3D arrangement of connected components of actual saved pairs. */
export function constellationLayout(nodes: DashboardData["nodes"], pairs: PairResult[]) {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const pair of pairs) {
    adjacency.get(pair.genes[0])?.add(pair.genes[1]);
    adjacency.get(pair.genes[1])?.add(pair.genes[0]);
  }
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of [...adjacency.keys()].sort()) {
    if (seen.has(id)) continue;
    const group: string[] = [];
    const queue = [id];
    seen.add(id);
    while (queue.length) {
      const current = queue.shift()!;
      group.push(current);
      for (const partner of [...(adjacency.get(current) ?? [])].sort()) {
        if (!seen.has(partner)) { seen.add(partner); queue.push(partner); }
      }
    }
    groups.push(group.sort());
  }
  groups.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
  const positions = new Map<string, Omit<SceneNode, "id" | "label">>();
  groups.forEach((group, index) => {
    const angle = ((index - 1) / Math.max(1, groups.length - 1)) * Math.PI * 2 + 0.15;
    const cx = index === 0 ? -15 : Math.cos(angle) * 240;
    const cy = index === 0 ? 15 : Math.sin(angle) * 175;
    const cz = index === 0 ? 65 : (hash(group.join("+")) % 420) - 210;
    const radius = group.length === 1 ? 0 : 30 + group.length * 7;
    const rotation = group.length === 2 ? Math.PI / 2 : hash(group[0]) / 4294967296 * Math.PI * 2;
    group.forEach((id, offset) => {
      const theta = rotation + offset / group.length * Math.PI * 2;
      const dx = Math.cos(theta) * radius;
      const x = cx + dx;
      const y = cy + Math.sin(theta) * radius;
      // Tilt each component into depth, with small irregular offsets so orbiting
      // reveals a spatial constellation rather than a stack of flat rings.
      const tilt = hash(group[0]) / 4294967296 * Math.PI * 2;
      const z = cz + Math.sin(theta + tilt) * radius * 0.85 + (hash(id) % 90) - 45;
      positions.set(id, { x, y, z, fx: x, fy: y, fz: z, labelSide: Math.abs(dx) < 5 ? (cx < 0 ? -1 : 1) : (dx < 0 ? -1 : 1) });
    });
  });
  return nodes.map((node): SceneNode => ({ ...node, ...positions.get(node.id)! }));
}
