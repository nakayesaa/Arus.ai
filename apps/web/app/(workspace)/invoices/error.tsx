'use client';

import { DataRouteError } from '@/components/data-route-error';

interface InvoicesErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function InvoicesError({ reset }: InvoicesErrorProps) {
  return (
    <DataRouteError
      title="Invoices"
      description="We couldn’t load the invoice ledger. Your data was not changed."
      reset={reset}
    />
  );
}
