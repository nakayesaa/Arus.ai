'use client';

/**
 * The focused drawer preserves invoice context while exposing one WhatsApp thread.
 * Foreground polling refreshes provider state without introducing realtime infrastructure.
 * Human sends pause on an exact-text review before durable outbox submission.
 * Selecting image evidence expands a desktop review panel beside the conversation.
 * Focus, cancellation, and reduced-motion behavior keep the overlay predictable.
 */

import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock3,
  Image as ImageIcon,
  LoaderCircle,
  MessageCircle,
  Pause,
  RefreshCw,
  Send,
  Unplug,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ApiClientError } from '@/lib/api-client/errors';
import { formatRupiah, formatTimestamp } from '@/lib/formatters';
import {
  getWhatsAppThread,
  sendWhatsAppMessage,
  updateWhatsAppConnectionState,
} from '@/lib/whatsapp/client';
import type {
  WhatsAppConnection,
  WhatsAppMessage,
  WhatsAppThread,
  WhatsAppThreadResponse,
} from '@/lib/whatsapp/contracts';

import styles from './whatsapp-drawer.module.css';
import { WhatsAppEvidenceReview } from './whatsapp-evidence-review';

interface WhatsAppDrawerProps {
  debtorId: string;
  debtorName: string;
  invoiceId: string;
  invoiceNumber: string;
  outstandingAmount: string;
  timeZone: string;
  canManageConnection: boolean;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: WhatsAppThreadResponse }
  | { status: 'error'; message: string };

