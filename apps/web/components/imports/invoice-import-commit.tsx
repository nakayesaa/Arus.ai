import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  FileWarning,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';

import { formatRupiah } from '@/lib/formatters';
import type {
  InvoiceImportCommit,
  InvoiceImportJob,
} from '@/lib/imports/contracts';

import styles from './invoice-import-commit.module.css';
import type { ImportUiError } from './types';

interface InvoiceImportCommitPanelProps {
  job: InvoiceImportJob;
  organizationName: string;
  reviewing: boolean;
  committing: boolean;
  result: InvoiceImportCommit | null;
  error: ImportUiError | null;
  onReview: () => void;
  onCancelReview: () => void;
  onCommit: () => void;
}

export function InvoiceImportCommitPanel({
  job,
  organizationName,
  reviewing,
  committing,
  result,
  error,
  onReview,
  onCancelReview,
  onCommit,
}: InvoiceImportCommitPanelProps) {
  if (job.status === 'COMMITTED' && result) {
    return <CommittedResult result={result} />;
  }
  if (job.status !== 'READY') return null;

  if (job.counts.valid === 0) {
    return (
      <section className={styles.panel} data-state="blocked">
        <span className={styles.leadingIcon} aria-hidden="true">
          <FileWarning size={17} />
        </span>
        <div className={styles.copy}>
          <strong>Nothing is eligible to post</strong>
          <p>
            Correct the invalid rows in the source CSV, then generate a new
            preview.
          </p>
        </div>
      </section>
    );
  }

  if (!reviewing) {
    return (
      <section className={styles.panel} data-state="ready">
        <span className={styles.leadingIcon} aria-hidden="true">
          <LockKeyhole size={17} />
        </span>
        <div className={styles.copy}>
          <strong>Ready for controlled posting</strong>
          <p>
            {formatCount(job.counts.valid, 'valid invoice')} can enter the
            ledger. {formatCount(skippedRows(job), 'row')} will remain as
            evidence only.
          </p>
        </div>
        <button className="primary-button" type="button" onClick={onReview}>
          Review commit <ArrowRight size={14} aria-hidden="true" />
        </button>
      </section>
    );
  }

  return (
    <section
      className={`${styles.panel} ${styles.review}`}
      data-state="review"
      aria-labelledby="commit-review-title"
    >
      <div className={styles.reviewHeader}>
        <span className={styles.leadingIcon} aria-hidden="true">
          <ShieldCheck size={18} />
        </span>
        <div className={styles.copy}>
          <strong id="commit-review-title">
            Post {formatCount(job.counts.valid, 'invoice')} to{' '}
            {organizationName}
          </strong>
          <p>
            This financial posting is atomic. A failure changes nothing, and
            retrying the same job cannot create duplicates.
          </p>
        </div>
      </div>

      <dl className={styles.effects} aria-label="Commit effects">
        <div>
          <dt>Invoices created</dt>
          <dd>{job.counts.valid.toLocaleString('id-ID')}</dd>
        </div>
        <div>
          <dt>Rows skipped</dt>
          <dd>{skippedRows(job).toLocaleString('id-ID')}</dd>
        </div>
        <div>
          <dt>Opening balances</dt>
          <dd>From paid_amount</dd>
        </div>
      </dl>

      <p className={styles.effectNote}>
        Existing debtors are matched; new debtors are created only for rows
        marked “Will create”. Invalid and duplicate rows are never posted.
      </p>

      {error && (
        <div className={styles.error} role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <div>
            <strong>Posting did not complete.</strong>
            <p>{error.message}</p>
            {error.requestId && <small>Request ID: {error.requestId}</small>}
          </div>
        </div>
      )}

      <div className={styles.actions}>
        <button
          className="control-button"
          type="button"
          onClick={onCancelReview}
          disabled={committing}
        >
          Back to preview
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={onCommit}
          disabled={committing}
        >
          {committing ? (
            <LoaderCircle
              className={styles.spinner}
              size={14}
              aria-hidden="true"
            />
          ) : (
            <Database size={14} aria-hidden="true" />
          )}
          {committing
            ? 'Posting once…'
            : `Commit ${job.counts.valid.toLocaleString('id-ID')} invoices`}
        </button>
      </div>
    </section>
  );
}

function CommittedResult({ result }: { result: InvoiceImportCommit }) {
  const evidence = result.reconciliation;

  return (
    <section className={styles.panel} data-state="committed" role="status">
      <div className={styles.reviewHeader}>
        <span className={styles.leadingIcon} aria-hidden="true">
          <CheckCircle2 size={18} />
        </span>
        <div className={styles.copy}>
          <strong>Ledger posting reconciled</strong>
          <p>
            {result.replayed
              ? 'The server returned the original result. No records were posted twice.'
              : 'Every valid row was posted in one transaction and linked back to this import.'}
          </p>
        </div>
      </div>

      <dl className={styles.evidence} aria-label="Commit reconciliation">
        <div>
          <dt>Invoices</dt>
          <dd>{evidence.committedInvoices.toLocaleString('id-ID')}</dd>
        </div>
        <div>
          <dt>New debtors</dt>
          <dd>{evidence.createdDebtors.toLocaleString('id-ID')}</dd>
        </div>
        <div>
          <dt>Opening payments</dt>
          <dd>{evidence.openingPayments.toLocaleString('id-ID')}</dd>
        </div>
        <div>
          <dt>Opening allocated</dt>
          <dd>{formatRupiah(evidence.openingAllocatedAmount)}</dd>
        </div>
      </dl>

      <div className={styles.actions}>
        <Link className="control-button" href="/dashboard">
          Review dashboard
        </Link>
        <Link className="primary-button" href="/invoices">
          Open invoices <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

function skippedRows(job: InvoiceImportJob): number {
  return job.counts.invalid + job.counts.duplicate;
}

function formatCount(count: number, label: string): string {
  return `${count.toLocaleString('id-ID')} ${label}${count === 1 ? '' : 's'}`;
}
