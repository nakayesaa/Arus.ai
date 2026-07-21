import { ArrowRight, ReceiptText, SlidersHorizontal } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DataPage } from '@/components/data-page';
import { DataState } from '@/components/data-state';
import { PaginationNav } from '@/components/pagination-nav';
import { Pill } from '@/components/table-ui';
import type {
  CollectionQueueItem,
  CollectionQueueReason,
} from '@/lib/collection-queue/contracts';
import { listCollectionQueue } from '@/lib/collection-queue/server';
import {
  formatBusinessDate,
  formatCompactNumber,
  formatDuePosition,
  formatRupiah,
} from '@/lib/formatters';
import { businessDateQuery, listPage } from '@/lib/receivables/page-query';
import { buildUrl, type PageSearchParams } from '@/lib/url-query';

import styles from './page.module.css';

export const metadata: Metadata = { title: 'Collection Queue' };

const PAGE_SIZE = 25;

interface CollectionQueuePageProps {
  searchParams: Promise<PageSearchParams>;
}

export default async function CollectionQueuePage({
  searchParams,
}: CollectionQueuePageProps) {
  const rawSearchParams = await searchParams;
  const requestedDate = businessDateQuery(rawSearchParams);
  const page = listPage(rawSearchParams);
  const result = await listCollectionQueue({
    ...(requestedDate ? { asOfDate: requestedDate } : {}),
    page,
    limit: PAGE_SIZE,
  });

  if (
    (result.pagination.totalPages === 0 && page > 1) ||
    (result.pagination.totalPages > 0 && page > result.pagination.totalPages)
  ) {
    redirect(
      buildUrl('/collection-queue', rawSearchParams, {
        page: Math.max(result.pagination.totalPages, 1),
      }),
    );
  }

  const asOfDate = result.meta.asOfDate;
  const recordLabel = `${formatCompactNumber(result.pagination.total)} ${
    result.pagination.total === 1 ? 'invoice' : 'invoices'
  } prioritized`;

  return (
    <DataPage
      title="Collection Queue"
      recordLabel={recordLabel}
      pageLabel={`As of ${formatBusinessDate(asOfDate)} · Highest exact score first`}
      toolbar={
        <Link
          className="control-button"
          href={`/invoices?asOfDate=${asOfDate}`}
        >
          <ReceiptText size={14} aria-hidden="true" />
          Invoice ledger
        </Link>
      }
      footer={
        <PaginationNav
          path="/collection-queue"
          searchParams={rawSearchParams}
          page={result.pagination.page}
          totalPages={result.pagination.totalPages}
          total={result.pagination.total}
        />
      }
    >
      {result.data.length > 0 ? (
        <QueueTable items={result.data} asOfDate={asOfDate} />
      ) : (
        <DataState
          title="No invoices require action"
          description="There are no overdue, due follow-up, due promise, broken promise, or uncontacted due-soon invoices for this business date."
          action={
            <Link
              className="control-button"
              href={`/invoices?asOfDate=${asOfDate}`}
            >
              Review invoice ledger
            </Link>
          }
        />
      )}
    </DataPage>
  );
}

function QueueTable({
  items,
  asOfDate,
}: {
  items: CollectionQueueItem[];
  asOfDate: string;
}) {
  return (
    <table className={`data-table aligned-data-table ${styles.table}`}>
      <caption className={styles.method}>
        <span className={styles.methodIcon} aria-hidden="true">
          <SlidersHorizontal size={15} />
        </span>
        <span>
          <strong>Deterministic priority</strong>
          <small>
            Amount + aging + stale contact + promise + due-soon. Ties use oldest
            due date, largest balance, then invoice ID.
          </small>
        </span>
      </caption>
      <colgroup>
        <col style={{ width: 170 }} />
        <col style={{ width: 230 }} />
        <col style={{ width: 155 }} />
        <col style={{ width: 145 }} />
        <col style={{ width: 190 }} />
        <col style={{ width: 300 }} />
        <col style={{ width: 45 }} />
      </colgroup>
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Debtor</th>
          <th>Outstanding</th>
          <th>Aging</th>
          <th>Queue trigger</th>
          <th>Priority anatomy</th>
          <th aria-label="Open invoice" />
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <QueueRow item={item} asOfDate={asOfDate} key={item.id} />
        ))}
      </tbody>
    </table>
  );
}

