import { DataPage } from '@/components/data-page';
import { TableSkeleton } from '@/components/data-state';

export default function DebtorsLoading() {
  return (
    <DataPage
      title="Customers"
      recordLabel="Loading customers"
      pageLabel="Fetching current receivables"
      toolbar={null}
    >
      <TableSkeleton columns={6} />
    </DataPage>
  );
}
