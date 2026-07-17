'use client';

import { DataRouteError } from '@/components/data-route-error';

interface DebtorsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DebtorsError({ reset }: DebtorsErrorProps) {
  return (
    <DataRouteError
      title="Customers"
      description="We couldn’t load customers. Your data was not changed."
      reset={reset}
    />
  );
}
