import { DataPage } from '@/components/data-page';
import { TableSkeleton } from '@/components/data-state';

export default function PaymentsLoading() {
  return (
    <DataPage
      title="Payments"
      recordLabel="Loading payments"
      pageLabel="Reconciling payment allocations"
      toolbar={null}
    >
      <TableSkeleton columns={8} />
    </DataPage>
  );
}
