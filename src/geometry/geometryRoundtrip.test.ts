import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import { geometryToSTL } from "../export/exportSTL";
import type { BoxParams } from "../types";
import { buildBoxGeometry } from "./buildBoxGeometry";
import { buildLidGeometry } from "./buildLidGeometry";
import { computeDimensions } from "./dimensions";

const EPS = 0.05; // mm — tolerance for float roundoff through the CSG + STL pipeline

const baseParams: BoxParams = {
  columns: 5,
  rows: 5,
  holeDiameter: 9,
  holeHeight: 20,
  spacing: 3,
  floorOffset: 3,
  lidWallThickness: 2,
  lidEngagementHeight: 8,
  lidClearance: 0.03,
};

const loader = new STLLoader();

function roundtrip(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const stl = geometryToSTL(geometry, true);
  expect(stl).toBeInstanceOf(DataView);
  const view = stl as DataView;
  return loader.parse(view.buffer as ArrayBuffer);
}

function assertClean(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const position = geometry.getAttribute("position");
  expect(position.count).toBeGreaterThan(0);

  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  expect(triangleCount).toBeGreaterThan(0);
  expect(Number.isInteger(triangleCount)).toBe(true);

  for (let i = 0; i < position.count; i++) {
    expect(Number.isFinite(position.getX(i))).toBe(true);
    expect(Number.isFinite(position.getY(i))).toBe(true);
    expect(Number.isFinite(position.getZ(i))).toBe(true);
  }

  return { boundingBox: geometry.boundingBox!, triangleCount };
}

describe.each([
  { name: "1x1 grid", params: { ...baseParams, columns: 1, rows: 1 } },
  { name: "typical 5x5 grid", params: baseParams },
  { name: "6x6 grid", params: { ...baseParams, columns: 6, rows: 6 } },
  {
    name: "boundary: lidEngagementHeight === holeHeight",
    params: { ...baseParams, lidEngagementHeight: baseParams.holeHeight },
  },
])("geometry round-trip — $name", ({ params }) => {
  it("box: exports to STL and reloads with a matching bounding box, no NaNs", () => {
    const dims = computeDimensions(params);
    const geometry = buildBoxGeometry(params);
    const reloaded = roundtrip(geometry);
    const { boundingBox } = assertClean(reloaded);

    const size = new THREE.Vector3();
    boundingBox.getSize(size);

    expect(size.x).toBeCloseTo(dims.width, 1);
    expect(size.z).toBeCloseTo(dims.depth, 1);
    // Y max should reach the box's total height; the blind holes don't reduce
    // the outer bounding box since they're recessed cavities, not through-cuts.
    expect(boundingBox.max.y).toBeGreaterThanOrEqual(dims.totalHeight - EPS);
    expect(boundingBox.max.y).toBeLessThanOrEqual(dims.totalHeight + EPS);
    expect(boundingBox.min.y).toBeGreaterThanOrEqual(-EPS);

    geometry.dispose();
    reloaded.dispose();
  });

  it("lid: exports to STL and reloads with a matching bounding box, no NaNs", () => {
    const dims = computeDimensions(params);
    const geometry = buildLidGeometry(params);
    const reloaded = roundtrip(geometry);
    const { boundingBox } = assertClean(reloaded);

    const size = new THREE.Vector3();
    boundingBox.getSize(size);

    expect(size.x).toBeCloseTo(dims.lidOuterWidth, 1);
    expect(size.z).toBeCloseTo(dims.lidOuterDepth, 1);
    expect(size.y).toBeCloseTo(dims.lidOuterHeight, 1);

    geometry.dispose();
    reloaded.dispose();
  });
});
