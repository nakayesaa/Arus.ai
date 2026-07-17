'use client';

import { DataRouteError } from '@/components/data-route-error';

interface DebtorsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DebtorsError({ reset }: DebtorsErrorProps) {
  return (
    <DataRouteError
      title="My Accounts"
      description="We couldn’t load debtor accounts. Your data was not changed."
      reset={reset}
    />
  );
}
