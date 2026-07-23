import { CircleDollarSign, Filter, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DataPage } from '@/components/data-page';
import { DataState } from '@/components/data-state';
import { PaginationNav } from '@/components/pagination-nav';
import { Pill } from '@/components/table-ui';
import {
  formatBusinessDate,
  formatCompactNumber,
  formatRupiah,
} from '@/lib/formatters';
import {
  paymentBusinessDateSchema,
  type Payment,
} from '@/lib/payments/contracts';
import { listPayments } from '@/lib/payments/server';
import {
  buildUrl,
  positiveInteger,
  queryValue,
  type PageSearchParams,
} from '@/lib/url-query';

import styles from './payments.module.css';

export const metadata: Metadata = { title: 'Payments' };

const PAGE_SIZE = 25;

interface PaymentsPageProps {
  searchParams: Promise<PageSearchParams>;
}

export default async function PaymentsPage({
  searchParams,
}: PaymentsPageProps) {
  const rawSearchParams = await searchParams;
  const from = dateQuery(rawSearchParams, 'from');
  const to = dateQuery(rawSearchParams, 'to');
  const page = positiveInteger(queryValue(rawSearchParams, 'page'), 1, 100_000);
  const result = await listPayments({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
    limit: PAGE_SIZE,
  });

  if (result.pagination.totalPages > 0 && page > result.pagination.totalPages) {
    redirect(
      buildUrl('/payments', rawSearchParams, {
        page: result.pagination.totalPages,
      }),
    );
  }

  const hasDateFilter = Boolean(from || to);
  const pageLabel = [
    paymentWindow(from, to),
    result.pagination.totalPages > 0
      ? `Page ${result.pagination.page} of ${result.pagination.totalPages}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <DataPage
      title="Payments"
      recordLabel={`${formatCompactNumber(result.pagination.total)} ${result.pagination.total === 1 ? 'payment' : 'payments'}`}
      pageLabel={pageLabel}
      toolbar={
        <>
          <form className={styles.filters} method="get">
            <label>
              <span>From</span>
              <input type="date" name="from" defaultValue={from ?? ''} />
            </label>
            <label>
              <span>To</span>
              <input type="date" name="to" defaultValue={to ?? ''} />
            </label>
            <button className="control-button" type="submit">
              <Filter size={13} aria-hidden="true" />
              Apply
            </button>
          </form>
          {hasDateFilter && (
            <Link className="control-button" href="/payments">
              <X size={13} aria-hidden="true" />
              Clear
            </Link>
          )}
          <Link className="primary-button" href="/invoices?state=OPEN">
            <CircleDollarSign size={14} aria-hidden="true" />
            Choose invoice
          </Link>
        </>
      }
      footer={
        <PaginationNav
          path="/payments"
          searchParams={rawSearchParams}
          page={result.pagination.page}
          totalPages={result.pagination.totalPages}
          total={result.pagination.total}
        />
      }
    >
      {result.data.length > 0 ? (
        <table className="data-table aligned-data-table">
          <colgroup>
            <col style={{ width: 130 }} />
            <col style={{ width: 165 }} />
            <col style={{ width: 230 }} />
            <col style={{ width: 180 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 230 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 130 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Payment date</th>
              <th>Payment</th>
              <th>Debtor</th>
              <th>Invoice</th>
              <th>Amount</th>
              <th>References</th>
              <th>Recorded by</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((payment) => {
              const allocation = payment.allocations[0];
              return (
                <tr key={payment.id}>
                  <td className="muted-cell">
                    {formatBusinessDate(payment.paymentDate)}
                  </td>
                  <td>
                    <Link
                      className="blue-link primary-cell"
                      href={`/payments/${payment.id}`}
                    >
                      {paymentLabel(payment.id)}
                    </Link>
                  </td>
                  <td>
                    <span className="entity-copy">
                      <Link
                        className="primary-cell"
                        href={`/debtors/${payment.debtor.id}`}
                      >
                        {payment.debtor.name}
                      </Link>
                      <small>{payment.debtor.code ?? 'No account code'}</small>
                    </span>
                  </td>
                  <td>
                    {allocation ? (
                      <Link
                        className="blue-link"
                        href={`/invoices/${allocation.invoice.id}`}
                      >
                        {allocation.invoice.invoiceNumber}
                      </Link>
                    ) : (
                      <span className="muted-cell">No allocation</span>
                    )}
                  </td>
                  <td className="money-cell">{formatRupiah(payment.amount)}</td>
                  <td>
                    <span className="entity-copy">
                      <strong>
                        {payment.payerReference ?? 'Opening balance'}
                      </strong>
                      <small>
                        {payment.bankReference ?? 'No bank reference'}
                      </small>
                    </span>
                  </td>
                  <td>{payment.createdBy.name}</td>
                  <td>
                    <PaymentStatus payment={payment} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <DataState
          title={
            hasDateFilter
              ? 'No payments in this date range'
              : 'No payments recorded yet'
          }
          description={
            hasDateFilter
              ? 'Adjust or clear the payment-date filters.'
              : 'Open an invoice to record a verified operational payment.'
          }
          action={
            hasDateFilter ? (
              <Link className="control-button" href="/payments">
                Clear date filters
              </Link>
            ) : (
              <Link className="primary-button" href="/invoices?state=OPEN">
                Choose invoice
              </Link>
            )
          }
        />
      )}
    </DataPage>
  );
}

function PaymentStatus({ payment }: { payment: Payment }) {
  if (payment.isOpeningBalance) {
    return <Pill tone="neutral">Opening balance</Pill>;
  }
  if (payment.allocations.some((allocation) => allocation.reversedAt)) {
    return <Pill tone="red">Reversed</Pill>;
  }
  return <Pill tone="green">Allocated</Pill>;
}

function dateQuery(
  searchParams: PageSearchParams,
  key: 'from' | 'to',
): string | undefined {
  const parsed = paymentBusinessDateSchema.safeParse(
    queryValue(searchParams, key),
  );
  return parsed.success ? parsed.data : undefined;
}

function paymentWindow(
  from: string | undefined,
  to: string | undefined,
): string {
  if (from && to) {
    return `${formatBusinessDate(from)}–${formatBusinessDate(to)}`;
  }
  if (from) return `From ${formatBusinessDate(from)}`;
  if (to) return `Through ${formatBusinessDate(to)}`;
  return 'All recorded payment dates';
}

function paymentLabel(id: string): string {
  return `PAY-${id.slice(0, 8).toLocaleUpperCase('en-US')}`;
}
