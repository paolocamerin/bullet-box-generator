import * as THREE from "three";
import { union } from "./csgUtils";

/**
 * Builds the box's solid silhouette before holes are cut: a full-footprint
 * lower block topped with a smaller, inset block (where the lid will slide
 * over). The two are fused with a CSG union rather than concatenated
 * directly — they share a non-matching footprint exactly at the seam plane,
 * which would otherwise leave a non-manifold double-skin right where every
 * hole cylinder crosses it.
 */
export function buildStepBlock(
  width: number,
  depth: number,
  stepWidth: number,
  stepDepth: number,
  lowerHeight: number,
  upperHeight: number,
): THREE.BufferGeometry {
  const lower = new THREE.BoxGeometry(width, lowerHeight, depth);
  lower.translate(0, lowerHeight / 2, 0);

  const upper = new THREE.BoxGeometry(stepWidth, upperHeight, stepDepth);
  upper.translate(0, lowerHeight + upperHeight / 2, 0);

  const result = union(lower, upper);
  lower.dispose();
  upper.dispose();
  return result;
}
