'use client';

import { Check, LoaderCircle, MessageCircle, Phone, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  ApiClientError,
  ApiContractError,
  ApiTimeoutError,
} from '@/lib/api-client/errors';
import { recordCommunication } from '@/lib/communications/client';
import {
  communicationChannels,
  recordCommunicationInputSchema,
  type CommunicationChannel,
} from '@/lib/communications/contracts';
import { formatBusinessDate, humanizeEnum } from '@/lib/formatters';

import styles from './communication-composer.module.css';

interface CommunicationComposerProps {
  invoiceId: string;
  workflowBusinessDate: string;
  suggestedDate: string | null;
}

interface PendingCommand {
  fingerprint: string;
  operationKey: string;
}

export function CommunicationComposer({
  invoiceId,
  workflowBusinessDate,
  suggestedDate,
}: CommunicationComposerProps) {
  const router = useRouter();
  const [channel, setChannel] = useState<CommunicationChannel>('CALL');
  const [notes, setNotes] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState(suggestedDate ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingCommand = useRef<PendingCommand | null>(null);
  const requestAbort = useRef<AbortController | null>(null);

  useEffect(() => () => requestAbort.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const parsed = recordCommunicationInputSchema.safeParse({
      channel,
      notes,
      nextFollowUpDate: nextFollowUpDate || null,
    });
    if (!parsed.success) {
      setError(fieldMessage(parsed.error));
      return;
    }

    const fingerprint = JSON.stringify(parsed.data);
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
    setNotice(null);

    try {
      const result = await recordCommunication(
        invoiceId,
        pendingCommand.current.operationKey,
        parsed.data,
        controller.signal,
      );
      if (controller.signal.aborted) return;

      pendingCommand.current = null;
      setNotes('');
      setNotice(
        result.replayed
          ? 'Contact already secured. Queue is up to date.'
          : 'Contact secured. Queue priority refreshed.',
      );
      router.refresh();
    } catch (requestError) {
      if (!isAbortError(requestError)) setError(errorMessage(requestError));
    } finally {
      if (requestAbort.current === controller) {
        requestAbort.current = null;
        setSubmitting(false);
      }
    }
  }

  return (
    <section
      className={`record-panel ${styles.composer}`}
      id="log-communication"
      aria-labelledby="communication-composer-title"
    >
      <header className={styles.header}>
        <span className={styles.headerIcon} aria-hidden="true">
          <MessageCircle size={15} />
        </span>
        <div>
          <h2 id="communication-composer-title">Log external contact</h2>
          <p>Contact happens outside Arus. Record the outcome as evidence.</p>
        </div>
      </header>

      <form className={styles.form} onSubmit={submit} aria-busy={submitting}>
        <fieldset className={styles.channelFieldset}>
          <legend>Channel</legend>
          <div className={styles.channels}>
            {communicationChannels.map((value) => (
              <button
                className={styles.channel}
                data-selected={channel === value || undefined}
                type="button"
                aria-pressed={channel === value}
                key={value}
                onClick={() => {
                  setChannel(value);
                  setNotice(null);
                }}
              >
                {value === 'CALL' ? (
                  <Phone size={12} aria-hidden="true" />
                ) : (
                  <MessageCircle size={12} aria-hidden="true" />
                )}
                {channelLabel(value)}
              </button>
            ))}
          </div>
        </fieldset>

        <label className={styles.field}>
          <span>Outcome notes</span>
          <textarea
            value={notes}
            required
            maxLength={2_000}
            rows={4}
            placeholder="What did the customer confirm?"
            onChange={(event) => {
              setNotes(event.target.value);
              setNotice(null);
            }}
          />
          <small>{notes.length.toLocaleString('id-ID')} / 2.000</small>
        </label>

        <label className={styles.field}>
          <span>Next follow-up</span>
          <input
            type="date"
            min={workflowBusinessDate}
            value={nextFollowUpDate}
            onChange={(event) => {
              setNextFollowUpDate(event.target.value);
              setNotice(null);
            }}
          />
          <small>
            {suggestedDate
              ? `Suggested ${formatBusinessDate(suggestedDate)} · editable`
              : 'Optional for this activity'}
          </small>
        </label>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className={styles.success} role="status" aria-live="polite">
            <span aria-hidden="true">
              <Check size={13} />
            </span>
            {notice}
          </p>
        )}

        <button
          className={`primary-button ${styles.submit}`}
          type="submit"
          disabled={submitting || notes.trim().length === 0}
        >
          {submitting ? (
            <LoaderCircle
              className={styles.spinner}
              size={14}
              aria-hidden="true"
            />
          ) : (
            <Send size={14} aria-hidden="true" />
          )}
          {submitting ? 'Securing evidence…' : 'Record contact'}
        </button>
      </form>
    </section>
  );
}

function channelLabel(channel: CommunicationChannel): string {
  return channel === 'WHATSAPP' ? 'WhatsApp' : humanizeEnum(channel);
}

function fieldMessage(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  const issue = error.issues[0];
  if (issue?.path[0] === 'notes') return issue.message;
  if (issue?.path[0] === 'nextFollowUpDate') {
    return 'Choose a valid next follow-up date.';
  }
  return 'Check the activity details and try again.';
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiTimeoutError) {
    return 'The request timed out. Retry safely—Arus will not duplicate the activity.';
  }
  if (error instanceof ApiContractError) {
    return 'Arus received an unexpected response. Refresh before trying again.';
  }
  if (error instanceof ApiClientError) {
    return (
      error.body?.error.fields?.nextFollowUpDate ??
      error.body?.error.fields?.notes ??
      error.message
    );
  }
  return 'Unable to reach Arus. Your notes are still here; try again.';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
