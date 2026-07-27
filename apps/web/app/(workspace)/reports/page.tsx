import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  History,
  ShieldCheck,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  formatBusinessDate,
  formatCompactNumber,
  formatRupiah,
  formatTimestamp,
} from '@/lib/formatters';
import type {
  WeeklyReportPriorityInvoice,
  WeeklyReportResponse,
} from '@/lib/reports/contracts';
import { reportPeriodQuery } from '@/lib/reports/page-query';
import { getWeeklyReport } from '@/lib/reports/server';
import type { PageSearchParams } from '@/lib/url-query';

import { AgingInvoiceDrilldown } from './aging-invoice-drilldown';
import { PrintReportButton } from './print-report-button';
import styles from './report.module.css';

export const metadata: Metadata = { title: 'Weekly Report' };

interface ReportsPageProps {
  searchParams: Promise<PageSearchParams>;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const requestedPeriod = reportPeriodQuery(await searchParams);
  const result = await getWeeklyReport(requestedPeriod);
  const report = result.data;
  const periodLabel = `${formatBusinessDate(report.period.from)} – ${formatBusinessDate(report.period.to)}`;
  const invoiceHref = `/invoices?asOfDate=${report.period.to}`;
  const queueHref = `/collection-queue?asOfDate=${report.period.to}`;
  const paymentsHref = `/payments?from=${report.period.from}&to=${report.period.to}`;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <div className={styles.pageTitleRow}>
            <h1>Weekly report</h1>
            <p className={styles.pageContext}>
              <History size={14} aria-hidden="true" />
              {periodLabel}
            </p>
          </div>
          <p className={styles.pageDescription}>
            A reconciled view of ending exposure, confirmed collections, and the
            exceptions that need follow-up.
          </p>
        </div>
        <PrintReportButton />
      </header>

      <div className={styles.content}>
        <section className={styles.controls} aria-label="Report period">
          <form method="get" className={styles.periodForm}>
            <CalendarDays size={15} aria-hidden="true" />
            <label>
              <span>From</span>
              <input
                defaultValue={report.period.from}
                name="from"
                type="date"
                required
              />
            </label>
            <span className={styles.periodDivider} aria-hidden="true" />
            <label>
              <span>To</span>
              <input
                defaultValue={report.period.to}
                name="to"
                type="date"
                required
              />
            </label>
            <button type="submit">Generate</button>
          </form>
          <p>
            {formatCompactNumber(report.period.inclusiveDayCount)} calendar{' '}
            {report.period.inclusiveDayCount === 1 ? 'day' : 'days'}, inclusive
          </p>
        </section>

        <article className={styles.sheet} aria-labelledby="report-title">
          <header className={styles.reportHeader}>
            <div>
              <span className={styles.overline}>Arus weekly collection</span>
              <h2 id="report-title">Receivables review</h2>
              <p>{periodLabel}</p>
            </div>
            <dl className={styles.reportMeta}>
              <div>
                <dt>Generated</dt>
                <dd>{formatTimestamp(report.generatedAt, report.timeZone)}</dd>
              </div>
              <div>
                <dt>Report ID</dt>
                <dd title={report.reportId}>
                  {shortReportId(report.reportId)}
                </dd>
              </div>
            </dl>
          </header>

          <p className={styles.executiveSummary}>{executiveSummary(report)}</p>

          <nav className={styles.summary} aria-label="Report summary">
            <ReportMetric
              label="Ending receivables"
              value={formatRupiah(report.summary.totalAr)}
              detail={formatCount(
                report.summary.openInvoiceCount,
                'open invoice',
              )}
              href={invoiceHref}
            />
            <ReportMetric
              label="Remaining overdue"
              value={formatRupiah(report.summary.totalOverdue)}
              detail={formatCount(
                report.summary.overdueInvoiceCount,
                'overdue invoice',
              )}
              href={queueHref}
            />
            <ReportMetric
              label="Collected in period"
              value={formatRupiah(report.collections.amount)}
              detail={formatCount(
                report.collections.allocationCount,
                'confirmed allocation',
              )}
              href={paymentsHref}
            />
            <ReportMetric
              label="Overdue share"
              value={`${report.summary.overduePercent}%`}
              detail="Of ending receivables"
              href={queueHref}
            />
          </nav>

          <div className={styles.reviewGrid}>
            <section
              className={styles.agingSection}
              aria-labelledby="aging-title"
            >
              <SectionHeading
                id="aging-title"
                title="Ending aging"
                description={`Point-in-time exposure as of ${formatBusinessDate(report.period.to)}.`}
              />
              <AgingInvoiceDrilldown
                metrics={report.aging}
                totalAr={report.summary.totalAr}
                asOfDate={report.period.to}
              />
            </section>

