'use client';

import { RefreshCw } from 'lucide-react';

interface PaymentDetailErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PaymentDetailError({ reset }: PaymentDetailErrorProps) {
  return (
    <section className="record-page">
      <header className="record-topbar">
        <div>
          <h1>Payment unavailable</h1>
          <p>The payment ledger was not changed.</p>
        </div>
        <button className="control-button" type="button" onClick={reset}>
          <RefreshCw size={14} aria-hidden="true" />
          Try again
        </button>
      </header>
    </section>
  );
}
