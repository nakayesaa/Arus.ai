'use client';

import {
  ArrowLeft,
  Check,
  CircleDollarSign,
  LoaderCircle,
  LockKeyhole,
  ReceiptText,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  ApiClientError,
  ApiContractError,
  ApiTimeoutError,
} from '@/lib/api-client/errors';
import { formatBusinessDate, formatRupiah } from '@/lib/formatters';
import { recordInvoicePayment } from '@/lib/payments/client';
import {
  recordPaymentInputSchema,
  type RecordPaymentInput,
  type RecordPaymentResponse,
} from '@/lib/payments/contracts';
import {
  canonicalPaymentInput,
  subtractPaymentAmount,
} from '@/lib/payments/input';

import styles from './payment-recorder.module.css';

interface PaymentRecorderProps {
  invoiceId: string;
  invoiceNumber: string;
  debtorName: string;
  workflowBusinessDate: string;
  outstandingAmount: string;
}

interface PaymentDraft {
  amount: string;
  paymentDate: string;
  payerReference: string;
  bankReference: string;
}

interface ReviewedPayment {
  input: RecordPaymentInput;
  remainingAmount: string;
}

interface PendingCommand {
  fingerprint: string;
  operationKey: string;
}

export function PaymentRecorder({
  invoiceId,
  invoiceNumber,
  debtorName,
  workflowBusinessDate,
  outstandingAmount,
}: PaymentRecorderProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<PaymentDraft>({
    amount: '',
    paymentDate: workflowBusinessDate,
    payerReference: '',
    bankReference: '',
  });
  const [review, setReview] = useState<ReviewedPayment | null>(null);
  const [result, setResult] = useState<RecordPaymentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingCommand = useRef<PendingCommand | null>(null);
  const requestAbort = useRef<AbortController | null>(null);

  useEffect(() => () => requestAbort.current?.abort(), []);

  function updateDraft(field: keyof PaymentDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError(null);
    setResult(null);
  }

  function prepareReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const amount = canonicalPaymentInput(draft.amount);
    if (!amount) {
      setError('Enter a valid amount, for example 5.000.000.');
      return;
    }
    if (amount === '0.00') {
      setError('Payment amount must be greater than zero.');
      return;
    }
    if (draft.paymentDate > workflowBusinessDate) {
      setError('Payment date cannot be after the organization business date.');
      return;
    }

    const parsed = recordPaymentInputSchema.safeParse({
      amount,
      paymentDate: draft.paymentDate,
      payerReference: draft.payerReference,
      bankReference: draft.bankReference.trim() || null,
    });
    if (!parsed.success) {
      setError(paymentFieldMessage(parsed.error));
      return;
    }

    const remainingAmount = subtractPaymentAmount(
      outstandingAmount,
      parsed.data.amount,
    );
    if (remainingAmount === null) {
      setError(
        `Payment cannot exceed the current outstanding balance of ${formatRupiah(outstandingAmount)}.`,
      );
      return;
    }

    setReview({ input: parsed.data, remainingAmount });
    setError(null);
  }

  async function confirmPayment() {
    if (!review || submitting) return;

    const fingerprint = JSON.stringify(review.input);
    if (pendingCommand.current?.fingerprint !== fingerprint) {
      pendingCommand.current = {
        fingerprint,
        operationKey: crypto.randomUUID(),
      };
    }

    requestAbort.current?.abort();
    const controller = new AbortController();
    requestAbort.current = controller;
    setSubmitting(true);
    setError(null);

    try {
      const response = await recordInvoicePayment(
        invoiceId,
        pendingCommand.current.operationKey,
        review.input,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      pendingCommand.current = null;
      setResult(response);
      setReview(null);
      router.refresh();
    } catch (requestError) {
      if (!isAbortError(requestError)) {
        setError(paymentErrorMessage(requestError));
        if (paymentStateMayBeStale(requestError)) router.refresh();
      }
    } finally {
      if (requestAbort.current === controller) {
        requestAbort.current = null;
        setSubmitting(false);
      }
    }
  }

  if (result) {
    return (
      <PaymentSuccess
        result={result}
        invoiceNumber={invoiceNumber}
        onRecordAnother={() => {
          setDraft({
            amount: '',
            paymentDate: workflowBusinessDate,
            payerReference: '',
            bankReference: '',
          });
          setResult(null);
        }}
      />
    );
  }

  if (outstandingAmount === '0.00') {
    return <SettledInvoice invoiceNumber={invoiceNumber} />;
  }

  return (
    <section
      className={`record-panel ${styles.recorder}`}
      id="record-payment"
      aria-labelledby="payment-recorder-title"
      aria-busy={submitting}
    >
      <header className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true">
          <CircleDollarSign size={15} />
        </span>
        <div>
          <span className={styles.eyebrow}>Controlled balance update</span>
          <h2 id="payment-recorder-title">Record verified payment</h2>
          <p>One payment, one invoice, one auditable allocation.</p>
        </div>
      </header>

      {review ? (
        <div className={styles.review}>
          <div className={styles.reviewHeading}>
            <span className={styles.reviewIcon} aria-hidden="true">
              <LockKeyhole size={14} />
            </span>
            <div>
              <h3>Confirm financial effect</h3>
              <p>
                Arus will update outstanding immediately after confirmation.
              </p>
            </div>
          </div>

          <dl className={styles.reviewGrid}>
            <ReviewItem label="Invoice" value={invoiceNumber} />
            <ReviewItem label="Debtor" value={debtorName} />
            <ReviewItem
              label="Current outstanding"
              value={formatRupiah(outstandingAmount)}
            />
            <ReviewItem
              label="Payment"
              value={formatRupiah(review.input.amount)}
              emphasis
            />
            <ReviewItem
              label="Remaining"
              value={formatRupiah(review.remainingAmount)}
              emphasis
            />
            <ReviewItem
              label="Payment date"
              value={formatBusinessDate(review.input.paymentDate)}
            />
            <ReviewItem
              label="Payer reference"
              value={review.input.payerReference}
              wide
            />
            {review.input.bankReference && (
              <ReviewItem
                label="Bank reference"
                value={review.input.bankReference}
                wide
              />
            )}
          </dl>

          <p className={styles.truthNote}>
            This confirms an operational allocation in Arus. Bank and accounting
            reconciliation remain separate controls.
          </p>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button
              className="control-button"
              type="button"
              disabled={submitting}
              onClick={() => {
                setReview(null);
                setError(null);
              }}
            >
              <ArrowLeft size={13} aria-hidden="true" />
              Edit
            </button>
            <button
              className={`primary-button ${styles.confirm}`}
              type="button"
              disabled={submitting}
              onClick={confirmPayment}
            >
              {submitting ? (
                <LoaderCircle
                  className={styles.spinner}
                  size={14}
                  aria-hidden="true"
                />
              ) : (
                <LockKeyhole size={14} aria-hidden="true" />
              )}
              {submitting ? 'Recording securely…' : 'Confirm and record'}
            </button>
          </div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={prepareReview}>
          <label className={styles.field}>
            <span>Payment amount</span>
            <span className={styles.moneyInput}>
              <span aria-hidden="true">Rp</span>
              <input
                name="amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                required
                maxLength={32}
                value={draft.amount}
                placeholder="5.000.000"
                aria-describedby="payment-amount-hint"
                onChange={(event) => updateDraft('amount', event.target.value)}
              />
            </span>
            <small id="payment-amount-hint">
              Outstanding {formatRupiah(outstandingAmount)}
            </small>
          </label>

          <label className={styles.field}>
            <span>Payment date</span>
            <input
              name="paymentDate"
              type="date"
              required
              max={workflowBusinessDate}
              value={draft.paymentDate}
              onChange={(event) =>
                updateDraft('paymentDate', event.target.value)
              }
            />
            <small>
              Organization date {formatBusinessDate(workflowBusinessDate)}
            </small>
          </label>

          <label className={styles.field}>
            <span>Payer reference</span>
            <input
              name="payerReference"
              type="text"
              required
              maxLength={100}
              autoComplete="off"
              value={draft.payerReference}
              placeholder="Transfer note or proof reference"
              onChange={(event) =>
                updateDraft('payerReference', event.target.value)
              }
            />
            <small>Required evidence supplied by the payer or operator.</small>
          </label>

          <label className={styles.field}>
            <span>
              Bank reference <small>Optional</small>
            </span>
            <input
              name="bankReference"
              type="text"
              maxLength={100}
              autoComplete="off"
              value={draft.bankReference}
              placeholder="Mutation or transfer ID"
              onChange={(event) =>
                updateDraft('bankReference', event.target.value)
              }
            />
          </label>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button
            className={`primary-button ${styles.submit}`}
            type="submit"
            disabled={submitting}
          >
            <ReceiptText size={14} aria-hidden="true" />
            Review payment
          </button>
        </form>
      )}
    </section>
  );
}