export function WhatsAppDrawer(props: WhatsAppDrawerProps) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [connectionPending, setConnectionPending] = useState(false);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const host = document.createElement('div');
    host.dataset.arusPortal = 'whatsapp-drawer';
    document.body.append(host);
    setPortalHost(host);

    return () => {
      host.remove();
    };
  }, []);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      timer = setTimeout(
        () => {
          load(true);
          poll();
        },
        document.visibilityState === 'visible' ? 3_000 : 15_000,
      );
    };
    poll();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [open]);

  function load(silent = false) {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!silent) setLoadState({ status: 'loading' });
    void getWhatsAppThread({
      debtorId: props.debtorId,
      invoiceId: props.invoiceId,
      signal: controller.signal,
    })
      .then((response) => {
        if (!controller.signal.aborted) {
          setLoadState({ status: 'ready', response });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setLoadState({
            status: 'error',
            message:
              error instanceof ApiClientError
                ? error.message
                : 'Conversation could not be loaded.',
          });
        }
      });
  }

  function launch() {
    setOpen(true);
    load();
  }

  function close() {
    requestRef.current?.abort();
    setOpen(false);
    setSelectedEvidenceId(null);
    triggerRef.current?.focus();
  }

  async function toggleConnection(connection: WhatsAppConnection) {
    if (connectionPending || !props.canManageConnection) return;
    setConnectionPending(true);
    try {
      const nextState = connection.state === 'LIVE' ? 'PAUSED' : 'LIVE';
      await updateWhatsAppConnectionState(nextState);
      load();
      router.refresh();
    } catch (error) {
      setLoadState({
        status: 'error',
        message:
          error instanceof ApiClientError
            ? error.message
            : 'Channel state could not be changed.',
      });
    } finally {
      setConnectionPending(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        className="control-button"
        type="button"
        onClick={launch}
        aria-haspopup="dialog"
      >
        <MessageCircle size={14} aria-hidden="true" />
        WhatsApp
      </button>
      {portalHost &&
        open &&
        createPortal(
          <aside
            className={`${styles.drawer} ${selectedEvidenceId ? styles.drawerReviewing : ''}`}
            role="dialog"
            aria-modal="false"
            aria-labelledby="whatsapp-drawer-title"
          >
            <div className={styles.device}>
              <div className={styles.screen}>
                <span className={styles.channelCue} aria-hidden="true" />
                <header className={styles.header}>
                  <div className={styles.identity}>
                    <span className={styles.whatsappMark} aria-hidden="true">
                      <MessageCircle size={15} />
                    </span>
                    <div>
                      <h2 id="whatsapp-drawer-title">{props.debtorName}</h2>
                      <p>
                        {props.invoiceNumber} ·{' '}
                        {formatRupiah(props.outstandingAmount)}
                      </p>
                    </div>
                  </div>
                  <button
                    ref={closeRef}
                    className={styles.iconButton}
                    type="button"
                    onClick={close}
                    aria-label="Close WhatsApp conversation"
                  >
                    <X size={16} />
                  </button>
                </header>

                <DrawerContent
                  loadState={loadState}
                  timeZone={props.timeZone}
                  canManageConnection={props.canManageConnection}
                  connectionPending={connectionPending}
                  onRetry={load}
                  onToggleConnection={toggleConnection}
                  invoiceId={props.invoiceId}
                  onEvidenceSelect={setSelectedEvidenceId}
                  onSent={() => load(true)}
                />
              </div>
            </div>
            {selectedEvidenceId && (
              <WhatsAppEvidenceReview
                evidenceId={selectedEvidenceId}
                invoiceId={props.invoiceId}
                invoiceNumber={props.invoiceNumber}
                outstandingAmount={props.outstandingAmount}
                timeZone={props.timeZone}
                onClose={() => setSelectedEvidenceId(null)}
                onCompleted={() => {
                  load(true);
                  router.refresh();
                }}
              />
            )}
          </aside>,
          portalHost,
        )}
    </>
  );
}

function DrawerContent({
  loadState,
  timeZone,
  canManageConnection,
  connectionPending,
  onRetry,
  onToggleConnection,
  invoiceId,
  onEvidenceSelect,
  onSent,
}: {
  loadState: LoadState;
  timeZone: string;
  canManageConnection: boolean;
  connectionPending: boolean;
  onRetry: () => void;
  onToggleConnection: (connection: WhatsAppConnection) => void;
  invoiceId: string;
  onEvidenceSelect: (evidenceId: string) => void;
  onSent: () => void;
}) {
  if (loadState.status === 'idle' || loadState.status === 'loading') {
    return <ConversationSkeleton />;
  }
  if (loadState.status === 'error') {
    return (
      <div className={styles.statePanel} role="alert">
        <AlertCircle size={19} aria-hidden="true" />
        <strong>Conversation unavailable</strong>
        <p>{loadState.message}</p>
        <button className="control-button" type="button" onClick={onRetry}>
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }
  const { connection, thread } = loadState.response.data;
  if (!connection) {
    return (
      <div className={styles.statePanel}>
        <Unplug size={19} aria-hidden="true" />
        <strong>WhatsApp is not connected</strong>
        <p>
          An organization owner must configure the approved business sender
          before provider messages can appear here.
        </p>
      </div>
    );
  }
  return (
    <>
      <ConnectionBar
        connection={connection}
        canManage={canManageConnection}
        pending={connectionPending}
        onToggle={onToggleConnection}
      />
      {thread ? (
        <>
          {thread.matchState !== 'MATCHED' && (
            <div className={styles.matchWarning} role="status">
              <AlertCircle size={14} aria-hidden="true" />
              <span>
                {thread.matchState === 'AMBIGUOUS'
                  ? 'This number matches multiple customers.'
                  : 'This sender is not matched to a customer.'}
              </span>
            </div>
          )}
          <ol className={styles.messages} aria-label="WhatsApp conversation">
            {thread.messages.map((message) => (
              <MessageRow
                key={message.id}
                message={message}
                timeZone={timeZone}
                onEvidenceSelect={onEvidenceSelect}
              />
            ))}
          </ol>
        </>
      ) : (
        <div className={styles.emptyConversation}>
          <MessageCircle size={18} aria-hidden="true" />
          <strong>No WhatsApp history yet</strong>
          <p>
            Incoming text and image evidence from this customer will appear here
            after the provider connection is live.
          </p>
        </div>
      )}
      <MessageComposer
        connection={connection}
        thread={thread}
        invoiceId={invoiceId}
        onSent={onSent}
      />
    </>
  );
}

function MessageComposer({
  connection,
  thread,
  invoiceId,
  onSent,
}: {
  connection: WhatsAppConnection;
  thread: WhatsAppThread | null;
  invoiceId: string;
  onSent: () => void;
}) {
  const [body, setBody] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSend = connection.state === 'LIVE' && Boolean(thread?.debtor);

  async function send() {
    if (!thread?.debtor || pending) return;
    setPending(true);
    setError(null);
    try {
      await sendWhatsAppMessage({
        debtorId: thread.debtor.id,
        invoiceId,
        body: body.trim(),
      });
      setBody('');
      setReviewing(false);
      onSent();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Message could not be queued. Try again.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <footer className={styles.composer}>
      {reviewing ? (
        <div
          className={styles.sendReview}
          role="group"
          aria-label="Review WhatsApp message"
        >
          <span>Review exact customer-visible text</span>
          <p>{body.trim()}</p>
          <small>
            To {thread?.customerNumber ?? 'unmatched number'} · From{' '}
            {connection.displayPhoneNumber ?? 'approved sender'}
          </small>
          <div>
            <button type="button" onClick={() => setReviewing(false)}>
              Keep editing
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void send()}
            >
              {pending ? (
                <LoaderCircle className={styles.spin} size={14} />
              ) : (
                <Send size={14} />
              )}
              Approve and send
            </button>
          </div>
        </div>
      ) : (
        <>
          <label htmlFor="whatsapp-message">Message</label>
          <div>
            <textarea
              id="whatsapp-message"
              rows={2}
              maxLength={4_096}
              value={body}
              disabled={!canSend}
              placeholder={
                connection.state !== 'LIVE'
                  ? 'Activate the sender before messaging'
                  : 'Write the exact message the customer will receive'
              }
              onChange={(event) => setBody(event.target.value)}
            />
            <button
              type="button"
              disabled={!canSend || !body.trim()}
              onClick={() => setReviewing(true)}
              aria-label="Review WhatsApp message before sending"
            >
              <Send size={15} />
            </button>
          </div>
          <p>Every send requires review · Replies refresh automatically.</p>
        </>
      )}
      {error && (
        <p className={styles.composerError} role="alert">
          {error}
        </p>
      )}
    </footer>
  );
}

function ConnectionBar({
  connection,
  canManage,
  pending,
  onToggle,
}: {
  connection: WhatsAppConnection;
  canManage: boolean;
  pending: boolean;
  onToggle: (connection: WhatsAppConnection) => void;
}) {
  const state = connection.state;
  const actionLabel = state === 'LIVE' ? 'Pause' : 'Activate';
  return (
    <div className={styles.connectionBar}>
      <span className={styles.connectionIdentity}>
        <span>
          <strong>
            {connection.displayPhoneNumber ?? 'Sender not assigned'}
          </strong>
          {state !== 'LIVE' && <small>{stateLabel(state)}</small>}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onToggle(connection)}
        disabled={
          !canManage || pending || (state !== 'LIVE' && state !== 'PAUSED')
        }
        aria-label={`${actionLabel} WhatsApp sender`}
        title={
          canManage
            ? `${actionLabel} this sender`
            : 'Only organization owners can change channel state'
        }
      >
        {pending ? (
          <LoaderCircle className={styles.spin} size={12} />
        ) : state === 'LIVE' ? (
          <Pause size={11} />
        ) : (
          <Check size={11} />
        )}
      </button>
    </div>
  );
}

function MessageRow({
  message,
  timeZone,
  onEvidenceSelect,
}: {
  message: WhatsAppMessage;
  timeZone: string;
  onEvidenceSelect: (evidenceId: string) => void;
}) {
  const outbound = message.direction === 'OUTBOUND';
  return (
    <li className={outbound ? styles.outbound : styles.inbound}>
      <div className={styles.bubble}>
        {message.type === 'IMAGE' && (
          <EvidenceCard message={message} onSelect={onEvidenceSelect} />
        )}
        {message.body && <p>{message.body}</p>}
        <footer>
          <time dateTime={message.occurredAt}>
            {formatTimestamp(message.occurredAt, timeZone)}
          </time>
          {outbound && <DeliveryState state={message.state} />}
        </footer>
      </div>
    </li>
  );
}

function EvidenceCard({
  message,
  onSelect,
}: {
  message: WhatsAppMessage;
  onSelect: (evidenceId: string) => void;
}) {
  const evidence = message.media?.evidence;
  const state = evidence?.state ?? 'PROCESSING';
  return (
    <button
      type="button"
      className={`${styles.evidence} ${
        state === 'AWAITING_REVIEW' ? styles.evidenceAwaiting : ''
      }`}
      disabled={!evidence || state !== 'AWAITING_REVIEW'}
      onClick={() => evidence && onSelect(evidence.id)}
    >
      <span aria-hidden="true">
        {message.media?.processingState === 'FAILED' ? (
          <AlertCircle size={18} />
        ) : message.media?.processingState === 'READY' ? (
          <ImageIcon size={18} />
        ) : (
          <LoaderCircle className={styles.spin} size={18} />
        )}
      </span>
      <div>
        <strong>{evidenceLabel(state)}</strong>
        <small>
          {message.media?.processingState === 'READY'
            ? 'Private image evidence'
            : 'Validating private media'}
        </small>
      </div>
    </button>
  );
}

function DeliveryState({ state }: { state: WhatsAppMessage['state'] }) {
  if (state === 'READ') {
    return <CheckCheck size={12} aria-label="Read" />;
  }
  if (state === 'DELIVERED') {
    return <CheckCheck size={12} aria-label="Delivered" />;
  }
  if (state === 'SENT') return <Check size={12} aria-label="Sent" />;
  if (state === 'FAILED') {
    return <AlertCircle size={12} aria-label="Failed" />;
  }
  return <Clock3 size={11} aria-label={stateLabel(state)} />;
}

function ConversationSkeleton() {
  return (
    <div className={styles.skeleton} role="status" aria-label="Loading chat">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function stateLabel(value: string): string {
  return value.charAt(0) + value.slice(1).toLocaleLowerCase('en-US');
}

function evidenceLabel(
  state:
    'PROCESSING' | 'AWAITING_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'UNAVAILABLE',
): string {
  switch (state) {
    case 'AWAITING_REVIEW':
      return 'Evidence received · awaiting review';
    case 'ACCEPTED':
      return 'Evidence accepted';
    case 'REJECTED':
      return 'Evidence rejected';
    case 'UNAVAILABLE':
      return 'Evidence unavailable';
    case 'PROCESSING':
      return 'Evidence processing';
  }
}
