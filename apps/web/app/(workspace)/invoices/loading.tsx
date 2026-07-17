import { DataPage } from '@/components/data-page';
import { TableSkeleton } from '@/components/data-state';

export default function InvoicesLoading() {
  return (
    <DataPage
      title="Invoices"
      recordLabel="Loading invoices"
      pageLabel="Calculating current balances and aging"
      toolbar={null}
    >
      <TableSkeleton columns={9} />
    </DataPage>
  );
}
