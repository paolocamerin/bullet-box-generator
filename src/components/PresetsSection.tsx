import { useState } from "react";
import type { BoxParams, Preset } from "../types";
import { Section } from "./controls/Section";

interface PresetsSectionProps {
  params: BoxParams;
  presets: Preset[];
  onLoad: (params: BoxParams) => void;
  onSave: (name: string) => void;
  onDelete: (name: string) => void;
}

function paramsEqual(a: BoxParams, b: BoxParams) {
  return (Object.keys(a) as (keyof BoxParams)[]).every((key) => a[key] === b[key]);
}

export function PresetsSection({ params, presets, onLoad, onSave, onDelete }: PresetsSectionProps) {
  const [selected, setSelected] = useState("");
  const [newName, setNewName] = useState("");

  const selectedPreset = presets.find((p) => p.name === selected);
  const isDirty = !!selectedPreset && !paramsEqual(selectedPreset.params, params);

  function handleSelect(name: string) {
    setSelected(name);
    const preset = presets.find((p) => p.name === name);
    if (preset) onLoad(preset.params);
  }

  function handleSaveNew() {
    const name = newName.trim();
    if (!name) return;
    onSave(name);
    setSelected(name);
    setNewName("");
  }

  function handleReset() {
    if (selectedPreset) onLoad(selectedPreset.params);
  }

  function handleUpdate() {
    if (!selectedPreset) return;
    if (window.confirm(`Overwrite preset "${selectedPreset.name}" with the current values?`)) {
      onSave(selectedPreset.name);
    }
  }

  return (
    <Section title="Presets">
      <div className="preset-row">
        <select value={selected} onChange={(event) => handleSelect(event.target.value)}>
          <option value="">— Load a preset —</option>
          {presets.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name}
            </option>
          ))}
        </select>
        <button
          className="preset-delete"
          disabled={!selected}
          title="Delete selected preset"
          onClick={() => {
            onDelete(selected);
            setSelected("");
          }}
        >
          Delete
        </button>
      </div>

      {isDirty && (
        <div className="preset-row">
          <button className="preset-reset" onClick={handleReset}>
            Reset to preset
          </button>
          <button className="preset-update" onClick={handleUpdate}>
            Update preset
          </button>
        </div>
      )}

      <div className="preset-row">
        <input
          type="text"
          className="preset-name-input"
          placeholder="Preset name"
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleSaveNew();
          }}
        />
        <button className="preset-save" disabled={!newName.trim()} onClick={handleSaveNew}>
          Save current
        </button>
      </div>
    </Section>
  );
}