function ReviewItem({
  label,
  value,
  emphasis = false,
  wide = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  wide?: boolean;
}) {
  return (
    <div
      className={wide ? styles.reviewWide : undefined}
      data-emphasis={emphasis || undefined}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PaymentSuccess({
  result,
  invoiceNumber,
  onRecordAnother,
}: {
  result: RecordPaymentResponse;
  invoiceNumber: string;
  onRecordAnother: () => void;
}) {
  const isSettled = result.invoice.state === 'PAID';
  return (
    <section
      className={`record-panel ${styles.successPanel}`}
      id="record-payment"
      aria-labelledby="payment-success-title"
      role="status"
      aria-live="polite"
    >
      <span className={styles.successIcon} aria-hidden="true">
        <Check size={17} />
      </span>
      <div>
        <span className={styles.eyebrow}>
          {result.replayed ? 'Safely recovered' : 'Audit trail secured'}
        </span>
        <h2 id="payment-success-title">
          {isSettled ? 'Invoice settled' : 'Outstanding updated'}
        </h2>
        <p>
          {formatRupiah(result.data.amount)} allocated to {invoiceNumber}.
          Remaining {formatRupiah(result.invoice.outstandingAmount)}.
        </p>
        {result.fulfilledPromiseIds.length > 0 && (
          <p className={styles.fulfilled}>
            {result.fulfilledPromiseIds.length}{' '}
            {result.fulfilledPromiseIds.length === 1 ? 'promise' : 'promises'}{' '}
            fulfilled by this payment.
          </p>
        )}
        <div className={styles.actions}>
          <Link className="primary-button" href={`/payments/${result.data.id}`}>
            View payment
          </Link>
          {!isSettled && (
            <button
              className="control-button"
              type="button"
              onClick={onRecordAnother}
            >
              Record another
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function SettledInvoice({ invoiceNumber }: { invoiceNumber: string }) {
  return (
    <section
      className={`record-panel ${styles.settledPanel}`}
      id="record-payment"
      aria-labelledby="invoice-settled-title"
    >
      <span className={styles.successIcon} aria-hidden="true">
        <Check size={17} />
      </span>
      <div>
        <span className={styles.eyebrow}>No collection action required</span>
        <h2 id="invoice-settled-title">Invoice settled</h2>
        <p>{invoiceNumber} has no remaining operational outstanding.</p>
        <Link className="control-button" href="/payments">
          View payment ledger
        </Link>
      </div>
    </section>
  );
}

function paymentFieldMessage(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  const issue = error.issues[0];
  switch (issue?.path[0]) {
    case 'amount':
      return 'Enter a valid payment amount.';
    case 'paymentDate':
      return 'Choose a valid payment date.';
    case 'payerReference':
      return 'Add a payer or proof reference (maximum 100 characters).';
    case 'bankReference':
      return 'Bank reference must be 100 characters or fewer.';
    default:
      return 'Check the payment details and try again.';
  }
}

function paymentErrorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return 'Confirmation timed out. Retry safely—Arus will not duplicate the payment.';
  }
  if (error instanceof ApiContractError) {
    return 'Arus received an unexpected response. Refresh before trying again.';
  }
  if (error instanceof ApiClientError) {
    return (
      error.body?.error.fields?.amount ??
      error.body?.error.fields?.paymentDate ??
      error.body?.error.fields?.payerReference ??
      error.body?.error.fields?.bankReference ??
      error.message
    );
  }
  return 'Unable to reach Arus. Your payment details are still here; try again.';
}

function paymentStateMayBeStale(error: unknown): boolean {
  if (!(error instanceof ApiClientError)) return false;
  return (
    error.body?.error.code === 'PAYMENT_EXCEEDS_OUTSTANDING' ||
    error.body?.error.code === 'INVOICE_ALREADY_PAID'
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
