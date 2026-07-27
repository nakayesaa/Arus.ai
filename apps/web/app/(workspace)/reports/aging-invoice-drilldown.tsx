'use client';

import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  RefreshCw,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import {
  formatBusinessDate,
  formatCompactNumber,
  formatDuePosition,
  formatRupiah,
} from '@/lib/formatters';
import { listInvoices } from '@/lib/receivables/client';
import type {
  AgingBucket,
  Invoice,
  InvoiceListResponse,
} from '@/lib/receivables/contracts';
import type { WeeklyReportAgingMetric } from '@/lib/reports/contracts';

import styles from './report.module.css';

const PAGE_SIZE = 10;

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: InvoiceListResponse }
  | { status: 'error' };

interface AgingInvoiceDrilldownProps {
  metrics: WeeklyReportAgingMetric[];
  totalAr: string;
  asOfDate: string;
}

export function AgingInvoiceDrilldown({
  metrics,
  totalAr,
  asOfDate,
}: AgingInvoiceDrilldownProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [activeMetric, setActiveMetric] =
    useState<WeeklyReportAgingMetric | null>(null);
  const [page, setPage] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    if (!activeMetric) return;

    const controller = new AbortController();
    setLoadState({ status: 'loading' });
    void listInvoices({
      agingBucket: activeMetric.bucket,
      outstandingOnly: true,
      asOfDate,
      page,
      limit: PAGE_SIZE,
      signal: controller.signal,
    })
      .then((response) => setLoadState({ status: 'ready', response }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setLoadState({ status: 'error' });
      });

    return () => controller.abort();
  }, [activeMetric, asOfDate, page, retryKey]);

  function openInvoices(
    metric: WeeklyReportAgingMetric,
    trigger: HTMLButtonElement,
  ) {
    returnFocusRef.current = trigger;
    setActiveMetric(metric);
    setPage(1);
    setLoadState({ status: 'idle' });
    dialogRef.current?.showModal();
  }

  function closeInvoices() {
    dialogRef.current?.close();
  }

  function handleClosed() {
    setActiveMetric(null);
    setLoadState({ status: 'idle' });
    returnFocusRef.current?.focus();
  }

  const activeLabel = activeMetric
    ? agingLabel(activeMetric.bucket)
    : 'Aging invoices';

  return (
    <>
      <div className={styles.agingTable} role="table">
        <div className={styles.agingTableHeader} role="row">
          <span role="columnheader">Aging bucket</span>
          <span role="columnheader">Invoices</span>
          <span role="columnheader">Outstanding</span>
        </div>
        {metrics.map((metric) => (
          <AgingTrigger
            key={metric.bucket}
            metric={metric}
            totalAr={totalAr}
            onOpen={openInvoices}
          />
        ))}
      </div>

      <dialog
        ref={dialogRef}
        className={styles.agingDialog}
        aria-labelledby="aging-dialog-title"
        aria-describedby="aging-dialog-description"
        onClose={handleClosed}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeInvoices();
        }}
      >
        <header className={styles.agingDialogHeader}>
          <span className={styles.agingDialogIcon} aria-hidden="true">
            <CalendarRange size={17} />
          </span>
          <div>
            <span>As of {formatBusinessDate(asOfDate)}</span>
            <h2 id="aging-dialog-title">{activeLabel}</h2>
            <p id="aging-dialog-description">
              {activeMetric
                ? `${formatCompactNumber(activeMetric.invoiceCount)} ${activeMetric.invoiceCount === 1 ? 'invoice' : 'invoices'} · ${formatRupiah(activeMetric.outstandingAmount)} outstanding`
                : 'Invoices in this aging position.'}
            </p>
          </div>
          <button
            type="button"
            className={styles.agingDialogClose}
            aria-label="Close aging invoice list"
            onClick={closeInvoices}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div
          className={styles.agingDialogBody}
          aria-live="polite"
          aria-busy={
            loadState.status === 'loading' || loadState.status === 'idle'
          }
        >
          {loadState.status === 'loading' || loadState.status === 'idle' ? (
            <InvoiceListSkeleton />
          ) : loadState.status === 'error' ? (
            <div className={styles.agingDialogState} role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <div>
                <strong>Couldn’t load these invoices</strong>
                <p>The report total is safe. Retry the detailed read.</p>
              </div>
              <button
                type="button"
                className="control-button"
                onClick={() => setRetryKey((value) => value + 1)}
              >
                <RefreshCw size={13} aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : loadState.response.data.length === 0 ? (
            <div className={styles.agingDialogState}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <div>
                <strong>No invoices in this bucket</strong>
                <p>
                  The detailed ledger has no matching invoice at this cutoff.
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.agingInvoiceList}>
              <div className={styles.agingInvoiceListHeader} aria-hidden="true">
                <span>Customer / invoice</span>
                <span>Due position</span>
                <span>Outstanding</span>
                <span />
              </div>
              {loadState.response.data.map((invoice) => (
                <InvoiceRow
                  invoice={invoice}
                  asOfDate={asOfDate}
                  key={invoice.id}
                />
              ))}
            </div>
          )}
        </div>

        {loadState.status === 'ready' &&
          loadState.response.pagination.total > 0 && (
            <footer className={styles.agingDialogFooter}>
              <span>
                {formatResultRange(loadState.response)} of{' '}
                {formatCompactNumber(loadState.response.pagination.total)}
              </span>
              <div>
                <button
                  type="button"
                  className="control-button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ArrowLeft size={13} aria-hidden="true" />
                  Previous
                </button>
                <button
                  type="button"
                  className="control-button"
                  disabled={page >= loadState.response.pagination.totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                  <ArrowRight size={13} aria-hidden="true" />
                </button>
              </div>
            </footer>
          )}
      </dialog>
    </>
  );
}

