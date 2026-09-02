import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  children: ReactNode;
}

export function Section({ title, children }: SectionProps) {
  return (
    <section className="panel-section">
      <h3>{title}</h3>
      <div className="panel-section-body">{children}</div>
    </section>
  );
}
