import { X } from "@phosphor-icons/react";
import { useEffect } from "react";
import { ANALYTICS_ENABLED } from "../analytics/config";
import { MAX_PLATE_SIZE_HARD_CAP, MIN_PLATE_SIZE } from "../state/defaultSettings";
import type { AppSettings, CookieConsent } from "../types";
import { NumberField } from "./controls/NumberField";

interface SettingsModalProps {
  settings: AppSettings;
  onSettingsChange: (patch: Partial<AppSettings>) => void;
  cookieConsent: CookieConsent;
  onCookieConsentChange: (choice: CookieConsent) => void;
  onClose: () => void;
}

export function SettingsModal({
  settings,
  onSettingsChange,
  cookieConsent,
  onCookieConsentChange,
  onClose,
}: SettingsModalProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close settings">
            <X size={18} weight="bold" />
          </button>
        </div>

        <section className="modal-section">
          <h3>Generation limits</h3>
          <p className="settings-hint">
            Max plate size blocks generation above a given footprint. It exists to catch
            accidentally-huge grids before they're built — 512mm is a common desktop print-bed
            size, so anything past it almost certainly won't fit your printer anyway, and very
            large models can make the browser tab slow to respond or crash outright (geometry is
            built on the main thread).
          </p>
          <NumberField
            label="Max plate size"
            value={settings.maxPlateSize}
            min={MIN_PLATE_SIZE}
            max={MAX_PLATE_SIZE_HARD_CAP}
            step={10}
            unit="mm"
            onChange={(v) => onSettingsChange({ maxPlateSize: v })}
          />
          <p className="settings-hint">
            Raising this removes that guardrail — only increase it if you know your printer (and
            your browser) can handle the result.
          </p>
        </section>

        {ANALYTICS_ENABLED && (
          <section className="modal-section">
            <h3>Cookies &amp; analytics</h3>
            <p className="settings-hint">
              This site uses Google Analytics to count visits and see which features get used —
              nothing else. No ads, no cross-site tracking, no selling data. Analytics cookies are
              only set if you accept.
            </p>
            <p className="cookie-status">
              Current choice:{" "}
              <strong>{cookieConsent === "unset" ? "not set yet" : cookieConsent}</strong>
            </p>
            <div className="cookie-banner-actions">
              <button className="cookie-decline" onClick={() => onCookieConsentChange("declined")}>
                Decline
              </button>
              <button className="cookie-accept" onClick={() => onCookieConsentChange("accepted")}>
                Accept
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
