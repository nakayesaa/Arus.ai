'use client';

import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bot,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  Link2,
  Mail,
  MessageCircleMore,
  Minus,
  Paperclip,
  Send,
  Sparkles,
  Star,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { ComponentType, FormEvent, ReactNode } from 'react';

export function InvoiceCaseWorkspace() {
  const [starred, setStarred] = useState(true);
  const [copilotOpen, setCopilotOpen] = useState(true);
  const [copilotCollapsed, setCopilotCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [copilotNotice, setCopilotNotice] = useState<string | null>(null);

  async function copyInvoiceId() {
    await navigator.clipboard.writeText('INV-2026-0418');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function submitCopilotRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = prompt.trim();

    if (!request) return;

    setCopilotNotice(`Request queued for review: “${request}”`);
    setPrompt('');
  }

  return (
    <section className="invoice-case-workspace" aria-labelledby="case-title">
      <header className="case-topbar">
        <div className="case-breadcrumbs">
          <Link href="/invoices">Customer Portfolios</Link>
          <ChevronRight size={13} aria-hidden="true" />
          <span>PT Sinar Abadi Retail</span>
          <button
            className={`case-icon-button ${starred ? 'starred' : ''}`}
            type="button"
            onClick={() => setStarred((current) => !current)}
            aria-pressed={starred}
            aria-label={
              starred ? 'Remove case from favorites' : 'Add case to favorites'
            }
          >
            <Star size={14} fill={starred ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div
          className="case-position"
          aria-label="Case position in current view"
        >
          <span>12 / 42</span>
          <Link href="/invoices" aria-label="Previous invoice case">
            <ArrowLeft size={14} />
          </Link>
          <Link href="/invoices" aria-label="Next invoice case">
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="case-reference-actions">
          <span>INV-2026-0418</span>
          <button
            className="case-icon-button"
            type="button"
            onClick={copyInvoiceId}
            aria-label="Copy invoice reference"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
          <Link href="/invoices/INV-2026-0418" aria-label="Copy case link">
            <Link2 size={14} />
          </Link>
        </div>
      </header>

      <div className="case-body">
        <article className="case-content">
          <header className="case-summary">
            <div className="case-overline">
              <span className="case-state-dot" aria-hidden="true" />
              <span>Active collection case</span>
              <span>·</span>
              <span>Last synced 8 minutes ago</span>
            </div>
            <h1 id="case-title">PT Sinar Abadi Retail</h1>
            <p>
              Invoice INV-2026-0418 is 47 days overdue. A payment promise for 15
              July was missed, and the next customer-facing reminder is waiting
              for approval.
            </p>
          </header>

          <section className="case-activity" aria-labelledby="activity-title">
            <h2 id="activity-title">Activity</h2>

            <div className="activity-event activity-event-system">
              <span className="activity-marker">
                <Bot size={14} aria-hidden="true" />
              </span>
              <div>
                <p>
                  <strong>Arus automation</strong> detected a broken promise and
                  raised the case priority.
                </p>
                <time dateTime="2026-07-16T09:02:00+07:00">Today · 09:02</time>
              </div>
            </div>

            <article className="activity-message">
              <header>
                <span className="avatar avatar-alex">MR</span>
                <div>
                  <strong>Maya Rahman</strong>
                  <span>Arus operator · Yesterday at 16:18</span>
                </div>
                <span className="activity-channel">
                  <MessageCircleMore size={13} aria-hidden="true" /> WhatsApp
                </span>
              </header>
              <p>
                Selamat sore Pak Andi, kami ingin mengingatkan bahwa pembayaran
                invoice INV-2026-0418 sebesar Rp 185.000.000 dijanjikan hari
                ini. Mohon konfirmasi setelah pembayaran diproses.
              </p>
              <footer>
                <span>Delivered 16:19</span>
                <span>Customer-visible</span>
              </footer>
            </article>

            <article className="activity-message activity-message-external">
              <header>
                <span className="avatar">AS</span>
                <div>
                  <strong>Andi Saputra</strong>
                  <span>PT Sinar Abadi Retail · Yesterday at 16:42</span>
                </div>
                <span className="activity-channel">
                  <MessageCircleMore size={13} aria-hidden="true" /> WhatsApp
                </span>
              </header>
              <p>
                Pembayaran sedang kami ajukan ke finance. Saya usahakan masuk
                paling lambat besok siang.
              </p>
            </article>

            <div className="activity-event">
              <span className="activity-marker activity-marker-promise">
                <CalendarClock size={14} aria-hidden="true" />
              </span>
              <div>
                <p>
                  <strong>Maya</strong> recorded a promise to pay for{' '}
                  <strong>Rp 185.000.000</strong>, due 15 July at 12:00.
                </p>
                <time dateTime="2026-07-15T16:44:00+07:00">
                  Yesterday · 16:44
                </time>
              </div>
            </div>

            <div className="activity-event">
              <span className="activity-marker activity-marker-critical">
                <AlertTriangle size={14} aria-hidden="true" />
              </span>
              <div>
                <p>
                  <strong>Promise moved from Active to Broken.</strong> No
                  matching payment was found after the grace period.
                </p>
                <time dateTime="2026-07-16T08:30:00+07:00">Today · 08:30</time>
              </div>
            </div>

            <div className="activity-event activity-event-latest">
              <span className="activity-marker activity-marker-attention">
                <BadgeCheck size={14} aria-hidden="true" />
              </span>
              <div>
                <p>
                  <strong>Reminder draft is ready for approval.</strong> Sending
                  is blocked until a human approves the customer-facing action.
                </p>
                <time dateTime="2026-07-16T09:04:00+07:00">Today · 09:04</time>
              </div>
            </div>
          </section>
        </article>

        <aside
          className="case-properties"
          aria-label="Invoice collection properties"
        >
          <header>
            <span>Invoice properties</span>
          </header>

          <dl className="property-list">
            <Property icon={Clock3} label="Collection status">
              <span className="property-signal tone-attention">
                <span aria-hidden="true" /> Needs follow-up
              </span>
            </Property>
            <Property icon={AlertTriangle} label="Risk">
              <span className="property-signal tone-critical">
                <span aria-hidden="true" /> High
              </span>
            </Property>
            <Property icon={UserRound} label="Owner">
              <span className="property-owner">
                <span className="avatar avatar-alex">MR</span> Maya Rahman
              </span>
            </Property>
            <Property icon={CalendarClock} label="Due">
              Today, 14:00
            </Property>
            <Property icon={Banknote} label="Outstanding">
              <strong>Rp 185.000.000</strong>
            </Property>
            <Property icon={ArrowDown} label="Aging bucket">
              <span className="tone-critical">47 days overdue</span>
            </Property>
            <Property icon={MessageCircleMore} label="Next action">
              Approve WhatsApp reminder
            </Property>
            <Property icon={CircleDollarSign} label="Payment state">
              Unpaid
            </Property>
          </dl>

          <section className="case-source">
            <span>Source</span>
            <strong>Jurnal import · AR July 2026</strong>
            <small>External accounting data remains source of truth.</small>
          </section>
        </aside>
      </div>

      {copilotOpen ? (
        <aside
          className={`collection-copilot ${copilotCollapsed ? 'collection-copilot-collapsed' : ''}`}
          aria-label="Arus Collection Copilot"
        >
          <header className="copilot-header">
            <span className="copilot-brand">
              <span className="copilot-mark" aria-hidden="true">
                <Sparkles size={14} />
              </span>
              <strong>Arus Collection Copilot</strong>
              <small>Case-aware</small>
            </span>
            <span className="copilot-window-actions">
              <button
                type="button"
                onClick={() => setCopilotCollapsed((current) => !current)}
                aria-label={
                  copilotCollapsed ? 'Expand copilot' : 'Minimize copilot'
                }
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                onClick={() => setCopilotOpen(false)}
                aria-label="Close copilot"
              >
                <X size={14} />
              </button>
            </span>
          </header>

          {!copilotCollapsed && (
            <>
              <div className="copilot-content">
                <p className="copilot-attribution">
                  <Bot size={13} aria-hidden="true" /> Investigated this case
                  using invoice, communication, promise, and payment history.
                </p>
                <h2>Broken promise requires a controlled escalation</h2>
                <p>
                  No payment was matched after the promised deadline. The debtor
                  replied yesterday, so a firm reminder is appropriate before
                  escalating to the client owner.
                </p>

                <div className="copilot-evidence">
                  <span>
                    <Clock3 size={13} /> Promise missed by 21 hours
                  </span>
                  <span>
                    <CircleDollarSign size={13} /> No matching payment detected
                  </span>
                  <span>
                    <Mail size={13} /> Last customer contact was acknowledged
                  </span>
                </div>

                <section className="copilot-recommendation">
                  <header>
                    <span>Recommended next action</span>
                    <strong>Human approval required</strong>
                  </header>
                  <p>
                    Send a WhatsApp reminder requesting payment confirmation by
                    14:00, then escalate to the client owner if there is no
                    reply.
                  </p>
                  <div>
                    <Link
                      className="copilot-primary-action"
                      href="/collection-queue"
                    >
                      Review draft
                    </Link>
                    <Link
                      className="copilot-secondary-action"
                      href="/collection-queue"
                    >
                      Open evidence
                    </Link>
                  </div>
                </section>
              </div>

              <form
                className="copilot-composer"
                onSubmit={submitCopilotRequest}
              >
                <label htmlFor="copilot-prompt">Ask about this account</label>
                <div>
                  <button
                    type="button"
                    disabled
                    aria-label="Attachments are not available yet"
                  >
                    <Paperclip size={14} />
                  </button>
                  <input
                    id="copilot-prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="Investigate, summarize, or draft an action…"
                  />
                  <button
                    type="submit"
                    disabled={!prompt.trim()}
                    aria-label="Send request to copilot"
                  >
                    <Send size={14} />
                  </button>
                </div>
                {copilotNotice && <p role="status">{copilotNotice}</p>}
              </form>
            </>
          )}
        </aside>
      ) : (
        <button
          className="copilot-reopen"
          type="button"
          onClick={() => setCopilotOpen(true)}
        >
          <Sparkles size={14} /> Open Collection Copilot
        </button>
      )}
    </section>
  );
}

interface PropertyProps {
  children: ReactNode;
  icon: ComponentType<{ size?: number }>;
  label: string;
}

function Property({ children, icon: Icon, label }: PropertyProps) {
  return (
    <div className="property-row">
      <dt>
        <span aria-hidden="true">
          <Icon size={14} />
        </span>{' '}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
