'use client';

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  RefreshCw,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type {
  DashboardWorkflowCase,
  DashboardWorkflowCasesResponse,
  DashboardWorkflowKind,
} from '@/lib/dashboard/contracts';
import { listDashboardWorkflowCases } from '@/lib/dashboard/client';
import {
  formatBusinessDate,
  formatRupiah,
  humanizeEnum,
} from '@/lib/formatters';

import styles from './page.module.css';

const PAGE_SIZE = 10;

interface WorkflowPulseProps {
  asOfDate: string;
  brokenPromiseCount: number;
  openDisputeCount: number;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: DashboardWorkflowCasesResponse }
  | { status: 'error' };

export function WorkflowPulse({
  asOfDate,
  brokenPromiseCount,
  openDisputeCount,
}: WorkflowPulseProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLButtonElement | null>(null);
  const [activeKind, setActiveKind] = useState<DashboardWorkflowKind | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [retryKey, setRetryKey] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    if (!activeKind) return;
    const controller = new AbortController();
    setLoadState({ status: 'loading' });
    void listDashboardWorkflowCases({
      kind: activeKind,
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
  }, [activeKind, asOfDate, page, retryKey]);

  function openCases(kind: DashboardWorkflowKind, trigger: HTMLButtonElement) {
    returnFocusRef.current = trigger;
    setActiveKind(kind);
    setPage(1);
    setLoadState({ status: 'idle' });
    dialogRef.current?.showModal();
  }

  function closeCases() {
    dialogRef.current?.close();
  }

  function handleClosed() {
    setActiveKind(null);
    setLoadState({ status: 'idle' });
    returnFocusRef.current?.focus();
  }

  const activeCopy = workflowCopy(activeKind);

  return (
    <>
      <section className={styles.workflowPulse} aria-labelledby="pulse-title">
        <header>
          <span>Operational pulse</span>
          <h2 id="pulse-title">Promises kept visible. Exceptions contained.</h2>
        </header>
        <div className={styles.workflowSignals}>
          <button
            type="button"
            data-alert={brokenPromiseCount > 0 || undefined}
            onClick={(event) =>
              openCases('BROKEN_PROMISE', event.currentTarget)
            }
            aria-haspopup="dialog"
          >
            <span className={styles.workflowIcon} aria-hidden="true">
              <CalendarClock size={15} />
            </span>
            <span>
              <strong>{brokenPromiseCount}</strong>
              <small>Broken promises</small>
            </span>
            <p>
              {brokenPromiseCount > 0
                ? 'Commitments missed and raised in queue priority.'
                : 'No customer commitment has slipped past its date.'}
            </p>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            data-alert={openDisputeCount > 0 || undefined}
            onClick={(event) => openCases('OPEN_DISPUTE', event.currentTarget)}
            aria-haspopup="dialog"
          >
            <span className={styles.workflowIcon} aria-hidden="true">
              <AlertTriangle size={15} />
            </span>
            <span>
              <strong>{openDisputeCount}</strong>
              <small>Open disputes</small>
            </span>
            <p>
              {openDisputeCount > 0
                ? 'Exceptions held outside normal collection action.'
                : 'No invoice is paused by an unresolved exception.'}
            </p>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      </section>

      <dialog
        ref={dialogRef}
        className={styles.workflowDialog}
        aria-labelledby="workflow-dialog-title"
        aria-describedby="workflow-dialog-description"
        onClose={handleClosed}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeCases();
        }}
      >
        <header className={styles.dialogHeader}>
          <span className={styles.dialogIcon} data-kind={activeKind}>
            {activeKind === 'BROKEN_PROMISE' ? (
              <CalendarClock size={17} aria-hidden="true" />
            ) : (
              <AlertTriangle size={17} aria-hidden="true" />
            )}
          </span>
          <div>
            <span>As of {formatBusinessDate(asOfDate)}</span>
            <h2 id="workflow-dialog-title">{activeCopy.title}</h2>
            <p id="workflow-dialog-description">{activeCopy.description}</p>
          </div>
          <button
            type="button"
            className={styles.dialogClose}
            aria-label="Close workflow list"
            onClick={closeCases}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div
          className={styles.dialogBody}
          aria-live="polite"
          aria-busy={loadState.status === 'loading'}
        >
          {loadState.status === 'loading' || loadState.status === 'idle' ? (
            <WorkflowCaseSkeleton />
          ) : loadState.status === 'error' ? (
            <div className={styles.dialogState} role="alert">
              <AlertCircle size={18} aria-hidden="true" />
              <div>
                <strong>Couldn’t load this list</strong>
                <p>The summary is safe. Retry the detailed read.</p>
              </div>
              <button
                type="button"
                className="control-button"
                onClick={() => setRetryKey((value) => value + 1)}
              >
                <RefreshCw size={13} aria-hidden="true" /> Retry
              </button>
            </div>
          ) : loadState.response.data.length === 0 ? (
            <div className={styles.dialogState}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <div>
                <strong>{activeCopy.emptyTitle}</strong>
                <p>{activeCopy.emptyDescription}</p>
              </div>
            </div>
          ) : (
            <div className={styles.caseList}>
              {loadState.response.data.map((item) => (
                <WorkflowCaseRow
                  item={item}
                  asOfDate={asOfDate}
                  key={item.id}
                />
              ))}
            </div>
          )}
        </div>

        {loadState.status === 'ready' &&
          loadState.response.pagination.total > 0 && (
            <footer className={styles.dialogFooter}>
              <span>
                {formatResultRange(loadState.response)} of{' '}
                {loadState.response.pagination.total.toLocaleString('id-ID')}
              </span>
              <div>
                <button
                  type="button"
                  className="control-button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ArrowLeft size={13} aria-hidden="true" /> Previous
                </button>
                <button
                  type="button"
                  className="control-button"
                  disabled={page >= loadState.response.pagination.totalPages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next <ArrowRight size={13} aria-hidden="true" />
                </button>
              </div>
            </footer>
          )}
      </dialog>
    </>
  );
}

