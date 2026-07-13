import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = {
  title: 'Dashboard',
};

const metrics = [
  ['Total AR', 'Rp 0'],
  ['Total overdue', 'Rp 0'],
  ['Collected this week', 'Rp 0'],
  ['Broken promises', '0'],
] as const;

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="Satu pandangan untuk exposure, collection progress, promise, dan dispute."
      />

      <section className="metrics-grid" aria-label="Collection metrics">
        {metrics.map(([label, value]) => (
          <article className="card metric-card" key={label}>
            <p className="metric-label">{label}</p>
            <p className="metric-value">{value}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="card card-body">
          <h2>Aging breakdown</h2>
          <p className="muted">
            Aging totals akan muncul setelah invoice pertama berhasil diimpor.
          </p>
        </article>
        <article className="card card-body">
          <h2>Start operating</h2>
          <p className="muted">
            Gunakan canonical CSV untuk memuat receivable tanpa double-count.
          </p>
          <Link className="button" href="/import">
            Import invoices
          </Link>
        </article>
      </section>
    </>
  );
}
