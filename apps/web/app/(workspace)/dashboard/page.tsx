import { ArrowRight, CheckCircle2, Layers3, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import type {
  DashboardAgingMetric,
  DashboardExposure,
} from '@/lib/dashboard/contracts';
import { getDashboard } from '@/lib/dashboard/server';
import { formatBusinessDate, formatRupiah } from '@/lib/formatters';
import { businessDateQuery } from '@/lib/receivables/page-query';
import type { PageSearchParams } from '@/lib/url-query';

import styles from './page.module.css';
import { WorkflowPulse } from './workflow-pulse';

export const metadata: Metadata = {
  title: 'Collections Inbox',
};

interface DashboardPageProps {
  searchParams: Promise<PageSearchParams>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const rawSearchParams = await searchParams;
  const requestedDate = businessDateQuery(rawSearchParams);
  const result = await getDashboard(requestedDate);
  const { summary } = result.data;
  const asOfDate = result.meta.asOfDate;
  const invoiceHref = `/invoices?asOfDate=${asOfDate}`;
  const queueHref = `/collection-queue?asOfDate=${asOfDate}`;

  const summaryMetrics = [
    {
      label: 'Total receivables',
      value: formatRupiah(summary.totalAr),
      detail: `${formatCount(summary.openInvoiceCount, 'open invoice')}`,
      href: invoiceHref,
      tone: 'neutral',
    },
    {
      label: 'Overdue exposure',
      value: formatRupiah(summary.totalOverdue),
      detail: formatCount(summary.overdueInvoiceCount, 'overdue invoice'),
      href: queueHref,
      tone: 'attention',
    },
    {
      label: 'Overdue rate',
      value: `${summary.overduePercent}%`,
      detail: 'Share of current AR',
      href: queueHref,
      tone: 'attention',
    },
    {
      label: 'Aging coverage',
      value: `${activeAgingBuckets(result.data.aging)} / 6`,
      detail: 'Buckets with exposure',
      href: '#aging-distribution',
      tone: 'neutral',
    },
  ] as const;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Collections Inbox"
        eyebrow={`As of ${formatBusinessDate(asOfDate)}`}
        description="Exact receivable exposure, aging concentration, and the invoices that require attention."
        action={
          <Link className="primary-button" href={queueHref}>
            Open collection queue <ArrowRight size={14} aria-hidden="true" />
          </Link>
        }
      />

      <div className={styles.layout}>
        <main className={styles.main}>
          <nav className={styles.summary} aria-label="Receivables summary">
            {summaryMetrics.map((metric) => (
              <Link
                href={metric.href}
                key={metric.label}
                data-tone={metric.tone}
              >
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </Link>
            ))}
          </nav>

          <WorkflowPulse
            asOfDate={asOfDate}
            brokenPromiseCount={result.data.workflows.brokenPromiseCount}
            openDisputeCount={result.data.workflows.openDisputeCount}
          />

          <section
            className={styles.exposure}
            aria-labelledby="overdue-exposure-title"
          >
            <header className={styles.sectionHeader}>
              <div>
                <h2 id="overdue-exposure-title">Largest overdue exposure</h2>
                <p>
                  Highest outstanding balances already past their contractual
                  due date.
                </p>
              </div>
              <Link href={queueHref}>
                Review queue <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </header>

            {result.data.largestOverdue.length > 0 ? (
              <div className={styles.exposureList}>
                {result.data.largestOverdue.map((invoice) => (
                  <ExposureRow
                    invoice={invoice}
                    asOfDate={asOfDate}
                    key={invoice.id}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.emptyExposure} role="status">
                <CheckCircle2 size={18} aria-hidden="true" />
                <div>
                  <strong>No overdue receivables</strong>
                  <p>
                    Current balances remain visible in the aging distribution.
                  </p>
                </div>
              </div>
            )}
          </section>
        </main>

        <aside
          className={styles.context}
          id="aging-distribution"
          aria-labelledby="aging-title"
        >
          <header className={styles.railHeader}>
            <div>
              <h2 id="aging-title">Aging distribution</h2>
              <p>Exact outstanding exposure by contractual aging bucket.</p>
            </div>
            <Layers3 size={16} aria-hidden="true" />
          </header>

          <ExposureRail
            aging={result.data.aging}
            totalAr={summary.totalAr}
            asOfDate={asOfDate}
          />

          <nav className={styles.agingList} aria-label="Aging buckets">
            {result.data.aging.map((metric) => (
              <Link
                className={styles.agingRow}
                href={agingHref(metric.bucket, asOfDate)}
                key={metric.bucket}
              >
                <span className={styles.agingIdentity}>
                  <strong>{agingLabel(metric.bucket)}</strong>
                  <small>{formatCount(metric.invoiceCount, 'invoice')}</small>
                </span>
                <strong className={styles.agingAmount}>
                  {formatRupiah(metric.outstandingAmount)}
                </strong>
              </Link>
            ))}
          </nav>

          <div className={styles.reconciliation}>
            <ShieldCheck size={15} aria-hidden="true" />
            <p>
              Derived from invoice originals minus non-reversed allocations. No
              competing balance ledger is stored.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ExposureRow({
  invoice,
  asOfDate,
}: {
  invoice: DashboardExposure;
  asOfDate: string;
}) {
  return (
    <Link
      className={styles.exposureRow}
      href={`/invoices/${invoice.id}?asOfDate=${asOfDate}`}
    >
      <span className={styles.identity}>
        <strong>{invoice.debtor.name}</strong>
        <small>
          {invoice.invoiceNumber}
          {invoice.debtor.code ? ` · ${invoice.debtor.code}` : ''}
        </small>
      </span>
      <span className={styles.dueDate}>
        Due {formatBusinessDate(invoice.dueDate)}
      </span>
      <span className={styles.aging}>
        {invoice.daysOverdue.toLocaleString('id-ID')} days overdue
      </span>
      <strong className={styles.amount}>
        {formatRupiah(invoice.outstandingAmount)}
      </strong>
      <ArrowRight className={styles.rowArrow} size={14} aria-hidden="true" />
    </Link>
  );
}

function ExposureRail({
  aging,
  totalAr,
  asOfDate,
}: {
  aging: DashboardAgingMetric[];
  totalAr: string;
  asOfDate: string;
}) {
  const total = Number(totalAr);
  const active = aging.filter((metric) => Number(metric.outstandingAmount) > 0);

  if (total === 0 || active.length === 0) {
    return <div className={styles.rail} aria-label="No aging exposure" />;
  }

  return (
    <div className={styles.rail} aria-label="Aging exposure distribution">
      {active.map((metric) => (
        <Link
          data-bucket={metric.bucket}
          href={agingHref(metric.bucket, asOfDate)}
          key={metric.bucket}
          style={{ flexGrow: Number(metric.outstandingAmount) / total }}
          aria-label={`${agingLabel(metric.bucket)}: ${formatRupiah(metric.outstandingAmount)}`}
          title={`${agingLabel(metric.bucket)} · ${formatRupiah(metric.outstandingAmount)}`}
        />
      ))}
    </div>
  );
}

function agingHref(bucket: string, asOfDate: string): string {
  return `/invoices?agingBucket=${bucket}&asOfDate=${asOfDate}`;
}

function agingLabel(bucket: string): string {
  const labels: Record<string, string> = {
    CURRENT: 'Current',
    OVERDUE_1_7: '1–7 days overdue',
    OVERDUE_8_30: '8–30 days overdue',
    OVERDUE_31_60: '31–60 days overdue',
    OVERDUE_61_90: '61–90 days overdue',
    OVERDUE_90_PLUS: '90+ days overdue',
  };
  return labels[bucket] ?? bucket;
}

function activeAgingBuckets(aging: DashboardAgingMetric[]): number {
  return aging.filter((metric) => Number(metric.outstandingAmount) > 0).length;
}

function formatCount(count: number, label: string): string {
  return `${count.toLocaleString('id-ID')} ${label}${count === 1 ? '' : 's'}`;
}
