import { DataPage } from '@/components/data-page';
import { TableSkeleton } from '@/components/data-state';

export default function DebtorsLoading() {
  return (
    <DataPage
      title="My Accounts"
      recordLabel="Loading accounts"
      pageLabel="Fetching current receivables"
      toolbar={null}
    >
      <TableSkeleton columns={6} />
    </DataPage>
  );
}
