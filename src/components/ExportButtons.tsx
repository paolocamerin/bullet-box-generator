import { useState } from "react";
import type * as THREE from "three";
import { exportGeometryAsOBJ } from "../export/exportOBJ";
import { exportGeometryAsSTL } from "../export/exportSTL";
import type { DerivedDimensions } from "../geometry/dimensions";
import { buildPrintLayoutGeometry } from "../geometry/printLayout";
import type { ExportFormat } from "../types";

interface ExportButtonsProps {
  boxGeometry: THREE.BufferGeometry | null;
  lidGeometry: THREE.BufferGeometry | null;
  dimensions: DerivedDimensions;
  disabled: boolean;
}

export function ExportButtons({ boxGeometry, lidGeometry, dimensions, disabled }: ExportButtonsProps) {
  const [format, setFormat] = useState<ExportFormat>("stl");

  function download(geometry: THREE.BufferGeometry, name: string) {
    if (format === "stl") {
      exportGeometryAsSTL(geometry, `${name}.stl`);
    } else {
      exportGeometryAsOBJ(geometry, `${name}.obj`);
    }
  }

  function downloadCombined() {
    if (!boxGeometry || !lidGeometry) return;
    const combined = buildPrintLayoutGeometry(boxGeometry, lidGeometry, dimensions);
    download(combined, "bullet-box-print-layout");
    combined.dispose();
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
        <button
          disabled={disabled || !boxGeometry}
          onClick={() => boxGeometry && download(boxGeometry, "bullet-box")}
        >
          Download Box
        </button>
        <button
          disabled={disabled || !lidGeometry}
          onClick={() => lidGeometry && download(lidGeometry, "bullet-box-lid")}
        >
          Download Lid
        </button>
      </div>
      <button
        className="export-combined"
        disabled={disabled || !boxGeometry || !lidGeometry}
        onClick={downloadCombined}
      >
        Download Both (print layout)
      </button>
      <p className="export-hint">
        Box and lid in one file, laid flat side by side with holes/opening facing up — ready to
        slice.
      </p>
    </div>
  );
}
