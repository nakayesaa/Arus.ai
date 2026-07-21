import { DataPage } from '@/components/data-page';
import { TableSkeleton } from '@/components/data-state';

export default function CollectionQueueLoading() {
  return (
    <DataPage
      title="Collection Queue"
      recordLabel="Prioritizing invoices"
      pageLabel="Reconciling exact balances and queue signals"
      toolbar={null}
    >
      <TableSkeleton columns={6} rows={8} />
    </DataPage>
  );
}
