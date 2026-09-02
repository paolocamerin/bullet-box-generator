import type * as THREE from "three";
import type { DerivedDimensions } from "../geometry/dimensions";
import type { ValidationMessage } from "../geometry/validation";
import type { BoxParams, ViewMode } from "../types";
import { DerivedStat } from "./controls/DerivedStat";
import { NumberField } from "./controls/NumberField";
import { Section } from "./controls/Section";
import { ExportButtons } from "./ExportButtons";

interface ControlPanelProps {
  params: BoxParams;
  onChange: (patch: Partial<BoxParams>) => void;
  dimensions: DerivedDimensions;
  validation: ValidationMessage[];
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  boxGeometry: THREE.BufferGeometry | null;
  lidGeometry: THREE.BufferGeometry | null;
}

const fmt = (n: number) => `${n.toFixed(2)} mm`;

export function ControlPanel({
  params,
  onChange,
  dimensions,
  validation,
  viewMode,
  onViewModeChange,
  boxGeometry,
  lidGeometry,
}: ControlPanelProps) {
  const hasError = validation.some((m) => m.severity === "error");

  return (
    <aside className="panel">
      <header className="panel-header">
        <h1>Bullet Box Generator</h1>
        <p>Parametric ammo block with a press-fit lid, ready for STL/OBJ export.</p>
      </header>

      <Section title="Grid">
        <NumberField
          label="Columns"
          value={params.columns}
          min={1}
          step={1}
          onChange={(v) => onChange({ columns: Math.round(v) })}
        />
        <NumberField
          label="Rows"
          value={params.rows}
          min={1}
          step={1}
          onChange={(v) => onChange({ rows: Math.round(v) })}
        />
      </Section>

      <Section title="Holes">
        <NumberField
          label="Diameter"
          value={params.holeDiameter}
          min={0.1}
          step={0.1}
          unit="mm"
          onChange={(v) => onChange({ holeDiameter: v })}
        />
        <NumberField
          label="Depth (hole height)"
          value={params.holeHeight}
          min={0.1}
          step={0.5}
          unit="mm"
          onChange={(v) => onChange({ holeHeight: v })}
        />
      </Section>

      <Section title="Box">
        <NumberField
          label="Spacing"
          value={params.spacing}
          min={0.1}
          step={0.1}
          unit="mm"
          onChange={(v) => onChange({ spacing: v })}
        />
        <NumberField
          label="Floor offset"
          value={params.floorOffset}
          min={0.1}
          step={0.1}
          unit="mm"
          onChange={(v) => onChange({ floorOffset: v })}
        />
      </Section>

      <Section title="Lid">
        <NumberField
          label="Wall thickness"
          value={params.lidWallThickness}
          min={0.1}
          step={0.1}
          unit="mm"
          onChange={(v) => onChange({ lidWallThickness: v })}
        />
        <NumberField
          label="Engagement height"
          value={params.lidEngagementHeight}
          min={0.1}
          step={0.5}
          unit="mm"
          onChange={(v) => onChange({ lidEngagementHeight: v })}
        />
        <NumberField
          label="Clearance"
          value={params.lidClearance}
          min={0}
          step={0.01}
          unit="mm"
          onChange={(v) => onChange({ lidClearance: v })}
        />
      </Section>

      <Section title="Derived dimensions">
        <DerivedStat label="Box footprint" value={`${fmt(dimensions.width)} × ${fmt(dimensions.depth)}`} />
        <DerivedStat label="Box height" value={fmt(dimensions.totalHeight)} />
        <DerivedStat
          label="Lid step footprint"
          value={`${fmt(dimensions.stepWidth)} × ${fmt(dimensions.stepDepth)}`}
        />
        <DerivedStat
          label="Lid outer size"
          value={`${fmt(dimensions.lidOuterWidth)} × ${fmt(dimensions.lidOuterDepth)} × ${fmt(dimensions.lidOuterHeight)}`}
        />
        <DerivedStat label="Holes" value={`${dimensions.holeCount}`} />
      </Section>

      {validation.length > 0 && (
        <Section title="Checks">
          <ul className="validation-list">
            {validation.map((m) => (
              <li key={m.message} className={`validation-${m.severity}`}>
                {m.message}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="View">
        <div className="view-toggle">
          <button
            className={viewMode === "assembled" ? "active" : ""}
            onClick={() => onViewModeChange("assembled")}
          >
            Assembled
          </button>
          <button className={viewMode === "exploded" ? "active" : ""} onClick={() => onViewModeChange("exploded")}>
            Exploded
          </button>
          <button
            className={viewMode === "sideBySide" ? "active" : ""}
            onClick={() => onViewModeChange("sideBySide")}
          >
            Side by side
          </button>
        </div>
      </Section>

      <Section title="Export">
        <ExportButtons
          boxGeometry={boxGeometry}
          lidGeometry={lidGeometry}
          dimensions={dimensions}
          disabled={hasError}
        />
      </Section>
    </aside>
  );
}
