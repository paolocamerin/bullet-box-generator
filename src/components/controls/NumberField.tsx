import { useEffect, useRef, useState } from "react";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export function NumberField({ label, value, onChange, min, max, step = 0.1, unit }: NumberFieldProps) {
  // Free-typing draft, decoupled from the committed `value` so the field can
  // be backspaced to empty (or hold a transient "-"/"1." state) without the
  // controlled input fighting the keystroke. Only commits — and triggers
  // regeneration upstream — on Enter or blur, not on every keystroke.
  const [draft, setDraft] = useState(String(value));
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setDraft(String(value));
    }
  }, [value]);

  function commit() {
    const parsed = Number.parseFloat(draft);
    if (Number.isNaN(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = parsed;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    setDraft(String(next));
    if (next !== value) onChange(next);
  }

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-input">
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onFocus={() => {
            isFocused.current = true;
          }}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          onBlur={() => {
            isFocused.current = false;
            commit();
          }}
        />
        {unit && <span className="field-unit">{unit}</span>}
      </div>
    </label>
  );
}
