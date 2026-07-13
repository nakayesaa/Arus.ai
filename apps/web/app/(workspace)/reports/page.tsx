import type { Metadata } from 'next';
import { ArrowUpRight, CalendarDays, Download, Printer } from 'lucide-react';

import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Reports' };

const aging = [
  ['Current', '31%', 'Rp 1,06 M', ''],
  ['1–30 days', '24%', 'Rp 821 jt', ''],
  ['31–60 days', '20%', 'Rp 684 jt', 'amber'],
  ['61–90 days', '14%', 'Rp 479 jt', 'amber'],
  ['90+ days', '11%', 'Rp 376 jt', 'red'],
] as const;

export default function ReportsPage() {
  return (
    <div className="content-page">
      <PageHeader
        title="Reports"
        eyebrow="Weekly summary · 8–14 July 2026"
        action={
          <>
            <button className="control-button" type="button">
              <CalendarDays size={15} /> This week
            </button>
            <button className="primary-button" type="button">
              <Download size={15} /> Export report
            </button>
          </>
        }
      />

      <section className="content-grid">
        <article className="panel panel-span-7">
          <h2>Receivables aging</h2>
          <p>Rp 3,42 miliar outstanding across 80 open invoices.</p>
          <div className="aging-bars">
            {aging.map(([label, width, value, tone]) => (
              <div className="aging-row" key={label}>
                <span>{label}</span>
                <span className="bar-track">
                  <span className={`bar-fill ${tone}`} style={{ width }} />
                </span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-span-5">
          <h2>Collection health</h2>
          <p>Operational signals that require follow-up this week.</p>
          <div className="mini-metrics">
            <div className="mini-metric">
              <span>Collected</span>
              <strong>Rp 486 jt</strong>
            </div>
            <div className="mini-metric">
              <span>Promise kept</span>
              <strong>76%</strong>
            </div>
            <div className="mini-metric">
              <span>Broken promises</span>
              <strong>7</strong>
            </div>
            <div className="mini-metric">
              <span>Open disputes</span>
              <strong>4</strong>
            </div>
          </div>
        </article>

        <article className="panel panel-span-12">
          <h2>Available reports</h2>
          <div className="report-list">
            {[
              [
                'Weekly collection summary',
                'Cash collected, aging movement, promises, and disputes',
              ],
              [
                'Debtor exposure',
                'Total AR and overdue balance grouped by debtor',
              ],
              [
                'Payment allocation audit',
                'Trace each payment to its invoice allocation',
              ],
            ].map(([title, description]) => (
              <div className="report-row" key={title}>
                <Printer size={16} />
                <div>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Open ${title}`}
                >
                  <ArrowUpRight size={16} />
                </button>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
