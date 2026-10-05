import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Points, PointsMaterial, type PerspectiveCamera, type Texture } from "three";
import { starPalettes } from "./palette";
import type { ViewMode } from "./types";

interface Framing {
  width: number;
  height: number;
  distance: number;
  target: { x: number; y: number };
  mobile: boolean;
  entered: boolean;
  mode: ViewMode;
}

/** Persistent atmospheric stars and intro-only DNA; neither represents data. */
export function createIntroAtmosphere(texture: Texture, framing: Framing) {
  const group = new Group();
  group.name = "Decorative DNA and distant stars";
  const sky = new Group(), helix = new Group();
  group.add(sky, helix);
  const geometries: BufferGeometry[] = [];
  const starMaterials: { material: PointsMaterial; colorIndex: number }[] = [];
  const layers: { group: Group; depth: number; movement: number }[] = [];
  const colors = {
    explorer: starPalettes.explorer.map((color) => new Color(color)),
    scientist: starPalettes.scientist.map((color) => new Color(color)),
  };
  const helixMaterials: (PointsMaterial | LineBasicMaterial)[] = [];
  let seed = 6719;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223; return (seed >>> 0) / 4294967296; };
  const halfHeight = (depth: number) => (framing.distance + depth) * Math.tan(Math.PI / 8);
  const aspect = framing.width / Math.max(1, framing.height);
  const geometry = (vertices: number[]) => {
    const value = new BufferGeometry();
    value.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometries.push(value);
    return value;
  };

  for (const [name, count, depth, size, opacity, movement] of [
    ["Distant stars", framing.mobile ? 250 : 500, 9000, 3, 0.62, 22],
    ["Middle stars", framing.mobile ? 150 : 300, 6500, 4.4, 0.68, 48],
    ["Nearby stars", framing.mobile ? 80 : 150, 4000, 6, 0.72, 80],
  ] as const) {
    const layer = new Group();
    layer.name = name;
    layers.push({ group: layer, depth, movement });
    sky.add(layer);
    const vertices = [[], [], []] as number[][];
    const height = depth * Math.tan(Math.PI / 8);
    // Overscan covers pointer travel at the screen edges, including portrait.
    const margin = (movement + 24) * height * 2 / Math.max(1, framing.height);
    for (let index = 0; index < count; index++) {
      vertices[index % 3].push(
        (random() * 2 - 1) * (height * aspect + margin),
        (random() * 2 - 1) * (height + margin),
        -depth,
      );
    }
    starPalettes[framing.entered ? framing.mode : "explorer"].forEach((color, index) => {
      const material = new PointsMaterial({ color, map: texture, size, sizeAttenuation: false, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
      starMaterials.push({ material, colorIndex: index });
      const points = new Points(geometry(vertices[index]), material);
      points.renderOrder = -100;
      layer.add(points);
    });
  }

  const depth = 300;
  const height = halfHeight(depth) * 2 * (framing.mobile ? 0.43 : 0.62);
  const radius = height * 0.115;
  helix.position.set(
    framing.target.x + halfHeight(depth) * aspect * (framing.mobile ? 0.48 : -0.57),
    framing.target.y + height * 0.04,
    -depth,
  );
  helix.rotation.z = framing.mobile ? -0.24 : -0.3;
  const strands: number[][] = [[], []];
  const dots: number[] = [], rungs: number[] = [];
  for (let index = 0; index <= 72; index++) {
    const theta = index / 72 * Math.PI * 3.8;
    const y = (index / 72 - 0.5) * height;
    const x = Math.cos(theta) * radius, z = Math.sin(theta) * radius;
    strands[0].push(x, y, z);
    strands[1].push(-x, y, -z);
    if (index % 4 === 0) { dots.push(x, y, z, -x, y, -z); rungs.push(x, y, z, -x, y, -z); }
  }
  strands.forEach((vertices, index) => {
    const segments: number[] = [];
    for (let offset = 3; offset < vertices.length; offset += 3) segments.push(...vertices.slice(offset - 3, offset + 3));
    const material = new LineBasicMaterial({ color: index ? starPalettes.explorer[2] : starPalettes.explorer[0], transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false });
    helixMaterials.push(material);
    helix.add(new LineSegments(geometry(segments), material));
  });
  const rungMaterial = new LineBasicMaterial({ color: "#ada3c7", transparent: true, opacity: 0.06, depthWrite: false });
  const dotMaterial = new PointsMaterial({ color: "#c0bed6", map: texture, size: 13, sizeAttenuation: true, transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false });
  helixMaterials.push(rungMaterial, dotMaterial);
  helix.add(new LineSegments(geometry(rungs), rungMaterial), new Points(geometry(dots), dotMaterial));
  // These objects are atmospheric only; they never become selectable gene nodes.
  group.traverse((object) => { object.raycast = () => {}; });
  const helixBase = helix.position.clone();
  const baseOpacities = helixMaterials.map((material) => material.opacity);
  let x = 0, y = 0, presence = framing.entered ? 0 : 1;
  helix.visible = !framing.entered;
  return {
    group,
    update(pointer: { x: number; y: number }, entered: boolean, reducedMotion: boolean, delta: number, camera: PerspectiveCamera, mode: ViewMode) {
      const ease = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 60) / 130);
      x += ((reducedMotion ? 0 : pointer.x) - x) * ease;
      y += ((reducedMotion ? 0 : pointer.y) - y) * ease;
      presence += ((entered ? 0 : 1) - presence) * (reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 60) / 240));
      const unitsPerPixel = (layerDepth: number) => halfHeight(layerDepth) * 2 / Math.max(1, framing.height);
      // Follow camera orientation for full coverage through orbit/flight, while
      // moving only the stars. Camera controls and gene positions stay independent.
      sky.position.copy(camera.position);
      sky.quaternion.copy(camera.quaternion);
      const tangent = Math.tan(camera.fov * Math.PI / 360);
      layers.forEach(({ group: layer, depth: layerDepth, movement }) => {
        const pixelScale = layerDepth * tangent * 2 / Math.max(1, framing.height);
        layer.position.set(x * movement * pixelScale, -y * movement * pixelScale, 0);
      });
      helix.position.copy(helixBase);
      helix.position.x += x * 14 * unitsPerPixel(depth);
      helix.position.y -= y * 14 * unitsPerPixel(depth);
      helix.rotation.y = x * 0.06;
      helix.rotation.x = y * 0.035;
      const starMode = entered ? mode : "explorer";
      const colorEase = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 60) / 200);
      starMaterials.forEach(({ material, colorIndex }) => { material.color.lerp(colors[starMode][colorIndex], colorEase); });
      helixMaterials.forEach((material, index) => { material.opacity = baseOpacities[index] * presence; });
      helix.visible = presence > 0.005;
    },
    dispose() {
      geometries.forEach((value) => value.dispose());
      starMaterials.forEach(({ material }) => material.dispose());
      helixMaterials.forEach((material) => material.dispose());
    },
  };
}
