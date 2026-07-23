'use client';

import { DataRouteError } from '@/components/data-route-error';

interface ReportsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ReportsError({ reset }: ReportsErrorProps) {
  return (
    <DataRouteError
      title="Weekly report"
      description="We couldn’t reconcile this report. No financial records were changed."
      reset={reset}
    />
  );
}
