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

export function RowCheckbox({ label }: { label: string }) {
  return (
    <label className="row-check">
      <input type="checkbox" aria-label={label} />
      <span aria-hidden="true" />
    </label>
  );
}
