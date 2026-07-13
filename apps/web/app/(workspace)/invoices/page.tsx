import type { Metadata } from 'next';

import { DataPage } from '@/components/data-page';
import { Pill, RowCheckbox } from '@/components/table-ui';

export const metadata: Metadata = { title: 'Invoices' };

const invoices = [
  [
    'INV-2026-081',
    'PT Nusantara Distribusi',
    '12 Jul 2026',
    'Rp 428.000.000',
    'Partially paid',
    '1–7 days',
    'Tomorrow',
    'Alex',
  ],
  [
    'INV-2026-074',
    'CV Karya Prima',
    '05 Jul 2026',
    'Rp 315.000.000',
    'Open',
    '8–30 days',
    'Broken promise',
    'Maya',
  ],
  [
    'INV-2026-069',
    'PT Sinar Abadi Retail',
    '28 Jun 2026',
    'Rp 284.500.000',
    'Open',
    '8–30 days',
    'Today, 14:00',
    'Alex',
  ],
  [
    'INV-2026-052',
    'PT Metro Logistik',
    '14 Jun 2026',
    'Rp 241.750.000',
    'Disputed',
    '31–60 days',
    'Awaiting reply',
    'Dimas',
  ],
  [
    'INV-2026-047',
    'UD Sentosa Makmur',
    '08 Jun 2026',
    'Rp 176.000.000',
    'Partially paid',
    '31–60 days',
    '16 Jul 2026',
    'Maya',
  ],
  [
    'INV-2026-031',
    'PT Cipta Pangan Indonesia',
    '29 May 2026',
    'Rp 148.250.000',
    'Open',
    '31–60 days',
    'Broken promise',
    'Alex',
  ],
  [
    'INV-2026-022',
    'CV Berkat Bersama',
    '11 May 2026',
    'Rp 96.800.000',
    'Open',
    '61–90 days',
    'Today, 16:00',
    'Dimas',
  ],
  [
    'INV-2026-014',
    'PT Arta Medika',
    '20 Apr 2026',
    'Rp 82.500.000',
    'Disputed',
    '90+ days',
    'Legal review',
    'Maya',
  ],
  [
    'INV-2026-008',
    'PT Prima Teknologi',
    '04 Apr 2026',
    'Rp 67.000.000',
    'Open',
    '90+ days',
    '17 Jul 2026',
    'Alex',
  ],
] as const;

function statusTone(status: string) {
  if (status === 'Partially paid') return 'blue' as const;
  if (status === 'Disputed') return 'violet' as const;
  return 'neutral' as const;
}

function agingTone(aging: string) {
  if (aging === '1–7 days') return 'amber' as const;
  if (aging === '8–30 days') return 'amber' as const;
  return 'red' as const;
}

export default function InvoicesPage() {
  return (
    <DataPage
      title="Invoices"
      recordLabel="80 records · 7 aging fields"
      pageLabel="Page 1 of 4"
      searchPlaceholder="Search invoices"
      primaryLabel="Import CSV"
    >
      <table className="data-table">
        <colgroup>
          <col style={{ width: 38 }} />
          <col style={{ width: 135 }} />
          <col style={{ width: 205 }} />
          <col style={{ width: 105 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 112 }} />
          <col style={{ width: 102 }} />
          <col style={{ width: 125 }} />
          <col style={{ width: 90 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="check-column">
              <RowCheckbox label="Select all invoices" />
            </th>
            <th>Invoice</th>
            <th>Debtor</th>
            <th>Due date</th>
            <th>Outstanding</th>
            <th>Status</th>
            <th>Aging</th>
            <th>Next follow-up</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map(
            ([
              invoice,
              debtor,
              due,
              amount,
              status,
              aging,
              followUp,
              owner,
            ]) => (
              <tr key={invoice}>
                <td className="check-column">
                  <RowCheckbox label={`Select ${invoice}`} />
                </td>
                <td>
                  <a className="blue-link" href={`#${invoice}`}>
                    {invoice}
                  </a>
                </td>
                <td>
                  <span className="entity-cell">
                    <span className="entity-icon">CO</span>
                    <strong>{debtor}</strong>
                  </span>
                </td>
                <td className="muted-cell">{due}</td>
                <td className="money-cell">{amount}</td>
                <td>
                  <Pill tone={statusTone(status)}>{status}</Pill>
                </td>
                <td>
                  <Pill tone={agingTone(aging)}>{aging}</Pill>
                </td>
                <td
                  className={
                    followUp === 'Broken promise' ? 'blue-link' : 'muted-cell'
                  }
                >
                  {followUp}
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
