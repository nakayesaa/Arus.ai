'use client';

import { DataRouteError } from '@/components/data-route-error';

export default function CollectionQueueError({ reset }: { reset: () => void }) {
  return (
    <DataRouteError
      title="Collection Queue"
      description="We couldn’t derive the queue from the current invoice ledger. Your data was not changed."
      reset={reset}
    />
  );
}
