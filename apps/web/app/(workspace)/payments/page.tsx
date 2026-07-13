import type { Metadata } from 'next';

import { DataPage } from '@/components/data-page';
import { Pill, RowCheckbox } from '@/components/table-ui';

export const metadata: Metadata = { title: 'Payments' };

const payments = [
  [
    '14 Jul 2026',
    'PAY-0072',
    'PT Nusantara Distribusi',
    'INV-2026-081',
    'Rp 120.000.000',
    'Allocated',
    'Alex',
  ],
  [
    '14 Jul 2026',
    'PAY-0071',
    'PT Sinar Abadi Retail',
    'INV-2026-069',
    'Rp 85.500.000',
    'Allocated',
    'Maya',
  ],
  [
    '13 Jul 2026',
    'PAY-0070',
    'UD Sentosa Makmur',
    'INV-2026-047',
    'Rp 64.000.000',
    'Allocated',
    'Alex',
  ],
  [
    '12 Jul 2026',
    'PAY-0069',
    'CV Karya Prima',
    'INV-2026-074',
    'Rp 50.000.000',
    'Allocated',
    'Dimas',
  ],
  [
    '11 Jul 2026',
    'PAY-0068',
    'PT Metro Logistik',
    'INV-2026-052',
    'Rp 46.750.000',
    'Review',
    'Maya',
  ],
  [
    '10 Jul 2026',
    'PAY-0067',
    'PT Cipta Pangan Indonesia',
    'INV-2026-031',
    'Rp 42.000.000',
    'Allocated',
    'Alex',
  ],
  [
    '09 Jul 2026',
    'PAY-0066',
    'CV Berkat Bersama',
    'INV-2026-022',
    'Rp 31.800.000',
    'Allocated',
    'Dimas',
  ],
  [
    '08 Jul 2026',
    'PAY-0065',
    'PT Arta Medika',
    'INV-2026-014',
    'Rp 28.000.000',
    'Unallocated',
    'Maya',
  ],
  [
    '07 Jul 2026',
    'PAY-0064',
    'PT Prima Teknologi',
    'INV-2026-008',
    'Rp 18.000.000',
    'Allocated',
    'Alex',
  ],
] as const;

export default function PaymentsPage() {
  return (
    <DataPage
      title="Payments"
      recordLabel="31 records · Rp 486 jt this week"
      pageLabel="Page 1 of 2"
      searchPlaceholder="Search payments"
      primaryLabel="Record payment"
    >
      <table className="data-table">
        <colgroup>
          <col style={{ width: 38 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 220 }} />
          <col style={{ width: 138 }} />
          <col style={{ width: 135 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="check-column">
              <RowCheckbox label="Select all payments" />
            </th>
            <th>Date</th>
            <th>Reference</th>
            <th>Debtor</th>
            <th>Invoice</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Recorded by</th>
          </tr>
        </thead>
        <tbody>
          {payments.map(
            ([date, reference, debtor, invoice, amount, status, owner]) => (
              <tr key={reference}>
                <td className="check-column">
                  <RowCheckbox label={`Select ${reference}`} />
                </td>
                <td className="muted-cell">{date}</td>
                <td>
                  <a className="blue-link" href={`#${reference}`}>
                    {reference}
                  </a>
                </td>
                <td>
                  <span className="entity-cell">
                    <span className="entity-icon">CO</span>
                    <strong>{debtor}</strong>
                  </span>
                </td>
                <td className="blue-link">{invoice}</td>
                <td className="money-cell">{amount}</td>
                <td>
                  <Pill
                    tone={
                      status === 'Allocated'
                        ? 'green'
                        : status === 'Review'
                          ? 'amber'
                          : 'red'
                    }
                  >
                    {status}
                  </Pill>
                </td>
                <td>
                  <span className="entity-cell">
                    <span className="avatar avatar-alex">
                      {owner.slice(0, 2).toUpperCase()}
                    </span>
                    {owner}
                  </span>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </DataPage>
  );
}
