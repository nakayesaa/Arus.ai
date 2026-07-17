import { Upload } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DataPage } from '@/components/data-page';
import { DatasetSearch } from '@/components/dataset-search';
import { DataState } from '@/components/data-state';
import { PaginationNav } from '@/components/pagination-nav';
import { Avatar } from '@/components/table-ui';
import {
  formatBusinessDate,
  formatCompactNumber,
  formatRupiah,
  initials,
} from '@/lib/formatters';
import {
  businessDateQuery,
  listPage,
  listSearch,
} from '@/lib/receivables/page-query';
import { listDebtors } from '@/lib/receivables/server';
import { buildUrl, type PageSearchParams } from '@/lib/url-query';

export const metadata: Metadata = { title: 'Customers' };

const PAGE_SIZE = 25;

interface DebtorsPageProps {
  searchParams: Promise<PageSearchParams>;
}

export default async function DebtorsPage({ searchParams }: DebtorsPageProps) {
  const rawSearchParams = await searchParams;
  const search = listSearch(rawSearchParams);
  const asOfDate = businessDateQuery(rawSearchParams);
  const page = listPage(rawSearchParams);
  const result = await listDebtors({
    ...(search ? { search } : {}),
    ...(asOfDate ? { asOfDate } : {}),
    page,
    limit: PAGE_SIZE,
  });

  if (result.pagination.totalPages > 0 && page > result.pagination.totalPages) {
    redirect(
      buildUrl('/debtors', rawSearchParams, {
        page: result.pagination.totalPages,
      }),
    );
  }

  const pageLabel =
    result.pagination.totalPages > 0
      ? `As of ${formatBusinessDate(result.meta.asOfDate)} · Page ${result.pagination.page} of ${result.pagination.totalPages}`
      : `As of ${formatBusinessDate(result.meta.asOfDate)}`;

  return (
    <DataPage
      title="Customers"
      recordLabel={`${formatCompactNumber(result.pagination.total)} ${result.pagination.total === 1 ? 'company' : 'companies'}`}
      pageLabel={pageLabel}
      toolbar={
        <>
          <DatasetSearch
            value={search ?? ''}
            placeholder="Search accounts"
            label="Search debtor accounts"
          />
          <Link className="primary-button" href="/import">
            <Upload size={14} aria-hidden="true" />
            Import CSV
          </Link>
        </>
      }
      footer={
        <PaginationNav
          path="/debtors"
          searchParams={rawSearchParams}
          page={result.pagination.page}
          totalPages={result.pagination.totalPages}
          total={result.pagination.total}
        />
      }
    >
      {result.data.length > 0 ? (
        <table className="data-table receivables-table">
          <colgroup>
            <col style={{ width: 270 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 105 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 125 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Debtor</th>
              <th>Primary contact</th>
              <th>Invoices</th>
              <th>Outstanding</th>
              <th>Overdue</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {result.data.map((debtor) => (
              <tr key={debtor.id}>
                <td>
                  <span className="entity-cell">
                    <Avatar label={initials(debtor.name)} />
                    <span className="entity-copy">
                      <Link
                        className="blue-link primary-cell"
                        href={`/debtors/${debtor.id}?asOfDate=${result.meta.asOfDate}`}
                      >
                        {debtor.name}
                      </Link>
                      <small>{debtor.code ?? 'No account code'}</small>
                    </span>
                  </span>
                </td>
                <td>
                  <span className="entity-copy">
                    <strong>{debtor.contactName ?? 'No contact name'}</strong>
                    <small>
                      {debtor.email ??
                        debtor.phoneNumber ??
                        'No contact details'}
                    </small>
                  </span>
                </td>
                <td>
                  <span
                    title={`${debtor.summary.openInvoiceCount} open of ${debtor.summary.invoiceCount} total invoices`}
                  >
                    {debtor.summary.openInvoiceCount} open
                  </span>
                </td>
                <td className="money-cell">
                  {formatRupiah(debtor.summary.totalOutstanding)}
                </td>
                <td
                  className={`money-cell ${hasValue(debtor.summary.overdueOutstanding) ? 'tone-critical' : ''}`}
                >
                  {formatRupiah(debtor.summary.overdueOutstanding)}
                </td>
                <td className="muted-cell">
                  {formatBusinessDate(debtor.updatedAt.slice(0, 10))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <DataState
          title={search ? `No accounts match “${search}”` : 'No accounts yet'}
          description={
            search
              ? 'Try a different company name, code, email, or phone number.'
              : 'Import invoice data to create debtor accounts and start tracking receivables.'
          }
          action={
            search ? (
              <Link
                className="control-button"
                href={buildUrl('/debtors', rawSearchParams, {
                  search: null,
                  page: null,
                })}
              >
                Clear search
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

function hasValue(money: string): boolean {
  return money !== '0.00';
}
