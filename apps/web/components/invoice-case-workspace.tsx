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
  MessageCircleMore,
  Star,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { CollectionCopilot } from '@/components/collection-copilot';

export function InvoiceCaseWorkspace() {
  const [starred, setStarred] = useState(true);
  const [copied, setCopied] = useState(false);

  async function copyInvoiceId() {
    await navigator.clipboard.writeText('INV-2026-0418');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
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

      <CollectionCopilot />
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
