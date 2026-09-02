import { useState } from "react";
import "./App.css";
import { ControlPanel } from "./components/ControlPanel";
import { Scene } from "./components/Scene";
import { useGeneratedModel } from "./hooks/useGeneratedModel";
import { defaultParams } from "./state/defaultParams";
import type { BoxParams, ViewMode } from "./types";

function App() {
  const [params, setParams] = useState<BoxParams>(defaultParams);
  const [viewMode, setViewMode] = useState<ViewMode>("assembled");

  const { dimensions, validation, boxGeometry, lidGeometry, isRegenerating } = useGeneratedModel(params);

  function handleChange(patch: Partial<BoxParams>) {
    setParams((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="app">
      <div className="viewport">
        <Scene
          boxGeometry={boxGeometry}
          lidGeometry={lidGeometry}
          dimensions={dimensions}
          viewMode={viewMode}
        />
        {isRegenerating && <div className="regenerating-badge">Regenerating…</div>}
      </div>
      <ControlPanel
        params={params}
        onChange={handleChange}
        dimensions={dimensions}
        validation={validation}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        boxGeometry={boxGeometry}
        lidGeometry={lidGeometry}
      />
    </div>
  );
}

export default App;
