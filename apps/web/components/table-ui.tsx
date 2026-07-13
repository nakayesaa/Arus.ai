import type { ReactNode } from 'react';

interface AvatarProps {
  label: string;
  tone?: 'blue' | 'violet' | 'amber' | 'green' | 'rose';
}

export function Avatar({ label, tone = 'blue' }: AvatarProps) {
  return <span className={`avatar avatar-${tone}`}>{label}</span>;
}

interface PillProps {
  children: ReactNode;
  tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'violet';
}

export function Pill({ children, tone = 'neutral' }: PillProps) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

interface ScoreProps {
  value: number;
  suffix?: string;
}

export function Score({ value, suffix = 'A' }: ScoreProps) {
  return (
    <span className="score">
      <span className="score-ring" aria-hidden="true" />
      <strong>{value}</strong>
      <small>{suffix}</small>
    </span>
  );
}

export function RowCheckbox({ label }: { label: string }) {
  return (
    <label className="row-check">
      <input type="checkbox" aria-label={label} />
      <span aria-hidden="true" />
    </label>
  );
}
