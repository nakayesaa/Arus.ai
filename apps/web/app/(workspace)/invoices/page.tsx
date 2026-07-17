import { Upload, X } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DataPage } from '@/components/data-page';
import { DatasetSearch } from '@/components/dataset-search';
import { DatasetSelect } from '@/components/dataset-select';
import { DataState } from '@/components/data-state';
import { PaginationNav } from '@/components/pagination-nav';
import { Pill } from '@/components/table-ui';
import {
  formatBusinessDate,
  formatCompactNumber,
  formatDuePosition,
  formatRupiah,
  humanizeEnum,
} from '@/lib/formatters';
import {
  agingBuckets,
  invoiceStates,
  type Invoice,
} from '@/lib/receivables/contracts';
import {
  businessDateQuery,
  entityIdQuery,
  listPage,
  listSearch,
  supportedQueryValue,
} from '@/lib/receivables/page-query';
import { listInvoices } from '@/lib/receivables/server';
import { buildUrl, type PageSearchParams } from '@/lib/url-query';

export const metadata: Metadata = { title: 'Invoices' };

const PAGE_SIZE = 25;
const stateOptions = [
  { value: '', label: 'All states' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PARTIALLY_PAID', label: 'Partially paid' },
  { value: 'PAID', label: 'Paid' },
] as const;
const agingOptions = [
  { value: '', label: 'All aging' },
  { value: 'CURRENT', label: 'Current' },
  { value: 'OVERDUE_1_7', label: '1–7 days overdue' },
  { value: 'OVERDUE_8_30', label: '8–30 days overdue' },
  { value: 'OVERDUE_31_60', label: '31–60 days overdue' },
  { value: 'OVERDUE_61_90', label: '61–90 days overdue' },
  { value: 'OVERDUE_90_PLUS', label: '90+ days overdue' },
] as const;

interface InvoicesPageProps {
  searchParams: Promise<PageSearchParams>;
}

export default async function InvoicesPage({
  searchParams,
}: InvoicesPageProps) {
  const rawSearchParams = await searchParams;
  const search = listSearch(rawSearchParams);
  const asOfDate = businessDateQuery(rawSearchParams);
  const debtorId = entityIdQuery(rawSearchParams, 'debtorId');
  const state = supportedQueryValue(rawSearchParams, 'state', invoiceStates);
  const agingBucket = supportedQueryValue(
    rawSearchParams,
    'agingBucket',
    agingBuckets,
  );
  const page = listPage(rawSearchParams);
  const result = await listInvoices({
    ...(search ? { search } : {}),
    ...(asOfDate ? { asOfDate } : {}),
    ...(debtorId ? { debtorId } : {}),
    ...(state ? { state } : {}),
    ...(agingBucket ? { agingBucket } : {}),
    page,
    limit: PAGE_SIZE,
  });

  if (result.pagination.totalPages > 0 && page > result.pagination.totalPages) {
    redirect(
      buildUrl('/invoices', rawSearchParams, {
        page: result.pagination.totalPages,
      }),
    );
  }

  const hasFilters = Boolean(search || debtorId || state || agingBucket);
  const clearFiltersHref = buildUrl('/invoices', rawSearchParams, {
    search: null,
    debtorId: null,
    state: null,
    agingBucket: null,
    page: null,
  });
  const pageLabel =
    result.pagination.totalPages > 0
      ? `As of ${formatBusinessDate(result.meta.asOfDate)} · Page ${result.pagination.page} of ${result.pagination.totalPages}`
      : `As of ${formatBusinessDate(result.meta.asOfDate)}`;

  return (
    <DataPage
      title="Invoices"
      recordLabel={`${formatCompactNumber(result.pagination.total)} ${result.pagination.total === 1 ? 'invoice' : 'invoices'}`}
      pageLabel={pageLabel}
      toolbar={
        <>
          <DatasetSearch
            value={search ?? ''}
            placeholder="Search invoices"
            label="Search invoices and debtors"
          />
          <DatasetSelect
            label="Filter by invoice state"
            queryKey="state"
            value={state ?? ''}
            options={stateOptions}
          />
          <DatasetSelect
            label="Filter by aging"
            queryKey="agingBucket"
            value={agingBucket ?? ''}
            options={agingOptions}
          />
          {debtorId && (
            <Link
              className="control-button account-filter-control"
              href={buildUrl('/invoices', rawSearchParams, {
                debtorId: null,
                page: null,
              })}
            >
              Account filter
              <X size={13} aria-hidden="true" />
            </Link>
          )}
          <Link className="primary-button" href="/import">
            <Upload size={14} aria-hidden="true" />
            Import CSV
          </Link>
        </>
      }
      footer={
        <PaginationNav
          path="/invoices"
          searchParams={rawSearchParams}
          page={result.pagination.page}
          totalPages={result.pagination.totalPages}
          total={result.pagination.total}
        />
      }
    >
      {result.data.length > 0 ? (
        <table className="data-table aligned-data-table invoice-table">
          <colgroup>
            <col style={{ width: 160 }} />
            <col style={{ width: 225 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 155 }} />
            <col style={{ width: 155 }} />
            <col style={{ width: 155 }} />
            <col style={{ width: 135 }} />
            <col style={{ width: 145 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Invoice</th>
              <th>Debtor</th>
              <th>Invoice date</th>
              <th>Due date</th>
              <th>Original</th>
              <th>Allocated</th>
              <th>Outstanding</th>
              <th>State</th>
              <th>Aging</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((invoice) => (
              <tr key={invoice.id}>
                <td>
                  <Link
                    className="blue-link primary-cell"
                    href={`/invoices/${invoice.id}?asOfDate=${result.meta.asOfDate}`}
                  >
                    {invoice.invoiceNumber}
                  </Link>
                </td>
                <td>
                  <span className="entity-copy">
                    <Link
                      className="primary-cell"
                      href={`/debtors/${invoice.debtor.id}?asOfDate=${result.meta.asOfDate}`}
                    >
                      {invoice.debtor.name}
                    </Link>
                    <small>{invoice.debtor.code ?? 'No account code'}</small>
                  </span>
                </td>
                <td className="muted-cell">
                  {formatBusinessDate(invoice.invoiceDate)}
                </td>
                <td className="muted-cell">
                  {formatBusinessDate(invoice.dueDate)}
                </td>
                <td className="money-cell">
                  {formatRupiah(invoice.originalAmount)}
                </td>
                <td className="money-cell">
                  {formatRupiah(invoice.allocatedAmount)}
                </td>
                <td className="money-cell">
                  {formatRupiah(invoice.outstandingAmount)}
                </td>
                <td>
                  <Pill tone={invoiceStateTone(invoice.state)}>
                    {humanizeEnum(invoice.state)}
                  </Pill>
                </td>
                <td>
                  <Pill tone={invoiceAgingTone(invoice)}>
                    {invoiceAgingLabel(invoice)}
                  </Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <DataState
          title={
            hasFilters ? 'No invoices match these filters' : 'No invoices yet'
          }
          description={
            hasFilters
              ? 'Adjust the search, state, aging, or account filter to broaden the result.'
              : 'Import a validated CSV file to populate the invoice ledger.'
          }
          action={
            hasFilters ? (
              <Link className="control-button" href={clearFiltersHref}>
                Clear filters
              </Link>
            ) : (
              <Link className="primary-button" href="/import">
                Import CSV
              </Link>
            )
          }
        />
      )}
    </DataPage>
  );
}

function invoiceStateTone(state: Invoice['state']) {
  if (state === 'PAID') return 'green' as const;
  if (state === 'PARTIALLY_PAID') return 'blue' as const;
  return 'neutral' as const;
}

function invoiceAgingTone(invoice: Invoice) {
  if (invoice.state === 'PAID') return 'green' as const;
  if (invoice.aging.flags.includes('DUE_SOON')) return 'amber' as const;
  if (!invoice.aging.flags.includes('OVERDUE')) return 'neutral' as const;
  return ['OVERDUE_1_7', 'OVERDUE_8_30'].includes(invoice.aging.bucket)
    ? ('amber' as const)
    : ('red' as const);
}

function invoiceAgingLabel(invoice: Invoice): string {
  return invoice.state === 'PAID' ? 'Paid' : formatDuePosition(invoice.aging);
}
