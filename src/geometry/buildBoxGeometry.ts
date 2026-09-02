import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BoxParams } from "../types";
import { buildStepBlock } from "./buildStepBlock";
import { subtract } from "./csgUtils";
import { computeDimensions } from "./dimensions";

// How far each hole cylinder pokes above the box's top face, guaranteeing a
// clean cut with no coplanar-face ambiguity for the CSG subtraction.
const HOLE_OVERSHOOT = 1;
const CYLINDER_SEGMENTS = 32;

export function buildBoxGeometry(params: BoxParams): THREE.BufferGeometry {
  const dims = computeDimensions(params);

  const stepBlock = buildStepBlock(
    dims.width,
    dims.depth,
    dims.stepWidth,
    dims.stepDepth,
    dims.stepY,
    params.lidEngagementHeight,
  );

  const cylinderHeight = params.holeHeight + HOLE_OVERSHOOT;
  const centerY = params.floorOffset + cylinderHeight / 2;

  const cylinders = dims.holePositions.map((pos) => {
    const cylinder = new THREE.CylinderGeometry(
      params.holeDiameter / 2,
      params.holeDiameter / 2,
      cylinderHeight,
      CYLINDER_SEGMENTS,
    );
    cylinder.translate(pos.x, centerY, pos.z);
    return cylinder;
  });

  // Holes never touch each other (spacing > 0 is enforced by validation), so
  // a plain concatenation merge is safe here — unlike the step block above.
  const mergedHoles = mergeGeometries(cylinders, false);
  cylinders.forEach((geometry) => geometry.dispose());

  const result = subtract(stepBlock, mergedHoles);
  stepBlock.dispose();
  mergedHoles.dispose();
  return result;
}
