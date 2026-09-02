import * as THREE from "three";
import { OBJExporter } from "three/addons/exporters/OBJExporter.js";
import { fixDrawRangeForExport } from "../geometry/exportFix";
import { triggerDownload } from "./download";

const exporter = new OBJExporter();

export function exportGeometryAsOBJ(geometry: THREE.BufferGeometry, filename: string) {
  // Clone so the fix-up/normal recompute never mutates the geometry on screen.
  const clone = geometry.clone();
  fixDrawRangeForExport(clone);
  clone.computeVertexNormals();

  const mesh = new THREE.Mesh(clone);
  const data = exporter.parse(mesh);
  triggerDownload(data, filename, "text/plain");

  clone.dispose();
}
