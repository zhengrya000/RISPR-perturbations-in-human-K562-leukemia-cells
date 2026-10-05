import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Points, PointsMaterial, type Texture } from "three";

interface Framing {
  width: number;
  height: number;
  distance: number;
  target: { x: number; y: number };
  mobile: boolean;
}

/** Decorative DNA and stars, separate from the evaluated-pair graph. */
export function createIntroAtmosphere(texture: Texture, framing: Framing) {
  const group = new Group();
  group.name = "Decorative DNA and distant stars";
  const far = new Group(), near = new Group(), helix = new Group();
  group.add(far, near, helix);
  const geometries: BufferGeometry[] = [];
  const starMaterials: { material: PointsMaterial; opacity: number; layer: "far" | "near" }[] = [];
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

  for (const [layer, count, size, opacity] of [
    ["far", framing.mobile ? 75 : 135, 14, 0.65],
    ["near", framing.mobile ? 30 : 60, 21, 0.75],
  ] as const) {
    const vertices = [[], [], []] as number[][];
    for (let index = 0; index < count; index++) {
      const depth = layer === "far" ? 1400 + random() * 1000 : 350 + random() * 650;
      const height = halfHeight(depth);
      vertices[index % 3].push(
        framing.target.x + (random() * 2 - 1) * height * aspect * 1.15,
        framing.target.y + (random() * 2 - 1) * height * 1.15,
        -depth,
      );
    }
    ["#d5c59b", "#a8c6df", "#b4a0ce"].forEach((color, index) => {
      const material = new PointsMaterial({ color, map: texture, size, sizeAttenuation: true, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
      starMaterials.push({ material, opacity, layer });
      (layer === "far" ? far : near).add(new Points(geometry(vertices[index]), material));
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
    const material = new LineBasicMaterial({ color: index ? "#b4a0ce" : "#a8c6df", transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false });
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
  let x = 0, y = 0, presence = 1;
  return {
    group,
    update(pointer: { x: number; y: number }, entered: boolean, reducedMotion: boolean, delta: number) {
      const ease = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 60) / 180);
      x += ((entered || reducedMotion ? 0 : pointer.x) - x) * ease;
      y += ((entered || reducedMotion ? 0 : pointer.y) - y) * ease;
      presence += ((entered ? 0 : 1) - presence) * (reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 60) / 240));
      const unitsPerPixel = (layerDepth: number) => halfHeight(layerDepth) * 2 / Math.max(1, framing.height);
      far.position.set(x * 3 * unitsPerPixel(1900), -y * 3 * unitsPerPixel(1900), 0);
      near.position.set(x * 8 * unitsPerPixel(675), -y * 8 * unitsPerPixel(675), 0);
      helix.position.copy(helixBase);
      helix.position.x += x * 5 * unitsPerPixel(depth);
      helix.position.y -= y * 5 * unitsPerPixel(depth);
      helix.rotation.y = x * 0.06;
      helix.rotation.x = y * 0.035;
      starMaterials.forEach(({ material, opacity, layer }) => { material.opacity = opacity * (presence + (1 - presence) * (layer === "far" ? 0.24 : 0.1)); });
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
