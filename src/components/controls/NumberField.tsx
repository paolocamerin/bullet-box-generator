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
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-input">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const next = event.target.valueAsNumber;
            if (!Number.isNaN(next)) onChange(next);
          }}
        />
        {unit && <span className="field-unit">{unit}</span>}
      </div>
    </label>
  );
}
