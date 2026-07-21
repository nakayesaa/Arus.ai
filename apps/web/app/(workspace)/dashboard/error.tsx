'use client';

import { DataRouteError } from '@/components/data-route-error';

export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <DataRouteError
      title="Collections Inbox"
      description="We couldn’t reconcile the dashboard from the current invoice ledger. Your data was not changed."
      reset={reset}
    />
  );
}
