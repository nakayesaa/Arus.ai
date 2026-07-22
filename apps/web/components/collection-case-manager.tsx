'use client';

import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  LoaderCircle,
  Plus,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  ApiClientError,
  ApiContractError,
  ApiTimeoutError,
} from '@/lib/api-client/errors';
import {
  cancelPromise,
  createDispute,
  createPromise,
  resolveDispute,
} from '@/lib/collection-cases/client';
import {
  cancelPromiseInputSchema,
  createDisputeInputSchema,
  createPromiseInputSchema,
  disputeCategories,
  resolveDisputeInputSchema,
  type DisputeCategory,
  type DisputeView,
  type PromiseView,
} from '@/lib/collection-cases/contracts';
import {
  formatBusinessDate,
  formatRupiah,
  formatTimestamp,
  humanizeEnum,
} from '@/lib/formatters';

import styles from './collection-case-manager.module.css';

interface CollectionCaseManagerProps {
  invoiceId: string;
  workflowBusinessDate: string;
  timeZone: string;
  outstandingAmount: string;
  promises: PromiseView[];
  disputes: DisputeView[];
}

interface PendingCommand {
  fingerprint: string;
  operationKey: string;
}

type OpenComposer = 'promise' | 'dispute' | null;

export function CollectionCaseManager({
  invoiceId,
  workflowBusinessDate,
  timeZone,
  outstandingAmount,
  promises,
  disputes,
}: CollectionCaseManagerProps) {
  const router = useRouter();
  const [openComposer, setOpenComposer] = useState<OpenComposer>(null);
  const [promiseAmount, setPromiseAmount] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [disputeCategory, setDisputeCategory] =
    useState<DisputeCategory>('MISSING_POD');
  const [disputeDetails, setDisputeDetails] = useState('');
  const [cancellingPromiseId, setCancellingPromiseId] = useState<string | null>(
    null,
  );
  const [cancelReason, setCancelReason] = useState('');
  const [resolvingDisputeId, setResolvingDisputeId] = useState<string | null>(
    null,
  );
  const [resolutionNote, setResolutionNote] = useState('');
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingCommand = useRef<PendingCommand | null>(null);
  const requestAbort = useRef<AbortController | null>(null);

  useEffect(() => () => requestAbort.current?.abort(), []);

  const livePromise = promises.find(
    (promise) => promise.status === 'ACTIVE' || promise.status === 'DUE',
  );

  async function execute(
    key: string,
    fingerprint: string,
    command: (operationKey: string, signal: AbortSignal) => Promise<unknown>,
    successMessage: string,
    onSuccess: () => void,
  ) {
    if (submittingKey) return;
    if (pendingCommand.current?.fingerprint !== fingerprint) {
      pendingCommand.current = {
        fingerprint,
        operationKey: crypto.randomUUID(),
      };
    }

    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    setSubmittingKey(key);
    setError(null);
    setNotice(null);

    try {
      await command(pendingCommand.current.operationKey, controller.signal);
      if (controller.signal.aborted) return;
      pendingCommand.current = null;
      onSuccess();
      setNotice(successMessage);
      router.refresh();
    } catch (requestError) {
      if (!isAbortError(requestError)) setError(errorMessage(requestError));
    } finally {
      if (requestAbort.current === controller) {
        requestAbort.current = null;
        setSubmittingKey(null);
      }
    }
  }

  function submitPromise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createPromiseInputSchema.safeParse({
      amount: promiseAmount,
      promiseDate,
    });
    if (!parsed.success) {
      setError(fieldMessage(parsed.error));
      return;
    }
    const fingerprint = `create-promise:${JSON.stringify(parsed.data)}`;
    void execute(
      'create-promise',
      fingerprint,
      (operationKey, signal) =>
        createPromise(invoiceId, operationKey, parsed.data, signal),
      'Promise secured. The queue now knows what to protect.',
      () => {
        setPromiseAmount('');
        setPromiseDate('');
        setOpenComposer(null);
      },
    );
  }

  function submitCancellation(
    event: FormEvent<HTMLFormElement>,
    promiseId: string,
  ) {
    event.preventDefault();
    const parsed = cancelPromiseInputSchema.safeParse({ reason: cancelReason });
    if (!parsed.success) {
      setError(fieldMessage(parsed.error));
      return;
    }
    const fingerprint = `cancel-promise:${promiseId}:${JSON.stringify(parsed.data)}`;
    void execute(
      `cancel-${promiseId}`,
      fingerprint,
      (operationKey, signal) =>
        cancelPromise(promiseId, operationKey, parsed.data, signal),
      'Promise closed with its reason preserved.',
      () => {
        setCancelReason('');
        setCancellingPromiseId(null);
      },
    );
  }

  function submitDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createDisputeInputSchema.safeParse({
      category: disputeCategory,
      details: disputeDetails,
    });
    if (!parsed.success) {
      setError(fieldMessage(parsed.error));
      return;
    }
    const fingerprint = `create-dispute:${JSON.stringify(parsed.data)}`;
    void execute(
      'create-dispute',
      fingerprint,
      (operationKey, signal) =>
        createDispute(invoiceId, operationKey, parsed.data, signal),
      'Dispute isolated. Normal collection is paused for this invoice.',
      () => {
        setDisputeDetails('');
        setOpenComposer(null);
      },
    );
  }

  function submitResolution(
    event: FormEvent<HTMLFormElement>,
    disputeId: string,
  ) {
    event.preventDefault();
    const parsed = resolveDisputeInputSchema.safeParse({
      resolutionNote: resolutionNote.trim() ? resolutionNote : null,
    });
    if (!parsed.success) {
      setError(fieldMessage(parsed.error));
      return;
    }
    const fingerprint = `resolve-dispute:${disputeId}:${JSON.stringify(parsed.data)}`;
    void execute(
      `resolve-${disputeId}`,
      fingerprint,
      (operationKey, signal) =>
        resolveDispute(disputeId, operationKey, parsed.data, signal),
      'Dispute resolved. This invoice can return to the collection flow.',
      () => {
        setResolutionNote('');
        setResolvingDisputeId(null);
      },
    );
  }

  function toggleComposer(composer: Exclude<OpenComposer, null>) {
    setOpenComposer((current) => (current === composer ? null : composer));
    setError(null);
    setNotice(null);
  }

  return (
    <section
      className={`record-panel ${styles.manager}`}
      aria-labelledby="collection-cases-title"
    >
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Collection control</span>
          <h2 id="collection-cases-title">Commitments &amp; exceptions</h2>
          <p>
            Turn customer commitments into dates, and isolate exceptions before
            they distort the queue.
          </p>
        </div>
      </header>

      {(error || notice) && (
        <div className={styles.feedbackRegion} aria-live="polite">
          {error && (
            <p className={styles.error} role="alert">
              <AlertTriangle size={13} aria-hidden="true" />
              {error}
            </p>
          )}
          {notice && (
            <p className={styles.success} role="status">
              <span aria-hidden="true">
                <Check size={12} />
              </span>
              <span>
                <strong>Evidence secured.</strong> {notice}
              </span>
            </p>
          )}
        </div>
      )}

      <div className={styles.lanes}>
        <section className={styles.lane} aria-labelledby="promise-lane-title">
          <div className={styles.laneHeader}>
            <div>
              <span className={`${styles.laneIcon} ${styles.promiseIcon}`}>
                <CalendarClock size={14} aria-hidden="true" />
              </span>
              <div>
                <h3 id="promise-lane-title">Promises to pay</h3>
                <p>A dated customer commitment against this balance.</p>
              </div>
            </div>
            <button
              className={styles.addButton}
              type="button"
              disabled={Boolean(livePromise)}
              aria-expanded={openComposer === 'promise'}
              onClick={() => toggleComposer('promise')}
            >
              {openComposer === 'promise' ? (
                <X size={12} />
              ) : (
                <Plus size={12} />
              )}
              {openComposer === 'promise' ? 'Close' : 'Add promise'}
            </button>
          </div>

          {livePromise && (
            <p className={styles.guardrail}>
              A live promise already controls the next step. Cancel it before
              replacing the commitment.
            </p>
          )}

          {openComposer === 'promise' && !livePromise && (
            <form className={styles.inlineForm} onSubmit={submitPromise}>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Promised amount</span>
                  <input
                    inputMode="decimal"
                    value={promiseAmount}
                    placeholder="e.g. 40000000"
                    required
                    onChange={(event) => setPromiseAmount(event.target.value)}
                  />
                  <small>Outstanding {formatRupiah(outstandingAmount)}</small>
                </label>
                <label className={styles.field}>
                  <span>Promise date</span>
                  <input
                    type="date"
                    min={workflowBusinessDate}
                    value={promiseDate}
                    required
                    onChange={(event) => setPromiseDate(event.target.value)}
                  />
                  <small>Today or later</small>
                </label>
              </div>
              <SubmitButton
                busy={submittingKey === 'create-promise'}
                label="Secure promise"
              />
            </form>
          )}

          <CaseHistoryEmpty
            visible={promises.length === 0}
            title="No promise recorded"
            description="Add one only after the customer commits to an amount and date."
          />
          {promises.length > 0 && (
            <ol className={styles.history}>
              {promises.map((promise) => (
                <li className={styles.historyItem} key={promise.id}>
                  <div className={styles.historyTopline}>
                    <div>
                      <strong>{formatRupiah(promise.amount)}</strong>
                      <span>for {formatBusinessDate(promise.promiseDate)}</span>
                    </div>
                    <StatusBadge status={promise.status} />
                  </div>
                  <p className={styles.evidenceMeta}>
                    Recorded by {promise.createdBy.name} ·{' '}
                    {formatTimestamp(promise.createdAt, timeZone)}
                  </p>
                  {promise.cancelReason && (
                    <p className={styles.evidenceNote}>
                      {promise.cancelReason}
                    </p>
                  )}
                  {!['FULFILLED', 'CANCELLED'].includes(promise.status) && (
                    <InlineTransition
                      open={cancellingPromiseId === promise.id}
                      label="Cancel promise"
                      onToggle={() => {
                        setCancellingPromiseId((current) =>
                          current === promise.id ? null : promise.id,
                        );
                        setError(null);
                      }}
                    >
                      <form
                        className={styles.transitionForm}
                        onSubmit={(event) =>
                          submitCancellation(event, promise.id)
                        }
                      >
                        <label className={styles.field}>
                          <span>Cancellation reason</span>
                          <textarea
                            rows={2}
                            maxLength={500}
                            required
                            value={cancelReason}
                            onChange={(event) =>
                              setCancelReason(event.target.value)
                            }
                          />
                        </label>
                        <SubmitButton
                          busy={submittingKey === `cancel-${promise.id}`}
                          label="Confirm cancellation"
                          quiet
                        />
                      </form>
                    </InlineTransition>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.lane} aria-labelledby="dispute-lane-title">
          <div className={styles.laneHeader}>
            <div>
              <span className={`${styles.laneIcon} ${styles.disputeIcon}`}>
                <AlertTriangle size={14} aria-hidden="true" />
              </span>
              <div>
                <h3 id="dispute-lane-title">Disputes</h3>
                <p>An exception that pauses normal queue action.</p>
              </div>
            </div>
            <button
              className={styles.addButton}
              type="button"
              aria-expanded={openComposer === 'dispute'}
              onClick={() => toggleComposer('dispute')}
            >
              {openComposer === 'dispute' ? (
                <X size={12} />
              ) : (
                <Plus size={12} />
              )}
              {openComposer === 'dispute' ? 'Close' : 'Open dispute'}
            </button>
          </div>

          {openComposer === 'dispute' && (
            <form className={styles.inlineForm} onSubmit={submitDispute}>
              <label className={styles.field}>
                <span>Category</span>
                <select
                  value={disputeCategory}
                  onChange={(event) =>
                    setDisputeCategory(event.target.value as DisputeCategory)
                  }
                >
                  {disputeCategories.map((category) => (
                    <option value={category} key={category}>
                      {humanizeEnum(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>What is disputed?</span>
                <textarea
                  rows={3}
                  maxLength={2_000}
                  required
                  value={disputeDetails}
                  placeholder="State the customer's claim and the evidence needed."
                  onChange={(event) => setDisputeDetails(event.target.value)}
                />
              </label>
              <SubmitButton
                busy={submittingKey === 'create-dispute'}
                label="Open dispute"
              />
            </form>
          )}

          <CaseHistoryEmpty
            visible={disputes.length === 0}
            title="No dispute recorded"
            description="This invoice is clear to follow through the normal collection flow."
          />
          {disputes.length > 0 && (
            <ol className={styles.history}>
              {disputes.map((dispute) => (
                <li className={styles.historyItem} key={dispute.id}>
                  <div className={styles.historyTopline}>
                    <div>
                      <strong>{humanizeEnum(dispute.category)}</strong>
                      <span>{dispute.details}</span>
                    </div>
                    <StatusBadge status={dispute.status} />
                  </div>
                  <p className={styles.evidenceMeta}>
                    Opened by {dispute.createdBy.name} ·{' '}
                    {formatTimestamp(dispute.createdAt, timeZone)}
                  </p>
                  {dispute.resolutionNote && (
                    <p className={styles.evidenceNote}>
                      Resolution · {dispute.resolutionNote}
                    </p>
                  )}
                  {dispute.status === 'OPEN' && (
                    <InlineTransition
                      open={resolvingDisputeId === dispute.id}
                      label="Resolve dispute"
                      onToggle={() => {
                        setResolvingDisputeId((current) =>
                          current === dispute.id ? null : dispute.id,
                        );
                        setError(null);
                      }}
                    >
                      <form
                        className={styles.transitionForm}
                        onSubmit={(event) =>
                          submitResolution(event, dispute.id)
                        }
                      >
                        <label className={styles.field}>
                          <span>Resolution note · optional</span>
                          <textarea
                            rows={2}
                            maxLength={1_000}
                            value={resolutionNote}
                            onChange={(event) =>
                              setResolutionNote(event.target.value)
                            }
                          />
                        </label>
                        <SubmitButton
                          busy={submittingKey === `resolve-${dispute.id}`}
                          label="Mark resolved"
                          quiet
                        />
                      </form>
                    </InlineTransition>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}

function StatusBadge({
  status,
}: {
  status: PromiseView['status'] | DisputeView['status'];
}) {
  const icon = status === 'FULFILLED' || status === 'RESOLVED';
  return (
    <span className={styles.status} data-status={status}>
      {icon && <CheckCircle2 size={10} aria-hidden="true" />}
      {humanizeEnum(status)}
    </span>
  );
}

function SubmitButton({
  busy,
  label,
  quiet = false,
}: {
  busy: boolean;
  label: string;
  quiet?: boolean;
}) {
  return (
    <button
      className={quiet ? styles.quietSubmit : styles.submit}
      type="submit"
      disabled={busy}
    >
      {busy ? (
        <LoaderCircle className={styles.spinner} size={12} aria-hidden="true" />
      ) : (
        <Check size={12} aria-hidden="true" />
      )}
      {busy ? 'Securing…' : label}
    </button>
  );
}

function InlineTransition({
  open,
  label,
  onToggle,
  children,
}: {
  open: boolean;
  label: string;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.transition}>
      <button type="button" aria-expanded={open} onClick={onToggle}>
        {open ? 'Close' : label}
      </button>
      {open && children}
    </div>
  );
}

function CaseHistoryEmpty({
  visible,
  title,
  description,
}: {
  visible: boolean;
  title: string;
  description: string;
}) {
  if (!visible) return null;
  return (
    <div className={styles.empty}>
      <span aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

function fieldMessage(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  const issue = error.issues[0];
  if (issue?.path[0] === 'amount') return issue.message;
  if (issue?.path[0] === 'promiseDate') return 'Choose a valid promise date.';
  if (issue?.path[0] === 'details')
    return 'Describe what the customer disputed.';
  if (issue?.path[0] === 'reason') return 'Add a cancellation reason.';
  return issue?.message ?? 'Check the case details and try again.';
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return 'The request timed out. Retry safely—Arus will not duplicate the action.';
  }
  if (error instanceof ApiContractError) {
    return 'Arus received an unexpected response. Refresh before trying again.';
  }
  if (error instanceof ApiClientError) {
    const fields = error.body?.error.fields;
    return (
      fields?.amount ??
      fields?.promiseDate ??
      fields?.details ??
      fields?.reason ??
      error.message
    );
  }
  return 'Unable to reach Arus. Your input is still here; try again.';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
