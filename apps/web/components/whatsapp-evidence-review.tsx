'use client';

/**
 * Adaptive Review gives payment evidence enough desktop space for a safe decision.
 * It loads a short-lived private preview only after the authenticated panel opens.
 * Operators must enter exact payment facts before the existing money path executes.
 * Rejection requires a reason and never changes the invoice outstanding balance.
 * Success copy states the concrete financial result and returns control to the thread.
 */

import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  LoaderCircle,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ApiClientError } from '@/lib/api-client/errors';
import { formatRupiah, formatTimestamp } from '@/lib/formatters';
import {
  confirmEvidencePayment,
  createEvidenceView,
  getPaymentEvidence,
  rejectPaymentEvidence,
} from '@/lib/whatsapp/client';
import type { PaymentEvidence } from '@/lib/whatsapp/contracts';

import styles from './whatsapp-drawer.module.css';

interface EvidenceReviewProps {
  evidenceId: string;
  invoiceId: string;
  invoiceNumber: string;
  outstandingAmount: string;
  timeZone: string;
  onClose: () => void;
  onCompleted: () => void;
}

type ReviewLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; evidence: PaymentEvidence; previewUrl: string };

export function WhatsAppEvidenceReview(props: EvidenceReviewProps) {
  const [load, setLoad] = useState<ReviewLoad>({ status: 'loading' });
  const [paymentDate, setPaymentDate] = useState(today());
  const [amount, setAmount] = useState('');
  const [payerReference, setPayerReference] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [mode, setMode] = useState<'payment' | 'reject'>('payment');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ status: 'loading' });
    void Promise.all([
      getPaymentEvidence(props.evidenceId, controller.signal),
      createEvidenceView(props.evidenceId),
    ])
      .then(([evidence, view]) => {
        if (!controller.signal.aborted) {
          setLoad({
            status: 'ready',
            evidence: evidence.data,
            previewUrl: view.data.url,
          });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoad({ status: 'error', message: errorMessage(error) });
        }
      });
    return () => controller.abort();
  }, [props.evidenceId]);

  const normalizedAmount = useMemo(() => normalizeMoney(amount), [amount]);

  async function confirmPayment() {
    if (!normalizedAmount || !payerReference.trim()) {
      setFeedback(
        'Enter a valid amount and payer reference before recording payment.',
      );
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const result = await confirmEvidencePayment({
        evidenceId: props.evidenceId,
        invoiceId: props.invoiceId,
        payment: {
          paymentDate,
          amount: normalizedAmount,
          payerReference: payerReference.trim(),
          bankReference: bankReference.trim() || null,
        },
      });
      setFeedback(
        `Payment recorded. Outstanding is now ${formatRupiah(result.invoice.outstandingAmount)}.`,
      );
      props.onCompleted();
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function rejectEvidence() {
    if (!rejectionReason.trim()) {
      setFeedback(
        'Explain why this evidence cannot support a payment decision.',
      );
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      await rejectPaymentEvidence({
        evidenceId: props.evidenceId,
        reason: rejectionReason.trim(),
      });
      setFeedback('Evidence rejected. Invoice outstanding was not changed.');
      props.onCompleted();
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className={styles.reviewPanel}
      aria-labelledby="evidence-review-title"
    >
      <header className={styles.reviewHeader}>
        <div>
          <span>Payment evidence</span>
          <h2 id="evidence-review-title">Review before changing money</h2>
        </div>
        <button
          type="button"
          onClick={props.onClose}
          aria-label="Close evidence review"
        >
          <X size={17} />
        </button>
      </header>

      {load.status === 'loading' ? (
        <div className={styles.reviewState} role="status">
          <LoaderCircle className={styles.spin} size={20} />
          <strong>Opening private evidence…</strong>
        </div>
      ) : load.status === 'error' ? (
        <div className={styles.reviewState} role="alert">
          <AlertCircle size={20} />
          <strong>Evidence could not be opened</strong>
          <p>{load.message}</p>
        </div>
      ) : (
        <div className={styles.reviewBody}>
          <figure className={styles.evidencePreview}>
            {/* The API authorizes this temporary private URL; it is never persisted client-side. */}
            <img
              src={load.previewUrl}
              alt="Customer-submitted payment evidence"
            />
            <figcaption>
              <ImageIcon size={14} />
              {load.evidence.media.mime ?? 'Image'} ·{' '}
              {load.evidence.media.byteSize
                ? `${Math.ceil(load.evidence.media.byteSize / 1024)} KB`
                : 'size unavailable'}
            </figcaption>
          </figure>

          <dl className={styles.reviewContext}>
            <div>
              <dt>Customer</dt>
              <dd>{load.evidence.debtor?.name ?? 'Needs matching'}</dd>
            </div>
            <div>
              <dt>Invoice</dt>
              <dd>{props.invoiceNumber}</dd>
            </div>
            <div>
              <dt>Outstanding</dt>
              <dd>{formatRupiah(props.outstandingAmount)}</dd>
            </div>
            <div>
              <dt>Received</dt>
              <dd>
                {formatTimestamp(
                  load.evidence.source.occurredAt,
                  props.timeZone,
                )}
              </dd>
            </div>
          </dl>

          <div
            className={styles.reviewTabs}
            role="tablist"
            aria-label="Evidence decision"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'payment'}
              onClick={() => setMode('payment')}
            >
              Record payment
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'reject'}
              onClick={() => setMode('reject')}
            >
              Reject evidence
            </button>
          </div>

          {mode === 'payment' ? (
            <div className={styles.paymentForm}>
              <label>
                Payment date
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(event) => setPaymentDate(event.target.value)}
                />
              </label>
              <label>
                Amount received
                <input
                  inputMode="decimal"
                  placeholder="e.g. 5000000"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                Payer reference
                <input
                  maxLength={100}
                  placeholder="Name or transfer reference"
                  value={payerReference}
                  onChange={(event) => setPayerReference(event.target.value)}
                />
              </label>
              <label>
                Bank reference <span>Optional</span>
                <input
                  maxLength={100}
                  placeholder="Bank transaction ID"
                  value={bankReference}
                  onChange={(event) => setBankReference(event.target.value)}
                />
              </label>
              <div className={styles.financialEffect}>
                <span>Expected outstanding after confirmation</span>
                <strong>
                  {normalizedAmount
                    ? approximateOutstanding(
                        props.outstandingAmount,
                        normalizedAmount,
                      )
                    : formatRupiah(props.outstandingAmount)}
                </strong>
                <p>
                  The API recalculates this under an invoice lock before
                  committing.
                </p>
              </div>
              <button
                className={styles.confirmPayment}
                type="button"
                disabled={pending}
                onClick={() => void confirmPayment()}
              >
                {pending ? (
                  <LoaderCircle className={styles.spin} size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                Confirm and record payment
              </button>
            </div>
          ) : (
            <div className={styles.rejectForm}>
              <label>
                Reason for rejection
                <textarea
                  rows={4}
                  maxLength={500}
                  placeholder="What prevents this image from supporting a payment record?"
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value)}
                />
              </label>
              <p>
                Rejecting preserves the evidence and audit history. It does not
                change outstanding.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => void rejectEvidence()}
              >
                Reject evidence
              </button>
            </div>
          )}
          {feedback && (
            <p className={styles.reviewFeedback} role="status">
              {feedback}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function normalizeMoney(value: string): string | null {
  const compact = value.replaceAll(/[^\d.,]/gu, '').replace(',', '.');
  if (!/^\d+(?:\.\d{0,2})?$/u.test(compact)) return null;
  const [whole, fraction = ''] = compact.split('.');
  return `${BigInt(whole || '0')}.${fraction.padEnd(2, '0')}`;
}

function approximateOutstanding(outstanding: string, payment: string): string {
  const toCents = (value: string) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole || '0') * 100n + BigInt(fraction.padEnd(2, '0'));
  };
  const result = toCents(outstanding) - toCents(payment);
  if (result < 0n) return 'Payment exceeds outstanding';
  return formatRupiah(
    `${result / 100n}.${String(result % 100n).padStart(2, '0')}`,
  );
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.message
    : 'The request could not be completed. Check the connection and try again.';
}