function AgingTrigger({
  metric,
  totalAr,
  onOpen,
}: {
  metric: WeeklyReportAgingMetric;
  totalAr: string;
  onOpen: (metric: WeeklyReportAgingMetric, trigger: HTMLButtonElement) => void;
}) {
  const share = moneyShare(metric.outstandingAmount, totalAr);
  const label = agingLabel(metric.bucket);

  return (
    <div className={styles.agingRow} role="row">
      <span className={styles.agingIdentity} role="cell">
        <button
          className={styles.agingBucketButton}
          type="button"
          aria-haspopup="dialog"
          aria-label={`View ${label} invoices`}
          onClick={(event) => onOpen(metric, event.currentTarget)}
        >
          <strong>{label}</strong>
          <span className={styles.agingTrack} aria-hidden="true">
            <span style={{ width: `${share}%` }} />
          </span>
        </button>
      </span>
      <span role="cell">
        {formatCompactNumber(metric.invoiceCount)}
        <small>{share}%</small>
      </span>
      <strong role="cell">{formatRupiah(metric.outstandingAmount)}</strong>
    </div>
  );
}

function InvoiceRow({
  invoice,
  asOfDate,
}: {
  invoice: Invoice;
  asOfDate: string;
}) {
  return (
    <Link
      className={styles.agingInvoiceRow}
      href={`/invoices/${invoice.id}?asOfDate=${asOfDate}`}
      aria-label={`Open invoice ${invoice.invoiceNumber}`}
    >
      <span className={styles.agingInvoiceIdentity}>
        <strong>{invoice.debtor.name}</strong>
        <small>
          {invoice.invoiceNumber}
          {invoice.debtor.code ? ` · ${invoice.debtor.code}` : ''}
        </small>
      </span>
      <span className={styles.agingInvoiceDue}>
        <strong>{formatDuePosition(invoice.aging)}</strong>
        <small>Due {formatBusinessDate(invoice.dueDate)}</small>
      </span>
      <span className={styles.agingInvoiceAmount}>
        <small>Outstanding</small>
        <strong>{formatRupiah(invoice.outstandingAmount)}</strong>
      </span>
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
}

function InvoiceListSkeleton() {
  return (
    <div
      className={styles.agingInvoiceList}
      role="status"
      aria-label="Loading invoices"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div className={styles.agingInvoiceSkeleton} key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function agingLabel(bucket: AgingBucket): string {
  switch (bucket) {
    case 'CURRENT':
      return 'Current';
    case 'OVERDUE_1_7':
      return '1–7 days overdue';
    case 'OVERDUE_8_30':
      return '8–30 days overdue';
    case 'OVERDUE_31_60':
      return '31–60 days overdue';
    case 'OVERDUE_61_90':
      return '61–90 days overdue';
    case 'OVERDUE_90_PLUS':
      return '90+ days overdue';
  }
}

function moneyShare(amount: string, total: string): number {
  const totalCents = moneyToCents(total);
  if (totalCents === 0n) return 0;
  return Number((moneyToCents(amount) * 1_000n) / totalCents) / 10;
}

function moneyToCents(value: string): bigint {
  const [whole, fraction] = value.split('.');
  if (!whole || !fraction) throw new Error(`Invalid canonical money: ${value}`);
  return BigInt(whole) * 100n + BigInt(fraction);
}

function formatResultRange(response: InvoiceListResponse): string {
  const start = (response.pagination.page - 1) * response.pagination.limit + 1;
  const end = Math.min(
    response.pagination.page * response.pagination.limit,
    response.pagination.total,
  );
  return `${formatCompactNumber(start)}–${formatCompactNumber(end)}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
