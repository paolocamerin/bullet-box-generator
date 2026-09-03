import { Gear } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { ANALYTICS_ENABLED, GA_MEASUREMENT_ID } from "./analytics/config";
import { loadGoogleAnalytics } from "./analytics/loadGoogleAnalytics";
import { ControlPanel } from "./components/ControlPanel";
import { CookieBanner } from "./components/CookieBanner";
import { Scene } from "./components/Scene";
import { SettingsModal } from "./components/SettingsModal";
import { useGeneratedModel } from "./hooks/useGeneratedModel";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { defaultParams } from "./state/defaultParams";
import { defaultSettings } from "./state/defaultSettings";
import type { AppSettings, BoxParams, CookieConsent, Preset, ViewMode } from "./types";

function App() {
  const [storedParams, setParams] = useLocalStorage<BoxParams>("bullet-box:params", defaultParams);
  const [storedSettings, setSettings] = useLocalStorage<AppSettings>(
    "bullet-box:settings",
    defaultSettings,
  );
  const [viewMode, setViewMode] = useLocalStorage<ViewMode>("bullet-box:view-mode", "assembled");
  const [presets, setPresets] = useLocalStorage<Preset[]>("bullet-box:presets", []);
  const [cookieConsent, setCookieConsent] = useLocalStorage<CookieConsent>(
    "bullet-box:cookie-consent",
    "unset",
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Backfill fields that didn't exist when a value was last persisted, so an
  // older saved state (e.g. from before `lidHeadroom` existed) doesn't leave
  // required fields undefined and break geometry generation. Memoized so the
  // reference only changes when the *stored* value actually changes — an
  // un-memoized spread here creates a new object every render, which broke
  // useGeneratedModel's debounce effect (its dependency array compares
  // `params` by reference) into an infinite render loop: every render
  // scheduled a new debounce timer, which fired a state update, which
  // re-rendered App with a fresh `params` reference, forever.
  const params = useMemo<BoxParams>(() => ({ ...defaultParams, ...storedParams }), [storedParams]);
  const settings = useMemo<AppSettings>(
    () => ({ ...defaultSettings, ...storedSettings }),
    [storedSettings],
  );

  const { dimensions, validation, boxGeometry, lidGeometry, isRegenerating } = useGeneratedModel(
    params,
    settings.maxPlateSize,
  );

  useEffect(() => {
    if (ANALYTICS_ENABLED && cookieConsent === "accepted") {
      loadGoogleAnalytics(GA_MEASUREMENT_ID);
    }
  }, [cookieConsent]);

  function handleChange(patch: Partial<BoxParams>) {
    setParams({ ...params, ...patch });
  }

  function handleSettingsChange(patch: Partial<AppSettings>) {
    setSettings({ ...settings, ...patch });
  }

  function handleSavePreset(name: string) {
    setPresets((prev) => [...prev.filter((p) => p.name !== name), { name, params }]);
  }

  function handleDeletePreset(name: string) {
    setPresets((prev) => prev.filter((p) => p.name !== name));
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
        <button
          className="settings-trigger"
          onClick={() => setIsSettingsOpen(true)}
          aria-label="Open settings"
        >
          <Gear size={20} weight="bold" />
        </button>
        {isRegenerating && <div className="regenerating-badge">Regenerating…</div>}
      </div>
      <ControlPanel
        params={params}
        onChange={handleChange}
        presets={presets}
        onLoadPreset={setParams}
        onSavePreset={handleSavePreset}
        onDeletePreset={handleDeletePreset}
        dimensions={dimensions}
        validation={validation}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        boxGeometry={boxGeometry}
        lidGeometry={lidGeometry}
      />
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          onSettingsChange={handleSettingsChange}
          cookieConsent={cookieConsent}
          onCookieConsentChange={setCookieConsent}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
      {ANALYTICS_ENABLED && cookieConsent === "unset" && <CookieBanner onChoice={setCookieConsent} />}
    </div>
  );
}

export default App;