function WorkflowCaseRow({
  item,
  asOfDate,
}: {
  item: DashboardWorkflowCase;
  asOfDate: string;
}) {
  return (
    <Link
      className={styles.caseRow}
      data-kind={item.kind}
      href={`/invoices/${item.invoice.id}?asOfDate=${asOfDate}`}
      aria-label={`Open invoice ${item.invoice.invoiceNumber}`}
    >
      <span className={styles.caseIdentity}>
        <strong>{item.invoice.invoiceNumber}</strong>
        <small>
          {item.invoice.debtor.name}
          {item.invoice.debtor.code ? ` · ${item.invoice.debtor.code}` : ''}
        </small>
      </span>
      <span className={styles.caseReason}>
        <strong>
          {item.kind === 'BROKEN_PROMISE'
            ? `Promised ${formatRupiah(item.promise.amount)}`
            : humanizeEnum(item.dispute.category)}
        </strong>
        <small>
          {item.kind === 'BROKEN_PROMISE'
            ? `Due ${formatBusinessDate(item.promise.promiseDate)}`
            : item.dispute.details}
        </small>
      </span>
      <span className={styles.caseExposure}>
        <small>Outstanding</small>
        <strong>{formatRupiah(item.invoice.outstandingAmount)}</strong>
      </span>
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
}

function WorkflowCaseSkeleton() {
  return (
    <div className={styles.caseList} role="status" aria-label="Loading cases">
      {Array.from({ length: 3 }, (_, index) => (
        <div className={styles.caseSkeleton} key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function workflowCopy(kind: DashboardWorkflowKind | null) {
  if (kind === 'BROKEN_PROMISE') {
    return {
      title: 'Broken promises',
      description:
        'Missed commitments that need a deliberate follow-up decision.',
      emptyTitle: 'No broken promises',
      emptyDescription: 'Every visible commitment is still on track.',
    };
  }
  return {
    title: 'Open disputes',
    description:
      'Invoices paused from normal collection while an exception is resolved.',
    emptyTitle: 'No open disputes',
    emptyDescription: 'No invoice is currently held by an exception.',
  };
}

function formatResultRange(response: DashboardWorkflowCasesResponse): string {
  const { page, limit, total } = response.pagination;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return `${start.toLocaleString('id-ID')}–${end.toLocaleString('id-ID')}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
