import { ArrowLeft, Building2 } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { Pill } from '@/components/table-ui';
import { ApiClientError } from '@/lib/api-client/errors';
import { formatBusinessDate, formatRupiah } from '@/lib/formatters';
import { paymentEntityIdSchema, type Payment } from '@/lib/payments/contracts';
import { getPayment } from '@/lib/payments/server';

import styles from '../payments.module.css';

export const metadata: Metadata = { title: 'Payment details' };

interface PaymentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PaymentDetailPage({
  params,
}: PaymentDetailPageProps) {
  const { id } = await params;
  const parsedId = paymentEntityIdSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const payment = await paymentOrNotFound(parsedId.data);
  const allocationTotal = sumAllocations(payment);

  return (
    <section className="record-page">
      <header className="record-topbar">
        <div>
          <Link className="record-back-link" href="/payments">
            <ArrowLeft size={14} aria-hidden="true" />
            Payments
          </Link>
          <div className="record-title-line">
            <h1>{paymentLabel(payment.id)}</h1>
            <Pill tone={payment.isOpeningBalance ? 'neutral' : 'green'}>
              {payment.isOpeningBalance ? 'Opening balance' : 'Allocated'}
            </Pill>
          </div>
          <p>Recorded {formatBusinessDate(payment.createdAt.slice(0, 10))}</p>
        </div>
        <div className="page-actions">
          <Link
            className="primary-button"
            href={`/debtors/${payment.debtor.id}`}
          >
            <Building2 size={14} aria-hidden="true" />
            {payment.debtor.name}
          </Link>
        </div>
      </header>

      <div className="record-content">
        <section className="record-metrics" aria-label="Payment summary">
          <SummaryMetric label="Payment" value={formatRupiah(payment.amount)} />
          <SummaryMetric
            label="Allocated"
            value={formatRupiah(allocationTotal)}
          />
          <SummaryMetric
            label="Payment date"
            value={formatBusinessDate(payment.paymentDate)}
          />
          <SummaryMetric
            label="Invoices"
            value={String(payment.allocations.length)}
          />
        </section>

        <div className="record-layout">
          <div className={styles.detailMain}>
            <section className="record-panel record-ledger">
              <header className="record-panel-header">
                <div>
                  <h2>Allocation evidence</h2>
                  <p>Every amount remains traceable to its target invoice.</p>
                </div>
              </header>
              <div className="record-table-wrap">
                <table className="data-table allocation-table">
                  <colgroup>
                    <col style={{ width: 220 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 140 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Allocation date</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payment.allocations.map((allocation) => (
                      <tr key={allocation.id}>
                        <td>
                          <Link
                            className="blue-link"
                            href={`/invoices/${allocation.invoice.id}`}
                          >
                            {allocation.invoice.invoiceNumber}
                          </Link>
                        </td>
                        <td className="muted-cell">
                          {formatBusinessDate(allocation.allocationDate)}
                        </td>
                        <td className="money-cell">
                          {formatRupiah(allocation.amount)}
                        </td>
                        <td>
                          <Pill tone={allocation.reversedAt ? 'red' : 'green'}>
                            {allocation.reversedAt ? 'Reversed' : 'Active'}
                          </Pill>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className={styles.detailRail}>
            <section className="record-panel">
              <header className="record-panel-header">
                <div>
                  <h2>Payment details</h2>
                  <p>Operator-entered references and record provenance.</p>
                </div>
              </header>
              <dl className="record-properties">
                <Property label="Debtor" value={payment.debtor.name} />
                <Property
                  label="Payer reference"
                  value={
                    <span className={styles.referenceValue}>
                      {payment.payerReference ?? 'Opening balance import'}
                    </span>
                  }
                />
                <Property
                  label="Bank reference"
                  value={
                    <span className={styles.referenceValue}>
                      {payment.bankReference ?? 'Not provided'}
                    </span>
                  }
                />
                <Property label="Recorded by" value={payment.createdBy.name} />
                <Property
                  label="Created"
                  value={formatBusinessDate(payment.createdAt.slice(0, 10))}
                />
              </dl>
            </section>
            <p className={styles.truthNote}>
              <strong>Operational payment record</strong>
              This allocation updates Arus outstanding. It does not claim the
              client accounting ledger or bank statement has reconciled.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
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

function sumAllocations(payment: Payment): string {
  const minorUnits = payment.allocations.reduce((total, allocation) => {
    if (allocation.reversedAt) return total;
    const [integer = '0', fraction = '00'] = allocation.amount.split('.');
    return total + BigInt(integer) * 100n + BigInt(fraction);
  }, 0n);
  return `${minorUnits / 100n}.${String(minorUnits % 100n).padStart(2, '0')}`;
}

function paymentLabel(id: string): string {
  return `PAY-${id.slice(0, 8).toLocaleUpperCase('en-US')}`;
}

async function paymentOrNotFound(id: string): Promise<Payment> {
  try {
    return (await getPayment(id)).data;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }
}
