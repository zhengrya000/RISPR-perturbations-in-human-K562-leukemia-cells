import { test, expect } from "@playwright/test";
import { Group, PerspectiveCamera, Vector3 } from "three";
import { createConstellationMotion } from "../src/lib/constellation-motion";

const nodes = [{ x: -200, y: -160, z: -120 }, { x: 200, y: 160, z: 120 }];
const pointerTo = (point: Vector3, camera: PerspectiveCamera) => {
  const projected = point.clone().project(camera);
  return { x: projected.x, y: -projected.y };
};

test("the invisible constellation volume admits internal rays and excludes the background", () => {
  const root = new Group();
  root.updateWorldMatrix(true, true);
  const camera = new PerspectiveCamera(45, 1.6, 0.1, 50000);
  camera.position.set(0, 0, 1200);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const motion = createConstellationMotion(root, nodes, 900, 1800);
  expect(motion.contains({ x: 0, y: 0 }, camera)).toBe(true);
  expect(motion.contains({ x: 0.9, y: 0.9 }, camera)).toBe(false);
  camera.position.set(0, 0, -1200);
  camera.lookAt(0, 0, -2400);
  camera.updateMatrixWorld();
  expect(motion.contains({ x: 0, y: 0 }, camera)).toBe(false);
  motion.dispose();
});

test("the pause volume follows transformed genes and a camera orbit", () => {
  const root = new Group();
  root.position.set(300, -100, 150);
  root.rotation.set(0.25, 0.7, -0.15);
  root.updateWorldMatrix(true, true);
  const camera = new PerspectiveCamera(45, 1.6, 0.1, 50000);
  camera.position.set(1700, 600, 1200);
  camera.lookAt(root.position);
  camera.updateMatrixWorld();
  const motion = createConstellationMotion(root, nodes, 900, 1800);
  const corner = new Vector3(200, 160, 120).applyMatrix4(root.matrixWorld);
  expect(motion.contains(pointerTo(corner, camera), camera)).toBe(true);
  expect(motion.contains({ x: -0.95, y: 0.95 }, camera)).toBe(false);
  camera.position.set(-1500, 300, 900);
  camera.lookAt(root.position);
  camera.updateMatrixWorld();
  expect(motion.contains(pointerTo(corner, camera), camera)).toBe(true);
  motion.dispose();
});
