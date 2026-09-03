import * as THREE from "three";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { fixDrawRangeForExport, weldVerticesForExport } from "../geometry/exportFix";
import { triggerDownload } from "./download";

const exporter = new STLExporter();

/** Pure serialization step, split out from `exportGeometryAsSTL` so it's testable without a DOM. */
export function geometryToSTL(geometry: THREE.BufferGeometry, binary = true): string | DataView {
  // Clone so the fix-up never mutates the geometry currently on screen.
  const clone = geometry.clone();
  fixDrawRangeForExport(clone);
  const welded = weldVerticesForExport(clone);
  clone.dispose();

  const mesh = new THREE.Mesh(welded);
  const data = exporter.parse(mesh, { binary });

  welded.dispose();
  return data;
}

export function exportGeometryAsSTL(
  geometry: THREE.BufferGeometry,
  filename: string,
  binary = true,
) {
  const data = geometryToSTL(geometry, binary);
  triggerDownload(data, filename, binary ? "application/octet-stream" : "text/plain");
}
