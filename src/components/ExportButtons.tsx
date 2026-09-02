import { useState } from "react";
import type * as THREE from "three";
import { exportGeometryAsOBJ } from "../export/exportOBJ";
import { exportGeometryAsSTL } from "../export/exportSTL";
import type { ExportFormat } from "../types";

interface ExportButtonsProps {
  boxGeometry: THREE.BufferGeometry | null;
  lidGeometry: THREE.BufferGeometry | null;
  disabled: boolean;
}

export function ExportButtons({ boxGeometry, lidGeometry, disabled }: ExportButtonsProps) {
  const [format, setFormat] = useState<ExportFormat>("stl");

  function download(geometry: THREE.BufferGeometry | null, name: string) {
    if (!geometry) return;
    if (format === "stl") {
      exportGeometryAsSTL(geometry, `${name}.stl`);
    } else {
      exportGeometryAsOBJ(geometry, `${name}.obj`);
    }
  }

  return (
    <div className="export-buttons">
      <label className="field">
        <span className="field-label">Format</span>
        <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
          <option value="stl">STL</option>
          <option value="obj">OBJ</option>
        </select>
      </label>
      <div className="export-actions">
        <button disabled={disabled || !boxGeometry} onClick={() => download(boxGeometry, "bullet-box")}>
          Download Box
        </button>
        <button disabled={disabled || !lidGeometry} onClick={() => download(lidGeometry, "bullet-box-lid")}>
          Download Lid
        </button>
      </div>
    </div>
  );
}
