import * as THREE from "three";
import type { BoxParams } from "../types";
import { subtract } from "./csgUtils";
import { computeDimensions } from "./dimensions";

// How far the inner cavity pokes below the lid's open bottom, guaranteeing a
// clean cut with no coplanar-face ambiguity for the CSG subtraction.
const CAVITY_OVERSHOOT = 1;

export function buildLidGeometry(params: BoxParams): THREE.BufferGeometry {
  const dims = computeDimensions(params);

  const outer = new THREE.BoxGeometry(dims.lidOuterWidth, dims.lidOuterHeight, dims.lidOuterDepth);
  outer.translate(0, dims.lidOuterHeight / 2, 0);

  // Cavity spans from below the lid's open bottom up to just under the top
  // cap, leaving `lidWallThickness` of solid material as the lid's top.
  const cavityTop = dims.lidOuterHeight - params.lidWallThickness;
  const cavityHeight = cavityTop + CAVITY_OVERSHOOT;
  const cavityCenterY = (cavityTop - CAVITY_OVERSHOOT) / 2;

  const inner = new THREE.BoxGeometry(dims.lidInnerWidth, cavityHeight, dims.lidInnerDepth);
  inner.translate(0, cavityCenterY, 0);

  const result = subtract(outer, inner);
  outer.dispose();
  inner.dispose();
  return result;
}
