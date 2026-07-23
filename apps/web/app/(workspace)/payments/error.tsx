'use client';

import { DataRouteError } from '@/components/data-route-error';

interface PaymentsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PaymentsError({ reset }: PaymentsErrorProps) {
  return (
    <DataRouteError
      title="Payments"
      description="We couldn’t load the payment ledger. No financial records were changed."
      reset={reset}
    />
  );
}