            <section
              className={styles.workflowSection}
              aria-labelledby="workflow-title"
            >
              <SectionHeading
                id="workflow-title"
                title="Commitments & exceptions"
                description="Signals tied directly to the same receivable ledger."
              />
              <dl className={styles.workflowList}>
                <WorkflowMetric
                  label="Active promises"
                  count={report.promises.active.count}
                  amount={report.promises.active.amount}
                />
                <WorkflowMetric
                  label="Broken promises"
                  count={report.promises.broken.count}
                  amount={report.promises.broken.amount}
                />
                <WorkflowMetric
                  label="Promises kept"
                  count={report.promises.keptInPeriod.count}
                  amount={report.promises.keptInPeriod.amount}
                  period
                />
                <WorkflowMetric
                  label="Open disputes"
                  count={report.disputes.openInvoiceCount}
                  amount={report.disputes.outstandingAmount}
                />
              </dl>
            </section>
          </div>

          <section
            className={styles.prioritySection}
            aria-labelledby="priority-title"
          >
            <SectionHeading
              id="priority-title"
              title="Priority follow-up"
              description="Largest remaining overdue balances at the report cutoff."
              action={
                report.priorityOverdue.length > 0 ? (
                  <Link href={queueHref}>
                    Open full queue
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                ) : null
              }
            />
            {report.priorityOverdue.length > 0 ? (
              <div className={styles.priorityList}>
                <div className={styles.priorityHeader} aria-hidden="true">
                  <span>Customer / invoice</span>
                  <span>Due date</span>
                  <span>Position</span>
                  <span>Outstanding</span>
                  <span />
                </div>
                {report.priorityOverdue.map((invoice) => (
                  <PriorityRow
                    invoice={invoice}
                    asOfDate={report.period.to}
                    key={invoice.id}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.emptyState} role="status">
                <CheckCircle2 size={18} aria-hidden="true" />
                <div>
                  <strong>No overdue balances at this cutoff</strong>
                  <p>
                    Current receivables remain included in the ending aging
                    section.
                  </p>
                </div>
              </div>
            )}
          </section>

          <footer className={styles.reconciliation}>
            <ShieldCheck size={16} aria-hidden="true" />
            <p>
              Ending balances equal invoice originals minus allocations active
              at the cutoff. Period collections use allocation dates, and
              reversed allocations are excluded at their effective reversal
              date.
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}

function ReportMetric({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  href: string;
}) {
  return (
    <Link href={href}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
      <ArrowRight size={13} aria-hidden="true" />
    </Link>
  );
}

function SectionHeading({
  id,
  title,
  description,
  action,
}: {
  id: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className={styles.sectionHeading}>
      <div>
        <h3 id={id}>{title}</h3>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function WorkflowMetric({
  label,
  count,
  amount,
  period = false,
}: {
  label: string;
  count: number;
  amount: string;
  period?: boolean;
}) {
  return (
    <div>
      <dt>
        {label}
        {period && <small>During period</small>}
      </dt>
      <dd>
        <strong>{formatRupiah(amount)}</strong>
        <span>{formatCount(count, 'record')}</span>
      </dd>
    </div>
  );
}

function PriorityRow({
  invoice,
  asOfDate,
}: {
  invoice: WeeklyReportPriorityInvoice;
  asOfDate: string;
}) {
  return (
    <Link
      className={styles.priorityRow}
      href={`/invoices/${invoice.id}?asOfDate=${asOfDate}`}
    >
      <span>
        <strong>{invoice.debtor.name}</strong>
        <small>
          {invoice.invoiceNumber}
          {invoice.debtor.code ? ` · ${invoice.debtor.code}` : ''}
        </small>
      </span>
      <span>{formatBusinessDate(invoice.dueDate)}</span>
      <span>{formatCount(invoice.daysOverdue, 'day')} overdue</span>
      <strong>{formatRupiah(invoice.outstandingAmount)}</strong>
      <ArrowRight size={13} aria-hidden="true" />
    </Link>
  );
}

function executiveSummary(report: WeeklyReportResponse['data']): string {
  if (report.summary.totalAr === '0.00') {
    return report.collections.amount === '0.00'
      ? 'No receivable exposure or confirmed collection activity was recorded for this review.'
      : `${formatRupiah(report.collections.amount)} was confirmed during the period, with no receivable balance remaining at the cutoff.`;
  }
  if (report.summary.totalOverdue === '0.00') {
    return `${formatRupiah(report.summary.totalAr)} remains open, with every balance still within terms at the cutoff.`;
  }
  return `${formatRupiah(report.collections.amount)} was confirmed during the period. ${formatRupiah(report.summary.totalOverdue)} remains overdue across ${formatCount(report.summary.overdueInvoiceCount, 'invoice')} and should anchor the next collection cycle.`;
}

function formatCount(count: number, noun: string): string {
  return `${formatCompactNumber(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function shortReportId(id: string): string {
  return id.slice(0, 8).toLocaleUpperCase('en-US');
}
