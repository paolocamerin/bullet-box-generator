import * as THREE from "three";

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
