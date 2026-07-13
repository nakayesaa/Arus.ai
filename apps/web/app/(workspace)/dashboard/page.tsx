import type { Metadata } from 'next';
import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = {
  title: 'Dashboard',
};

export default function DashboardPage() {
  return (
    <div className="dashboard-page">
      <PageHeader
        title="Dashboard"
        eyebrow="Today · 14 July 2026"
        action={
          <Link className="outline-blue-button" href="/chat">
            <Sparkles size={16} aria-hidden="true" />
            Start collecting
          </Link>
        }
      />

      <section className="dashboard-hero" aria-labelledby="attention-title">
        <h2 id="attention-title">good morning, Alex. what needs attention?</h2>

        <Link className="priority-card" href="/collection-queue">
          <span className="priority-copy">
            <small>Today&apos;s collection focus</small>
            <strong>Rp 1,84 miliar overdue needs your attention</strong>
            <p>
              42 invoices across 18 debtors, prioritized by aging and promise
              status.
            </p>
          </span>
          <span className="priority-arrow" aria-hidden="true">
            <ArrowRight size={22} />
          </span>
        </Link>

        <nav className="dashboard-chips" aria-label="Quick views">
          <Link className="chip" href="/invoices">
            Review 12 newly overdue
          </Link>
          <Link className="chip" href="/collection-queue">
            Chase 7 broken promises
          </Link>
          <Link className="chip" href="/debtors">
            View high-value accounts
          </Link>
        </nav>
      </section>
    </div>
  );
}
