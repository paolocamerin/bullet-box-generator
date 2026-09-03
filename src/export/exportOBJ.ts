import * as THREE from "three";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { fixDrawRangeForExport, weldVerticesForExport } from "../geometry/exportFix";
import { triggerDownload } from "./download";

const exporter = new OBJExporter();

/** Pure serialization step, split out from `exportGeometryAsOBJ` so it's testable without a DOM. */
export function geometryToOBJ(geometry: THREE.BufferGeometry): string {
  // Clone so the fix-up/weld/normal recompute never mutates the geometry on screen.
  const clone = geometry.clone();
  fixDrawRangeForExport(clone);
  const welded = weldVerticesForExport(clone);
  clone.dispose();
  welded.computeVertexNormals();

  const mesh = new THREE.Mesh(welded);
  const data = exporter.parse(mesh);

  welded.dispose();
  return data;
}

export function exportGeometryAsOBJ(geometry: THREE.BufferGeometry, filename: string) {
  const data = geometryToOBJ(geometry);
  triggerDownload(data, filename, "text/plain");
}
