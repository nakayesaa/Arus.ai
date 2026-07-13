import { History } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-heading">
        <h1>{title}</h1>
        {eyebrow && (
          <p className="page-context">
            <History size={16} aria-hidden="true" />
            {eyebrow}
          </p>
        )}
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  );
}
