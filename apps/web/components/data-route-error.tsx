'use client';

import { RefreshCw } from 'lucide-react';

import { DataPage } from '@/components/data-page';
import { DataState } from '@/components/data-state';

interface DataRouteErrorProps {
  title: string;
  description: string;
  reset: () => void;
}

export function DataRouteError({
  title,
  description,
  reset,
}: DataRouteErrorProps) {
  return (
    <DataPage
      title={title}
      recordLabel="Temporarily unavailable"
      pageLabel="No changes were made"
      toolbar={null}
    >
      <DataState
        tone="error"
        title={`Couldn’t load ${title.toLocaleLowerCase('en-US')}`}
        description={description}
        action={
          <button className="control-button" type="button" onClick={reset}>
            <RefreshCw size={14} aria-hidden="true" />
            Try again
          </button>
        }
      />
    </DataPage>
  );
}
