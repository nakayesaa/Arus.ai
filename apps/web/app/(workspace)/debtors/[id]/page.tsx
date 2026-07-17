import { ArrowLeft, ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { DataState } from '@/components/data-state';
import { Pill } from '@/components/table-ui';
import { ApiClientError } from '@/lib/api-client/errors';
import {
  formatBusinessDate,
  formatCompactNumber,
  formatDuePosition,
  formatRupiah,
  humanizeEnum,
} from '@/lib/formatters';
import { entityIdSchema, type Invoice } from '@/lib/receivables/contracts';
import { businessDateQuery } from '@/lib/receivables/page-query';
import { getDebtor } from '@/lib/receivables/server';
import type { PageSearchParams } from '@/lib/url-query';

export const metadata: Metadata = { title: 'Customer details' };

const VISIBLE_INVOICE_LIMIT = 50;

interface DebtorDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageSearchParams>;
}

export default async function DebtorDetailPage({
  params,
  searchParams,
}: DebtorDetailPageProps) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const parsedId = entityIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const asOfDate = businessDateQuery(rawSearchParams);
  const result = await debtorOrNotFound(parsedId.data, asOfDate);
  const debtor = result.data;
  const visibleInvoices = debtor.invoices.slice(0, VISIBLE_INVOICE_LIMIT);
  const invoiceListHref = `/invoices?debtorId=${debtor.id}&asOfDate=${result.meta.asOfDate}`;

  return (
    <section className="record-page">
      <header className="record-topbar">
        <div>
          <Link className="record-back-link" href="/debtors">
            <ArrowLeft size={14} aria-hidden="true" />
            Customers
          </Link>
          <div className="record-title-line">
            <h1>{debtor.name}</h1>
            {debtor.code && <Pill>{debtor.code}</Pill>}
          </div>
          <p>Balances as of {formatBusinessDate(result.meta.asOfDate)}</p>
        </div>
        <Link className="control-button" href={invoiceListHref}>
          View invoices
          <ExternalLink size={13} aria-hidden="true" />
        </Link>
      </header>

      <div className="record-content">
        <section className="record-metrics" aria-label="Account summary">
          <SummaryMetric
            label="Outstanding"
            value={formatRupiah(debtor.summary.totalOutstanding)}
          />
          <SummaryMetric
            label="Overdue"
            value={formatRupiah(debtor.summary.overdueOutstanding)}
            critical={debtor.summary.overdueOutstanding !== '0.00'}
          />
          <SummaryMetric
            label="Open invoices"
            value={formatCompactNumber(debtor.summary.openInvoiceCount)}
          />
          <SummaryMetric
            label="All invoices"
            value={formatCompactNumber(debtor.summary.invoiceCount)}
          />
        </section>

        <div className="record-layout">
          <section className="record-panel record-ledger">
            <header className="record-panel-header">
              <div>
                <h2>Invoice ledger</h2>
                <p>Derived from imported invoices and payment allocations.</p>
              </div>
              {debtor.invoices.length > VISIBLE_INVOICE_LIMIT && (
                <Link className="blue-link" href={invoiceListHref}>
                  View all {formatCompactNumber(debtor.invoices.length)}
                </Link>
              )}
            </header>

            {visibleInvoices.length > 0 ? (
              <div className="record-table-wrap">
                <table className="data-table record-table">
                  <colgroup>
                    <col style={{ width: 165 }} />
                    <col style={{ width: 125 }} />
                    <col style={{ width: 135 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 145 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Due date</th>
                      <th>State</th>
                      <th>Outstanding</th>
                      <th>Aging</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleInvoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>
                          <Link
                            className="blue-link"
                            href={`/invoices/${invoice.id}?asOfDate=${result.meta.asOfDate}`}
                          >
                            {invoice.invoiceNumber}
                          </Link>
                        </td>
                        <td className="muted-cell">
                          {formatBusinessDate(invoice.dueDate)}
                        </td>
                        <td>
                          <Pill tone={invoiceStateTone(invoice.state)}>
                            {humanizeEnum(invoice.state)}
                          </Pill>
                        </td>
                        <td className="money-cell">
                          {formatRupiah(invoice.outstandingAmount)}
                        </td>
                        <td
                          className={
                            invoice.aging.flags.includes('OVERDUE')
                              ? 'tone-critical'
                              : 'muted-cell'
                          }
                        >
                          {invoiceAgingLabel(invoice)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <DataState
                title="No invoices for this account"
                description="Invoices imported for this debtor will appear here with their current allocation and aging state."
                action={
                  <Link className="primary-button" href="/import">
                    Import CSV
                  </Link>
                }
              />
            )}
          </section>

          <aside className="record-panel">
            <header className="record-panel-header">
              <div>
                <h2>Account details</h2>
                <p>Stored debtor identity and contact information.</p>
              </div>
            </header>
            <dl className="record-properties">
              <Property label="Account code" value={debtor.code} />
              <Property label="Contact" value={debtor.contactName} />
              <Property label="Email" value={debtor.email} />
              <Property label="Phone" value={debtor.phoneNumber} />
              <Property
                label="Created"
                value={formatBusinessDate(debtor.createdAt.slice(0, 10))}
              />
              <Property
                label="Updated"
                value={formatBusinessDate(debtor.updatedAt.slice(0, 10))}
              />
            </dl>
          </aside>
        </div>
      </div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  critical = false,
}: {
  label: string;
  value: string;
  critical?: boolean;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong className={critical ? 'tone-critical' : undefined}>
        {value}
      </strong>
    </div>
  );
}

function Property({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? 'Not provided'}</dd>
    </div>
  );
}

function invoiceStateTone(state: Invoice['state']) {
  if (state === 'PAID') return 'green' as const;
  if (state === 'PARTIALLY_PAID') return 'blue' as const;
  return 'neutral' as const;
}

function invoiceAgingLabel(invoice: Invoice): string {
  return invoice.state === 'PAID' ? 'Paid' : formatDuePosition(invoice.aging);
}

async function debtorOrNotFound(id: string, asOfDate: string | undefined) {
  try {
    return await getDebtor(id, asOfDate);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }
}
