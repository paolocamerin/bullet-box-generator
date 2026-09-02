interface DerivedStatProps {
  label: string;
  value: string;
}

export function DerivedStat({ label, value }: DerivedStatProps) {
  return (
    <div className="derived-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
