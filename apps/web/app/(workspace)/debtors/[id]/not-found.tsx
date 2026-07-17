import Link from 'next/link';

import { DataPage } from '@/components/data-page';
import { DataState } from '@/components/data-state';

export default function DebtorNotFound() {
  return (
    <DataPage
      title="Customer not found"
      recordLabel="No matching customer"
      pageLabel="The customer may have been removed or belongs to another workspace"
      toolbar={null}
    >
      <DataState
        tone="unavailable"
        title="This customer isn’t available"
        description="Check the link or return to the customer list. No data was changed."
        action={
          <Link className="control-button" href="/debtors">
            Back to customers
          </Link>
        }
      />
    </DataPage>
  );
}
