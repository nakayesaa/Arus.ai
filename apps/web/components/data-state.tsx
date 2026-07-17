import { AlertCircle, Database, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface DataStateProps {
  title: string;
  description: string;
  tone?: 'empty' | 'error' | 'unavailable';
  action?: ReactNode;
}

export function DataState({
  title,
  description,
  tone = 'empty',
  action,
}: DataStateProps) {
  const Icon = tone === 'error' ? AlertCircle : Database;
  return (
    <div className={`data-state data-state-${tone}`} role="status">
      <span className="data-state-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action && <div className="data-state-action">{action}</div>}
    </div>
  );
}

export function RetryLink({
  href,
  label = 'Try again',
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link className="control-button" href={href}>
      <RefreshCw size={14} aria-hidden="true" />
      {label}
    </Link>
  );
}

export function TableSkeleton({
  columns,
  rows = 7,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <div className="table-skeleton" role="status" aria-label="Loading records">
      {Array.from({ length: rows }, (_, row) => (
        <div
          className="table-skeleton-row"
          key={row}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: columns }, (_, column) => (
            <span key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}
