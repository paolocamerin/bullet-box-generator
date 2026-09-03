import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { describe, expect, it } from "vitest";
import { geometryToOBJ } from "../export/exportOBJ";
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
  lidHeadroom: 5,
};

const stlLoader = new STLLoader();
const objLoader = new OBJLoader();

function roundtripSTL(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const stl = geometryToSTL(geometry, true);
  expect(stl).toBeInstanceOf(DataView);
  const view = stl as DataView;
  return stlLoader.parse(view.buffer as ArrayBuffer);
}

function roundtripOBJ(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const obj = geometryToOBJ(geometry);
  const group = objLoader.parse(obj);
  const mesh = group.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
  expect(mesh).toBeDefined();
  return mesh!.geometry;
}

/**
 * OBJ face directives reference explicit vertex numbers, which importers
 * trust as the intended topology rather than re-welding by position
 * themselves (unlike STL, which is raw triangle soup that gets re-welded by
 * position on import regardless). So beyond "no gaps" (`countManifoldDefects`
 * above, position-based), an OBJ export specifically needs every coincident
 * position to actually share one `v` entry in the *written file* — this
 * catches the class of bug where CSG leaves adjacent triangles with their
 * own separate-but-coincident vertex copies at a cut boundary instead of a
 * shared one.
 *
 * This checks the raw OBJ text directly, not a reloaded geometry: three.js's
 * OBJLoader doesn't preserve `f` lines' vertex-index sharing when it rebuilds
 * a BufferGeometry (it flattens face-corners into fresh vertices), so
 * round-tripping through it and inspecting the *result* tests the loader's
 * reconstruction, not our export.
 */
function countDuplicateObjVertices(obj: string): number {
  const round = (v: number) => Math.round(v * 1000);
  const seen = new Set<string>();
  let duplicates = 0;

  for (const line of obj.split("\n")) {
    if (!line.startsWith("v ")) continue;
    const [, x, y, z] = line.trim().split(/\s+/);
    const key = `${round(Number(x))},${round(Number(y))},${round(Number(z))}`;
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }

  return duplicates;
}

/**
 * A watertight, two-manifold mesh has every edge shared by exactly two
 * triangles. Keys edges by (rounded) vertex position rather than raw index,
 * so this works whether or not the geometry's vertices are welded — in
 * particular on geometry reloaded from STL, which has no shared indices at
 * all (every triangle carries its own 3 explicit vertices).
 */
function countManifoldDefects(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const vertexAt = (i: number) => index?.getX(i) ?? i;
  const triangleCount = index ? index.count / 3 : position.count / 3;

  const round = (v: number) => Math.round(v * 1000); // 0.001mm tolerance
  const edgeKey = (a: number, b: number) => {
    const pa = `${round(position.getX(a))},${round(position.getY(a))},${round(position.getZ(a))}`;
    const pb = `${round(position.getX(b))},${round(position.getY(b))},${round(position.getZ(b))}`;
    return pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
  };

  const edgeCounts = new Map<string, number>();
  for (let t = 0; t < triangleCount; t++) {
    const a = vertexAt(t * 3);
    const b = vertexAt(t * 3 + 1);
    const c = vertexAt(t * 3 + 2);
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = edgeKey(x, y);
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }

  let boundaryEdges = 0;
  let nonManifoldEdges = 0;
  for (const count of edgeCounts.values()) {
    if (count === 1) boundaryEdges++;
    else if (count !== 2) nonManifoldEdges++;
  }

  return { boundaryEdges, nonManifoldEdges, triangleCount };
}

function assertClean(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox();
  const position = geometry.getAttribute("position");
  expect(position.count).toBeGreaterThan(0);

  for (let i = 0; i < position.count; i++) {
    expect(Number.isFinite(position.getX(i))).toBe(true);
    expect(Number.isFinite(position.getY(i))).toBe(true);
    expect(Number.isFinite(position.getZ(i))).toBe(true);
  }

  const { boundaryEdges, nonManifoldEdges, triangleCount } = countManifoldDefects(geometry);
  expect(triangleCount).toBeGreaterThan(0);
  expect(Number.isInteger(triangleCount)).toBe(true);
  // Watertight/two-manifold: every edge must be shared by exactly 2 triangles.
  // A slicer treats any other count as a hole or a self-intersecting seam —
  // this is exactly the defect class that made hole cuts vanish depending on
  // print orientation.
  expect(boundaryEdges).toBe(0);
  expect(nonManifoldEdges).toBe(0);

  return { boundingBox: geometry.boundingBox!, triangleCount };
}

describe.each([
  { name: "1x1 grid", params: { ...baseParams, columns: 1, rows: 1 } },
  { name: "typical 5x5 grid", params: baseParams },
  { name: "6x6 grid", params: { ...baseParams, columns: 6, rows: 6 } },
  { name: "10x5 grid (non-square)", params: { ...baseParams, columns: 10, rows: 5 } },
  {
    name: "boundary: lidEngagementHeight === holeHeight",
    params: { ...baseParams, lidEngagementHeight: baseParams.holeHeight },
  },
])("geometry round-trip — $name", ({ params }) => {
  it("box: exports to STL and reloads with a matching bounding box, no NaNs", () => {
    const dims = computeDimensions(params);
    const geometry = buildBoxGeometry(params);
    const reloaded = roundtripSTL(geometry);
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
    const reloaded = roundtripSTL(geometry);
    const { boundingBox } = assertClean(reloaded);

    const size = new THREE.Vector3();
    boundingBox.getSize(size);

    expect(size.x).toBeCloseTo(dims.lidOuterWidth, 1);
    expect(size.z).toBeCloseTo(dims.lidOuterDepth, 1);
    expect(size.y).toBeCloseTo(dims.lidOuterHeight, 1);

    geometry.dispose();
    reloaded.dispose();
  });

  it("box: exports to OBJ fully vertex-welded, and reloads with a matching bounding box", () => {
    const dims = computeDimensions(params);
    const geometry = buildBoxGeometry(params);
    expect(countDuplicateObjVertices(geometryToOBJ(geometry))).toBe(0);

    const reloaded = roundtripOBJ(geometry);
    const { boundingBox } = assertClean(reloaded);

    const size = new THREE.Vector3();
    boundingBox.getSize(size);

    expect(size.x).toBeCloseTo(dims.width, 1);
    expect(size.z).toBeCloseTo(dims.depth, 1);
    expect(boundingBox.max.y).toBeGreaterThanOrEqual(dims.totalHeight - EPS);
    expect(boundingBox.max.y).toBeLessThanOrEqual(dims.totalHeight + EPS);
    expect(boundingBox.min.y).toBeGreaterThanOrEqual(-EPS);

    geometry.dispose();
  });

  it("lid: exports to OBJ fully vertex-welded, and reloads with a matching bounding box", () => {
    const dims = computeDimensions(params);
    const geometry = buildLidGeometry(params);
    expect(countDuplicateObjVertices(geometryToOBJ(geometry))).toBe(0);

    const reloaded = roundtripOBJ(geometry);
    const { boundingBox } = assertClean(reloaded);

    const size = new THREE.Vector3();
    boundingBox.getSize(size);

    expect(size.x).toBeCloseTo(dims.lidOuterWidth, 1);
    expect(size.z).toBeCloseTo(dims.lidOuterDepth, 1);
    expect(size.y).toBeCloseTo(dims.lidOuterHeight, 1);

    geometry.dispose();
  });
});
