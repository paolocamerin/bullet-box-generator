import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * three-bvh-csg results can carry a `drawRange` that three.js's STL/OBJ
 * exporters ignore (both iterate the full index buffer), which can leak
 * stray triangles from reused internal buffers into the exported file. Trim
 * the index buffer down to the actual draw range before exporting.
 */
export function fixDrawRangeForExport(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const { start, count } = geometry.drawRange;
  if (geometry.index && count !== Infinity) {
    const trimmed = geometry.index.array.slice(start, start + count);
    geometry.setIndex(new THREE.BufferAttribute(trimmed, 1));
  }
  geometry.setDrawRange(0, Infinity);
  return geometry;
}

/**
 * Welds coincident-but-separately-indexed vertices left behind by CSG
 * (adjacent triangles at a cut boundary each get their own vertex copies at
 * the same position rather than sharing one index) into a single shared
 * index per position. Our own watertightness checks key edges by rounded
 * *position*, so they never caught this — geometrically there's no gap, the
 * mesh just isn't index-welded. That's invisible in STL (raw triangle soup;
 * slicers re-weld by position on import) but shows up as a huge non-manifold
 * count in OBJ, whose face directives reference explicit vertex numbers that
 * importers trust as the intended topology rather than re-welding by
 * position themselves.
 *
 * `mergeVertices` hashes *all* attributes together, not just position — two
 * corners at the same point but with different normals (the normal case
 * straight out of CSG/flat shading: every edge has two different per-face
 * normals meeting at each shared position) are left un-merged, silently
 * defeating the weld almost everywhere. We only care about position-based
 * topology here — STL recomputes face normals itself on export regardless,
 * and OBJ export recomputes smooth normals right after this step — so drop
 * normal/uv first to weld by position alone. Mutates `geometry` in place
 * (the caller's disposable clone, per this module's calling convention).
 */
export function weldVerticesForExport(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  return mergeVertices(geometry, 1e-4);
}
