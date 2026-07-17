import Link from 'next/link';

import { DataPage } from '@/components/data-page';
import { DataState } from '@/components/data-state';

export default function InvoiceNotFound() {
  return (
    <DataPage
      title="Invoice not found"
      recordLabel="No matching invoice"
      pageLabel="The invoice may have been removed or belongs to another workspace"
      toolbar={null}
    >
      <DataState
        tone="unavailable"
        title="This invoice isn’t available"
        description="Check the link or return to the invoice ledger. No data was changed."
        action={
          <Link className="control-button" href="/invoices">
            Back to invoices
          </Link>
        }
      />
    </DataPage>
  );
}
