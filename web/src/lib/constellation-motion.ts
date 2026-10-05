import { Box3, Matrix4, Ray, Raycaster, Vector2, Vector3, type Object3D, type PerspectiveCamera, type Scene } from "three";

export function findConstellationRoot(scene: Scene) {
  return scene.children.find((object) => {
    const candidate = object as Object3D & { graphData?: unknown; tickFrame?: unknown };
    return typeof candidate.graphData === "function" && typeof candidate.tickFrame === "function";
  });
}

/** Moves the intro as one graph and tests its invisible volume after orbiting. */
export function createConstellationMotion(root: Object3D, nodes: { x: number; y: number; z: number }[], height: number, introDistance: number) {
  const bounds = new Box3().setFromPoints(nodes.map((node) => new Vector3(node.x, node.y, node.z))).expandByScalar(45);
  const origin = root.position.clone(), rotation = root.rotation.clone();
  const raycaster = new Raycaster(), ray = new Ray(), inverse = new Matrix4(), ndc = new Vector2();
  let x = 0, y = 0;
  return {
    update(pointer: { x: number; y: number }, entered: boolean, reducedMotion: boolean, delta: number) {
      const ease = reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 60) / 180);
      x += ((entered || reducedMotion ? 0 : pointer.x) - x) * ease;
      y += ((entered || reducedMotion ? 0 : pointer.y) - y) * ease;
      const unitsPerPixel = introDistance * 2 * Math.tan(Math.PI / 8) / Math.max(1, height);
      root.position.copy(origin);
      root.position.x += x * 36 * unitsPerPixel;
      root.position.y -= y * 24 * unitsPerPixel;
      root.rotation.copy(rotation);
      root.rotation.y += x * 0.04;
      root.rotation.x += y * 0.025;
      root.updateWorldMatrix(true, true);
    },
    contains(pointer: { x: number; y: number }, camera: PerspectiveCamera) {
      camera.updateMatrixWorld();
      ndc.set(pointer.x, -pointer.y);
      raycaster.setFromCamera(ndc, camera);
      inverse.copy(root.matrixWorld).invert();
      ray.copy(raycaster.ray).applyMatrix4(inverse);
      return ray.intersectsBox(bounds);
    },
    dispose() {
      root.position.copy(origin);
      root.rotation.copy(rotation);
      root.updateWorldMatrix(true, true);
    },
  };
}
