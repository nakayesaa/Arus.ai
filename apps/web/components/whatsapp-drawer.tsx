'use client';

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
  updateWhatsAppConnectionState,
} from '@/lib/whatsapp/client';
import type {
  WhatsAppConnection,
  WhatsAppMessage,
  WhatsAppThreadResponse,
} from '@/lib/whatsapp/contracts';

import styles from './whatsapp-drawer.module.css';

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
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>({ status: 'idle' });
  const [connectionPending, setConnectionPending] = useState(false);

  useEffect(() => setMounted(true), []);
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

  function load() {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoadState({ status: 'loading' });
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
      {mounted &&
        open &&
        createPortal(
          <aside
            className={styles.drawer}
            role="dialog"
            aria-modal="false"
            aria-labelledby="whatsapp-drawer-title"
          >
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
            />
          </aside>,
          document.body,
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
}: {
  loadState: LoadState;
  timeZone: string;
  canManageConnection: boolean;
  connectionPending: boolean;
  onRetry: () => void;
  onToggleConnection: (connection: WhatsAppConnection) => void;
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
      <footer className={styles.composer}>
        <label htmlFor="whatsapp-day11-message">Message</label>
        <div>
          <textarea
            id="whatsapp-day11-message"
            rows={2}
            disabled
            placeholder="Human-approved sending arrives in Day 12"
          />
          <button type="button" disabled aria-label="Send WhatsApp message">
            <Send size={15} />
          </button>
        </div>
        <p>Inbound is live. Outbound remains locked until review-and-send.</p>
      </footer>
    </>
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
  return (
    <div className={styles.connectionBar}>
      <span className={styles.connectionIdentity}>
        <span
          className={`${styles.stateDot} ${styles[`state${state}`]}`}
          aria-hidden="true"
        />
        <span>
          <strong>{stateLabel(state)}</strong>
          <small>
            {connection.displayPhoneNumber ?? 'Sender not assigned'}
          </small>
        </span>
      </span>
      <button
        type="button"
        onClick={() => onToggle(connection)}
        disabled={
          !canManage || pending || (state !== 'LIVE' && state !== 'PAUSED')
        }
        title={
          canManage
            ? `${state === 'LIVE' ? 'Pause' : 'Activate'} this sender`
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
        {state === 'LIVE' ? 'Pause' : 'Activate'}
      </button>
    </div>
  );
}

function MessageRow({
  message,
  timeZone,
}: {
  message: WhatsAppMessage;
  timeZone: string;
}) {
  const outbound = message.direction === 'OUTBOUND';
  return (
    <li className={outbound ? styles.outbound : styles.inbound}>
      <div className={styles.bubble}>
        {message.type === 'IMAGE' && <EvidenceCard message={message} />}
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

function EvidenceCard({ message }: { message: WhatsAppMessage }) {
  const evidence = message.media?.evidence;
  const state = evidence?.state ?? 'PROCESSING';
  return (
    <div
      className={`${styles.evidence} ${
        state === 'AWAITING_REVIEW' ? styles.evidenceAwaiting : ''
      }`}
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
    </div>
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
