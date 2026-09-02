import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { DerivedDimensions } from "./dimensions";

const PRINT_GAP_RATIO = 0.08;
const MIN_PRINT_GAP = 10;

/**
 * Re-orients a part authored in this app's internal Y-up convention (holes
 * drilled along +Y) into the Z-up convention slicers assume for STL/OBJ
 * (the file's Z axis becomes the printer's vertical build axis), then rests
 * it flat on Z=0.
 *
 * `flip` selects which end faces up after the remap: the box's floor should
 * stay down with its holes opening upward (no flip — a rotation of +90°
 * about X already achieves that), while the lid needs its open rim facing
 * up and its solid cap resting on the bed (a flip — rotation of -90° about
 * X) so it prints without any bridging or supports.
 */
function orientForPrint(geometry: THREE.BufferGeometry, flip: boolean): THREE.BufferGeometry {
  const oriented = geometry.clone();
  oriented.rotateX(flip ? -Math.PI / 2 : Math.PI / 2);
  oriented.computeBoundingBox();
  const minZ = oriented.boundingBox!.min.z;
  oriented.translate(0, 0, -minZ);
  return oriented;
}

/**
 * Builds a single merged, print-ready geometry: the box with its holes
 * facing up and the lid (flipped cap-down/opening-up, its own best print
 * orientation) resting beside it, both flat on Z=0 — ready to hand straight
 * to a slicer as one file.
 */
export function buildPrintLayoutGeometry(
  boxGeometry: THREE.BufferGeometry,
  lidGeometry: THREE.BufferGeometry,
  dimensions: DerivedDimensions,
): THREE.BufferGeometry {
  const orientedBox = orientForPrint(boxGeometry, false);
  const orientedLid = orientForPrint(lidGeometry, true);

  const gap = Math.max(MIN_PRINT_GAP, Math.max(dimensions.width, dimensions.depth) * PRINT_GAP_RATIO);
  const boxOffsetX = -(dimensions.width / 2 + gap / 2);
  const lidOffsetX = dimensions.lidOuterWidth / 2 + gap / 2;

  orientedBox.translate(boxOffsetX, 0, 0);
  orientedLid.translate(lidOffsetX, 0, 0);

  const merged = mergeGeometries([orientedBox, orientedLid], false);

  orientedBox.dispose();
  orientedLid.dispose();

  return merged;
}