function QueueRow({
  item,
  asOfDate,
}: {
  item: CollectionQueueItem;
  asOfDate: string;
}) {
  const href = `/invoices/${item.id}?asOfDate=${asOfDate}`;
  const primaryReason = item.reasons[0];
  if (!primaryReason) {
    throw new Error('Eligible collection queue item must include a reason');
  }

  return (
    <tr>
      <td>
        <span className={styles.identity}>
          <Link className="blue-link primary-cell" href={href}>
            {item.invoiceNumber}
          </Link>
          <small>Due {formatBusinessDate(item.dueDate)}</small>
        </span>
      </td>
      <td>
        <span className="entity-copy">
          <strong>{item.debtor.name}</strong>
          <small>{item.debtor.code ?? 'No account code'}</small>
        </span>
      </td>
      <td className="money-cell">{formatRupiah(item.outstandingAmount)}</td>
      <td>
        <Pill tone={agingTone(item.aging.daysOverdue)}>
          {formatDuePosition(item.aging)}
        </Pill>
      </td>
      <td>
        <span className={styles.trigger} data-tone={reasonTone(primaryReason)}>
          <span aria-hidden="true" />
          <strong>{reasonLabel(primaryReason)}</strong>
          {item.reasons.length > 1 && (
            <small>+{item.reasons.length - 1} signal</small>
          )}
        </span>
      </td>
      <td>
        <PriorityAnatomy item={item} />
      </td>
      <td>
        <Link
          className={styles.openInvoice}
          href={href}
          aria-label={`Open ${item.invoiceNumber}`}
        >
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function PriorityAnatomy({ item }: { item: CollectionQueueItem }) {
  const components = [
    { label: 'Amount', value: item.priority.components.amount },
    { label: 'Aging', value: item.priority.components.aging },
    {
      label: item.lastContactDate ? 'Stale' : 'No contact',
      value: item.priority.components.stale,
    },
    { label: 'Promise', value: item.priority.components.promise },
    { label: 'Due soon', value: item.priority.components.dueSoon },
  ].filter((component) => component.value !== '0.00');
  const explanation = components
    .map((component) => `${component.label} ${component.value}`)
    .join(', ');

  return (
    <span
      className={styles.priority}
      aria-label={`Priority score ${item.priority.score}: ${explanation}`}
    >
      <span className={styles.score} aria-hidden="true">
        <strong>{item.priority.score}</strong>
        <small>Exact score</small>
      </span>
      <span className={styles.factors} aria-hidden="true">
        {components.map((component) => (
          <span className={styles.factor} key={component.label}>
            <small>{component.label}</small>
            <strong>{component.value}</strong>
          </span>
        ))}
      </span>
    </span>
  );
}

function reasonLabel(reason: CollectionQueueReason): string {
  const labels: Record<CollectionQueueReason, string> = {
    PROMISE_BROKEN: 'Broken promise',
    PROMISE_DUE: 'Promise due',
    FOLLOW_UP_DUE: 'Follow-up due',
    OVERDUE: 'Overdue',
    DUE_SOON_UNCONTACTED: 'Due soon · uncontacted',
  };
  return labels[reason];
}

function reasonTone(
  reason: CollectionQueueReason,
): 'critical' | 'attention' | 'scheduled' {
  if (reason === 'PROMISE_BROKEN' || reason === 'OVERDUE') return 'critical';
  if (reason === 'PROMISE_DUE' || reason === 'FOLLOW_UP_DUE') {
    return 'attention';
  }
  return 'scheduled';
}

function agingTone(daysOverdue: number): 'blue' | 'amber' | 'red' {
  if (daysOverdue === 0) return 'blue';
  if (daysOverdue <= 30) return 'amber';
  return 'red';
}
