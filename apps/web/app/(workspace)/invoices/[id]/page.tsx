import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CircleDollarSign,
  MessageCircle,
  MessageSquarePlus,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { DataState } from '@/components/data-state';
import { CollectionCaseManager } from '@/components/collection-case-manager';
import { CommunicationComposer } from '@/components/communication-composer';
import { PaginationNav } from '@/components/pagination-nav';
import { PaymentRecorder } from '@/components/payment-recorder';
import { Pill } from '@/components/table-ui';
import { ApiClientError } from '@/lib/api-client/errors';
import {
  formatBusinessDate,
  formatDuePosition,
  formatRupiah,
  formatTimestamp,
  humanizeEnum,
} from '@/lib/formatters';
import {
  entityIdSchema,
  type InvoiceDetailResponse,
} from '@/lib/receivables/contracts';
import { businessDateQuery } from '@/lib/receivables/page-query';
import { getInvoice } from '@/lib/receivables/server';
import {
  buildUrl,
  positiveInteger,
  queryValue,
  type PageSearchParams,
} from '@/lib/url-query';

import styles from './page.module.css';

export const metadata: Metadata = { title: 'Invoice details' };

const ALLOCATIONS_PER_PAGE = 50;

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageSearchParams>;
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: InvoiceDetailPageProps) {
  const [{ id }, rawSearchParams] = await Promise.all([params, searchParams]);
  const parsedId = entityIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const asOfDate = businessDateQuery(rawSearchParams);
  const result = await invoiceOrNotFound(parsedId.data, asOfDate);
  const invoice = result.data;
  const allocationPage = positiveInteger(
    queryValue(rawSearchParams, 'allocationPage'),
    1,
    100_000,
  );
  const allocationPages = Math.ceil(
    invoice.allocations.length / ALLOCATIONS_PER_PAGE,
  );
  if (allocationPages > 0 && allocationPage > allocationPages) {
    redirect(
      buildUrl(`/invoices/${invoice.id}`, rawSearchParams, {
        allocationPage: allocationPages,
      }),
    );
  }

  const sortedAllocations = [...invoice.allocations].reverse();
  const allocationStart = (allocationPage - 1) * ALLOCATIONS_PER_PAGE;
  const visibleAllocations = sortedAllocations.slice(
    allocationStart,
    allocationStart + ALLOCATIONS_PER_PAGE,
  );
  const debtorHref = `/debtors/${invoice.debtor.id}?asOfDate=${result.meta.asOfDate}`;

  return (
    <section className="record-page">
      <header className="record-topbar">
        <div>
          <Link className="record-back-link" href="/invoices">
            <ArrowLeft size={14} aria-hidden="true" />
            Invoices
          </Link>
          <div className="record-title-line">
            <h1>{invoice.invoiceNumber}</h1>
            <Pill tone={invoiceStateTone(invoice.state)}>
              {humanizeEnum(invoice.state)}
            </Pill>
          </div>
          <p>Balances as of {formatBusinessDate(result.meta.asOfDate)}</p>
        </div>
        <div className="page-actions">
          <a className="primary-button" href="#record-payment">
            <CircleDollarSign size={14} aria-hidden="true" />
            {invoice.state === 'PAID' ? 'View settlement' : 'Record payment'}
          </a>
          <a className="control-button" href="#log-communication">
            <MessageSquarePlus size={14} aria-hidden="true" />
            Log contact
          </a>
          <Link className="control-button" href={debtorHref}>
            <Building2 size={14} aria-hidden="true" />
            {invoice.debtor.name}
          </Link>
        </div>
      </header>

      <div className="record-content">
        <section className="record-metrics" aria-label="Invoice summary">
          <SummaryMetric
            label="Original"
            value={formatRupiah(invoice.originalAmount)}
          />
          <SummaryMetric
            label="Allocated"
            value={formatRupiah(invoice.allocatedAmount)}
          />
          <SummaryMetric
            label="Outstanding"
            value={formatRupiah(invoice.outstandingAmount)}
          />
          <SummaryMetric
            label="Aging"
            value={invoiceAgingLabel(invoice)}
            critical={invoice.aging.flags.includes('OVERDUE')}
          />
        </section>

        <div className="record-layout">
          <div className={styles.mainStack}>
            <CollectionCaseManager
              invoiceId={invoice.id}
              workflowBusinessDate={result.meta.workflowBusinessDate}
              timeZone={result.meta.timeZone}
              outstandingAmount={invoice.outstandingAmount}
              promises={invoice.promises}
              disputes={invoice.disputes}
            />
            <section className="record-panel" aria-labelledby="activity-title">
              <header className="record-panel-header">
                <div>
                  <h2 id="activity-title">Communication timeline</h2>
                  <p>Human-recorded evidence from contact outside Arus.</p>
                </div>
                <span className={styles.timelineCount}>
                  {invoice.communications.length}{' '}
                  {invoice.communications.length === 1 ? 'event' : 'events'}
                </span>
              </header>

              {invoice.communications.length > 0 ? (
                <ol className={styles.timeline}>
                  {invoice.communications.map((communication) => (
                    <li className={styles.timelineEvent} key={communication.id}>
                      <time
                        className={styles.timestamp}
                        dateTime={communication.occurredAt}
                      >
                        {formatTimestamp(
                          communication.occurredAt,
                          result.meta.timeZone,
                        )}
                      </time>
                      <span className={styles.rail} aria-hidden="true">
                        <span />
                      </span>
                      <div className={styles.eventBody}>
                        <div className={styles.eventHeader}>
                          <strong className={styles.eventActor}>
                            {communication.actor.name}{' '}
                            <small>
                              · {humanizeEnum(communication.actor.role)}
                            </small>
                          </strong>
                          <span className={styles.eventMeta}>
                            <MessageCircle size={12} aria-hidden="true" />
                            {channelLabel(communication.channel)}
                          </span>
                        </div>
                        <p className={styles.eventNotes}>
                          {communication.notes}
                        </p>
                        <footer className={styles.eventFooter}>
                          <span className={styles.externalLabel}>
                            <MessageCircle size={11} aria-hidden="true" />
                            Contact happened outside Arus
                          </span>
                          {communication.nextFollowUpDate && (
                            <span>
                              <CalendarClock size={11} aria-hidden="true" />
                              Next{' '}
                              {formatBusinessDate(
                                communication.nextFollowUpDate,
                              )}
                            </span>
                          )}
                        </footer>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className={styles.timelineEmpty} role="status">
                  <strong>No customer contact recorded yet</strong>
                  <p>
                    Make the call or send the message outside Arus, then record
                    the outcome to establish ownership and the next action.
                  </p>
                  <a className="control-button" href="#log-communication">
                    Log first contact
                  </a>
                </div>
              )}
            </section>

            <section className="record-panel record-ledger">
              <header className="record-panel-header">
                <div>
                  <h2>Allocation history</h2>
                  <p>
                    Payment evidence is shown newest first; reversals remain
                    visible.
                  </p>
                </div>
              </header>

              {visibleAllocations.length > 0 ? (
                <>
                  <div className="record-table-wrap">
                    <table className="data-table allocation-table">
                      <colgroup>
                        <col style={{ width: 125 }} />
                        <col style={{ width: 125 }} />
                        <col style={{ width: 155 }} />
                        <col style={{ width: 155 }} />
                        <col style={{ width: 180 }} />
                        <col style={{ width: 180 }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>Allocated</th>
                          <th>Payment date</th>
                          <th>Allocation</th>
                          <th>Payment total</th>
                          <th>Reference</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleAllocations.map((allocation) => (
                          <tr key={allocation.id}>
                            <td className="muted-cell">
                              {formatBusinessDate(allocation.allocationDate)}
                            </td>
                            <td className="muted-cell">
                              {formatBusinessDate(
                                allocation.payment.paymentDate,
                              )}
                            </td>
                            <td className="money-cell">
                              {formatRupiah(allocation.amount)}
                            </td>
                            <td className="money-cell">
                              {formatRupiah(allocation.payment.amount)}
                            </td>
                            <td>
                              <span className="entity-copy">
                                <Link
                                  className="blue-link"
                                  href={`/payments/${allocation.payment.id}`}
                                >
                                  {allocation.payment.payerReference ??
                                    (allocation.payment.isOpeningBalance
                                      ? 'Opening balance'
                                      : 'Payment record')}
                                </Link>
                                <small>
                                  {allocation.payment.bankReference ??
                                    (allocation.payment.isOpeningBalance
                                      ? 'Imported opening balance'
                                      : 'No bank reference')}
                                </small>
                              </span>
                            </td>
                            <td>
                              <span className="entity-copy">
                                <span>
                                  <Pill
                                    tone={
                                      allocation.reversedAt ? 'red' : 'green'
                                    }
                                  >
                                    {allocation.reversedAt
                                      ? 'Reversed'
                                      : 'Active'}
                                  </Pill>
                                </span>
                                {allocation.reversedAt && (
                                  <small>
                                    {allocation.reversalReason ??
                                      `Reversed ${formatBusinessDate(allocation.reversedAt.slice(0, 10))}`}
                                  </small>
                                )}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationNav
                    path={`/invoices/${invoice.id}`}
                    searchParams={rawSearchParams}
                    page={allocationPage}
                    pageKey="allocationPage"
                    totalPages={allocationPages}
                    total={invoice.allocations.length}
                  />
                </>
              ) : (
                <DataState
                  title="No payment allocations"
                  description="This invoice has no allocation history. Its outstanding balance equals the original amount."
                />
              )}
            </section>
          </div>

          <aside className={styles.contextRail}>
            <PaymentRecorder
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              debtorName={invoice.debtor.name}
              workflowBusinessDate={result.meta.workflowBusinessDate}
              outstandingAmount={invoice.outstandingAmount}
            />
            <CommunicationComposer
              invoiceId={invoice.id}
              workflowBusinessDate={result.meta.workflowBusinessDate}
              suggestedDate={invoice.nextFollowUpSuggestion.date}
            />
            <section className="record-panel">
              <header className="record-panel-header">
                <div>
                  <h2>Invoice details</h2>
                  <p>Source fields and current derived state.</p>
                </div>
              </header>
              <dl className="record-properties">
                <Property
                  label="Debtor"
                  value={<Link href={debtorHref}>{invoice.debtor.name}</Link>}
                />
                <Property
                  label="Account code"
                  value={invoice.debtor.code ?? 'Not provided'}
                />
                <Property
                  label="Invoice date"
                  value={formatBusinessDate(invoice.invoiceDate)}
                />
                <Property
                  label="Due date"
                  value={formatBusinessDate(invoice.dueDate)}
                />
                <Property label="State" value={humanizeEnum(invoice.state)} />
                <Property
                  label="Created"
                  value={formatBusinessDate(invoice.createdAt.slice(0, 10))}
                />
                <Property
                  label="Updated"
                  value={formatBusinessDate(invoice.updatedAt.slice(0, 10))}
                />
              </dl>
              {invoice.description && (
                <div className="record-note">
                  <span>Description</span>
                  <p>{invoice.description}</p>
                </div>
              )}
            </section>
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

function Property({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function invoiceStateTone(state: InvoiceDetailResponse['data']['state']) {
  if (state === 'PAID') return 'green' as const;
  if (state === 'PARTIALLY_PAID') return 'blue' as const;
  return 'neutral' as const;
}

function invoiceAgingLabel(invoice: InvoiceDetailResponse['data']): string {
  return invoice.state === 'PAID' ? 'Paid' : formatDuePosition(invoice.aging);
}

function channelLabel(
  channel: InvoiceDetailResponse['data']['communications'][number]['channel'],
): string {
  return channel === 'WHATSAPP' ? 'WhatsApp' : humanizeEnum(channel);
}

async function invoiceOrNotFound(id: string, asOfDate: string | undefined) {
  try {
    return await getInvoice(id, asOfDate);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }
}
