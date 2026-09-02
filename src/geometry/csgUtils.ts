import * as THREE from "three";
import { ADDITION, Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";

const evaluator = new Evaluator();
evaluator.useGroups = false;

function toBrush(geometry: THREE.BufferGeometry): Brush {
  const brush = new Brush(geometry);
  brush.updateMatrixWorld();
  return brush;
}

export function subtract(
  a: THREE.BufferGeometry,
  b: THREE.BufferGeometry,
): THREE.BufferGeometry {
  const result = evaluator.evaluate(toBrush(a), toBrush(b), SUBTRACTION);
  return result.geometry;
}

export function union(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const result = evaluator.evaluate(toBrush(a), toBrush(b), ADDITION);
  return result.geometry;
}
