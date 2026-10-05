import { AdditiveBlending, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Points, PointsMaterial, TubeGeometry, Vector3, type PerspectiveCamera, type Texture } from "three";
import { starPalettes } from "./palette";
import type { ViewMode } from "./types";

interface Framing {
  width: number;
  height: number;
  mobile: boolean;
  entered: boolean;
  mode: ViewMode;
}

/** Persistent atmospheric stars and DNA; neither represents evaluated data. */
export function createIntroAtmosphere(texture: Texture, framing: Framing) {
  const group = new Group();
  group.name = "Decorative DNA and distant stars";
  const sky = new Group();
  group.add(sky);
  const geometries: BufferGeometry[] = [];
  const instances: InstancedMesh[] = [];
  const starMaterials: { material: PointsMaterial; colorIndex: number }[] = [];
  const layers: { group: Group; depth: number; movement: number }[] = [];
  const colors = {
    explorer: starPalettes.explorer.map((color) => new Color(color)),
    scientist: starPalettes.scientist.map((color) => new Color(color)),
  };
  const helixMaterials: { material: PointsMaterial | MeshBasicMaterial; opacity: number; colorIndex: number }[] = [];
  const helices: { group: Group; base: Vector3; depth: number; movement: number }[] = [];
  let seed = 6719;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223; return (seed >>> 0) / 4294967296; };
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

  const placements = framing.mobile ? [
    { x: 0.6, y: -0.025, height: 0.46, depth: 6500, tilt: -0.24, movement: 32, strength: 0.85 },
    { x: -0.8, y: 0.68, height: 0.23, depth: 9000, tilt: 0.4, movement: 24, strength: 0.7 },
  ] : [
    { x: -0.68, y: 0, height: 0.6, depth: 7000, tilt: -0.28, movement: 32, strength: 1 },
    { x: 0.72, y: 0.61, height: 0.25, depth: 8500, tilt: 0.42, movement: 44, strength: 0.75 },
    { x: 0.73, y: -0.64, height: 0.24, depth: 6500, tilt: -0.48, movement: 26, strength: 0.7 },
  ];
  placements.forEach((placement, index) => {
    const helix = new Group();
    helix.name = `Decorative double helix ${index + 1}`;
    const halfHeight = placement.depth * Math.tan(Math.PI / 8);
    const height = halfHeight * 2 * placement.height, radius = height * 0.115;
    const unitsPerPixel = halfHeight * 2 / Math.max(1, framing.height);
    const base = new Vector3(placement.x * halfHeight * aspect, placement.y * halfHeight, -placement.depth);
    helix.position.copy(base);
    helix.rotation.z = placement.tilt;
    sky.add(helix);
    helices.push({ group: helix, base, depth: placement.depth, movement: placement.movement });
    const strands: Vector3[][] = [[], []], dots: number[] = [];
    const rungs: { start: Vector3; end: Vector3 }[] = [];
    for (let step = 0; step <= 72; step++) {
      const theta = step / 72 * Math.PI * 3.8;
      const y = (step / 72 - 0.5) * height;
      const x = Math.cos(theta) * radius, z = Math.sin(theta) * radius;
      const start = new Vector3(x, y, z), end = new Vector3(-x, y, -z);
      strands[0].push(start); strands[1].push(end);
      if (step % 4 === 0) { dots.push(x, y, z, -x, y, -z); rungs.push({ start, end }); }
    }
    const meshMaterial = (colorIndex: number, opacity: number) => {
      const material = new MeshBasicMaterial({ color: starPalettes[framing.entered ? framing.mode : "explorer"][colorIndex], transparent: true, opacity, blending: AdditiveBlending, depthWrite: false });
      helixMaterials.push({ material, opacity, colorIndex });
      return material;
    };
    strands.forEach((points, strand) => {
      // Tubes provide real thickness; WebGL line width is fixed to one pixel.
      const tube = new TubeGeometry(new CatmullRomCurve3(points), 144, unitsPerPixel * 0.7, 6, false);
      geometries.push(tube);
      const mesh = new Mesh(tube, meshMaterial(strand ? 2 : 0, 0.24 * placement.strength));
      mesh.renderOrder = -90;
      helix.add(mesh);
    });
    const cylinder = new CylinderGeometry(unitsPerPixel * 0.45, unitsPerPixel * 0.45, 1, 6);
    geometries.push(cylinder);
    const connectors = new InstancedMesh(cylinder, meshMaterial(1, 0.12 * placement.strength), rungs.length);
    instances.push(connectors);
    const dummy = new Object3D(), direction = new Vector3(), up = new Vector3(0, 1, 0);
    rungs.forEach(({ start, end }, rung) => {
      direction.subVectors(end, start);
      dummy.position.copy(start).add(end).multiplyScalar(0.5);
      dummy.scale.set(1, direction.length(), 1);
      dummy.quaternion.setFromUnitVectors(up, direction.normalize());
      dummy.updateMatrix();
      connectors.setMatrixAt(rung, dummy.matrix);
    });
    connectors.instanceMatrix.needsUpdate = true;
    connectors.renderOrder = -90;
    helix.add(connectors);
    const material = new PointsMaterial({ color: starPalettes[framing.entered ? framing.mode : "explorer"][1], map: texture, size: 3.8, sizeAttenuation: false, transparent: true, opacity: 0.62 * placement.strength, blending: AdditiveBlending, depthWrite: false });
    helixMaterials.push({ material, opacity: material.opacity, colorIndex: 1 });
    const beads = new Points(geometry(dots), material);
    beads.renderOrder = -90;
    helix.add(beads);
  });
  // These objects are atmospheric only; they never become selectable gene nodes.
  group.traverse((object) => { object.raycast = () => {}; });
  let x = 0, y = 0, presence = framing.entered ? 0.6 : 1, helixScale = framing.entered ? 0.84 : 1;
  return {
    group,
    update(pointer: { x: number; y: number }, entered: boolean, reducedMotion: boolean, delta: number, camera: PerspectiveCamera, mode: ViewMode, frozen: boolean) {
      const ease = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 60) / 130);
      if (reducedMotion) { x = y = 0; }
      else if (!frozen) { x += (pointer.x - x) * ease; y += (pointer.y - y) * ease; }
      const fadeEase = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 60) / 240);
      presence += ((entered ? 0.6 : 1) - presence) * fadeEase;
      helixScale += ((entered ? 0.84 : 1) - helixScale) * fadeEase;
      // Follow camera orientation for full coverage through orbit/flight, while
      // moving only the stars. Camera controls and gene positions stay independent.
      sky.position.copy(camera.position);
      sky.quaternion.copy(camera.quaternion);
      const tangent = Math.tan(camera.fov * Math.PI / 360);
      layers.forEach(({ group: layer, depth: layerDepth, movement }) => {
        const pixelScale = layerDepth * tangent * 2 / Math.max(1, framing.height);
        layer.position.set(x * movement * pixelScale, -y * movement * pixelScale, 0);
      });
      helices.forEach(({ group: helix, base, depth, movement }) => {
        const pixelScale = depth * tangent * 2 / Math.max(1, framing.height);
        helix.position.copy(base);
        helix.position.x += x * movement * pixelScale;
        helix.position.y -= y * movement * pixelScale;
        helix.rotation.y = x * 0.11;
        helix.rotation.x = y * 0.055;
        helix.scale.setScalar(helixScale);
      });
      const starMode = entered ? mode : "explorer";
      const colorEase = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 60) / 200);
      starMaterials.forEach(({ material, colorIndex }) => { material.color.lerp(colors[starMode][colorIndex], colorEase); });
      helixMaterials.forEach(({ material, opacity, colorIndex }) => { material.opacity = opacity * presence; material.color.lerp(colors[starMode][colorIndex], colorEase); });
    },
    dispose() {
      instances.forEach((instance) => instance.dispose());
      geometries.forEach((value) => value.dispose());
      starMaterials.forEach(({ material }) => material.dispose());
      helixMaterials.forEach(({ material }) => material.dispose());
    },
  };
}
