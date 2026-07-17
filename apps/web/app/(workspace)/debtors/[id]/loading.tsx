import { TableSkeleton } from '@/components/data-state';

export default function DebtorDetailLoading() {
  return (
    <section className="record-page" aria-label="Loading account details">
      <header className="record-topbar">
        <div>
          <span className="record-loading-line" />
          <span className="record-loading-title" />
          <span className="record-loading-line" />
        </div>
      </header>
      <div className="record-content">
        <div className="record-metrics record-metrics-loading">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        <div className="record-panel">
          <TableSkeleton columns={5} />
        </div>
      </div>
    </section>
  );
}
