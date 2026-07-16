import type { Metadata } from 'next';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileWarning,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = {
  title: 'Dashboard',
};

const summary = [
  {
    label: 'Overdue exposure',
    value: 'Rp 1,84 miliar',
    detail: '42 open invoices',
    tone: null,
  },
  {
    label: 'Needs action',
    value: '26',
    detail: 'across 11 debtors',
    tone: null,
  },
  {
    label: 'Broken promises',
    value: '7',
    detail: 'Rp 412 jt at risk',
    tone: 'critical',
  },
  {
    label: 'Next-action coverage',
    value: '94%',
    detail: '4 invoices missing',
    tone: 'attention',
  },
] as const;

const exceptions = [
  {
    type: 'Broken promise',
    tone: 'critical',
    icon: AlertTriangle,
    debtor: 'PT Sinar Abadi Retail',
    reason: 'Promise for 15 July was not fulfilled',
    amount: 'Rp 185.000.000',
    owner: 'Maya',
    due: '45 min',
  },
  {
    type: 'No next action',
    tone: 'attention',
    icon: Clock3,
    debtor: 'CV Karya Prima',
    reason: 'Invoice is 37 days overdue without a scheduled follow-up',
    amount: 'Rp 142.500.000',
    owner: 'Alex',
    due: 'Today',
  },
  {
    type: 'Payment review',
    tone: 'attention',
    icon: CircleDollarSign,
    debtor: 'PT Arta Medika',
    reason: 'Incoming payment has not been allocated to an invoice',
    amount: 'Rp 28.000.000',
    owner: 'Maya',
    due: '11:30',
  },
  {
    type: 'Open dispute',
    tone: 'blocked',
    icon: FileWarning,
    debtor: 'UD Sentosa Makmur',
    reason: 'Proof of delivery requested by client finance',
    amount: 'Rp 64.000.000',
    owner: 'Dimas',
    due: '14:00',
  },
] as const;

const schedule = [
  ['10:00', 'Review 3 reminder drafts', 'Customer-facing approval'],
  ['11:30', 'Allocate PAY-0072', 'PT Arta Medika'],
  ['14:00', 'Dispute review', 'UD Sentosa Makmur'],
] as const;

export default function DashboardPage() {
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Dashboard"
        eyebrow="Thursday, 16 July"
        description="Today’s exceptions, ownership, and collection movement."
        action={
          <Link className="primary-button" href="/collection-queue">
            Open collection queue <ArrowRight size={14} />
          </Link>
        }
      />

      <div className="dashboard-layout">
        <main className="dashboard-main">
          <section
            className="operational-summary"
            aria-label="Collection summary"
          >
            {summary.map((metric) => (
              <div className="summary-metric" key={metric.label}>
                <span>{metric.label}</span>
                <strong
                  className={metric.tone ? `tone-${metric.tone}` : undefined}
                >
                  {metric.value}
                </strong>
                <small>{metric.detail}</small>
              </div>
            ))}
          </section>

          <section
            className="exception-section"
            aria-labelledby="attention-title"
          >
            <header className="section-heading-row">
              <div>
                <h2 id="attention-title">Needs attention</h2>
                <p>Exceptions that require a decision or human follow-up.</p>
              </div>
              <Link href="/collection-queue">
                View all 26 <ArrowRight size={13} />
              </Link>
            </header>

            <div className="exception-list">
              {exceptions.map(({ icon: Icon, ...exception }) => (
                <Link
                  className="exception-row"
                  href="/collection-queue"
                  key={`${exception.type}-${exception.debtor}`}
                >
                  <span className={`exception-icon tone-${exception.tone}`}>
                    <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <span className="exception-identity">
                    <strong>{exception.debtor}</strong>
                    <small>{exception.reason}</small>
                  </span>
                  <span className={`exception-state tone-${exception.tone}`}>
                    {exception.type}
                  </span>
                  <strong className="exception-amount">
                    {exception.amount}
                  </strong>
                  <span className="exception-owner">
                    <UserRound size={13} aria-hidden="true" /> {exception.owner}
                  </span>
                  <span className="exception-due">{exception.due}</span>
                  <ArrowRight
                    className="exception-arrow"
                    size={14}
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </section>

          <section
            className="automation-strip"
            aria-labelledby="automation-title"
          >
            <span className="automation-icon" aria-hidden="true">
              <ShieldCheck size={16} />
            </span>
            <div>
              <h2 id="automation-title">Routine scheduling is active</h2>
              <p>
                Internal prioritization and next actions are automated. Customer
                reminders still require approval.
              </p>
            </div>
            <Link href="/settings">Review policy</Link>
          </section>
        </main>

        <aside
          className="dashboard-context"
          aria-label="Today’s operational context"
        >
          <section className="context-section">
            <header>
              <div>
                <span>Today</span>
                <strong>3 scheduled reviews</strong>
              </div>
              <Clock3 size={15} aria-hidden="true" />
            </header>
            <div className="schedule-list">
              {schedule.map(([time, title, meta]) => (
                <div className="schedule-row" key={`${time}-${title}`}>
                  <time>{time}</time>
                  <span>
                    <strong>{title}</strong>
                    <small>{meta}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="context-section context-movement">
            <header>
              <div>
                <span>Recent movement</span>
                <strong>Since yesterday</strong>
              </div>
              <CheckCircle2 size={15} aria-hidden="true" />
            </header>
            <dl>
              <div>
                <dt>Payments recorded</dt>
                <dd>Rp 486 jt</dd>
              </div>
              <div>
                <dt>Promises kept</dt>
                <dd>3 of 4</dd>
              </div>
              <div>
                <dt>Invoices resolved</dt>
                <dd>9</dd>
              </div>
            </dl>
          </section>

          <Link className="context-report-link" href="/reports">
            Open weekly report <ArrowRight size={13} />
          </Link>
        </aside>
      </div>
    </div>
  );
}
