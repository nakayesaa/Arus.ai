import Link from 'next/link';

import { DataPage } from '@/components/data-page';
import { DataState } from '@/components/data-state';

export default function DebtorNotFound() {
  return (
    <DataPage
      title="Account not found"
      recordLabel="No matching debtor"
      pageLabel="The account may have been removed or belongs to another workspace"
      toolbar={null}
    >
      <DataState
        tone="unavailable"
        title="This account isn’t available"
        description="Check the link or return to the account list. No data was changed."
        action={
          <Link className="control-button" href="/debtors">
            Back to accounts
          </Link>
        }
      />
    </DataPage>
  );
}
