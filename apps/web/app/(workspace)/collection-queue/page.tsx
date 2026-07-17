import type { Metadata } from 'next';
import { MessageSquareText } from 'lucide-react';

import { DataPage } from '@/components/data-page';
import { Pill, RowCheckbox, Score } from '@/components/table-ui';

export const metadata: Metadata = { title: 'Collection Queue' };

const queue = [
  [
    'INV-2026-074',
    'CV Karya Prima',
    'Rp 315.000.000',
    '8–30 days',
    'Broken promise',
    'Today, 09:30',
    96,
    'Email yesterday',
  ],
  [
    'INV-2026-031',
    'PT Cipta Pangan Indonesia',
    'Rp 148.250.000',
    '31–60 days',
    'Broken promise',
    'Today, 10:00',
    93,
    'Called 2d ago',
  ],
  [
    'INV-2026-052',
    'PT Metro Logistik',
    'Rp 241.750.000',
    '31–60 days',
    'Dispute aging',
    'Today, 11:00',
    89,
    'Note yesterday',
  ],
  [
    'INV-2026-081',
    'PT Nusantara Distribusi',
    'Rp 428.000.000',
    '1–7 days',
    'High value',
    'Today, 13:00',
    87,
    'Called 2h ago',
  ],
  [
    'INV-2026-069',
    'PT Sinar Abadi Retail',
    'Rp 284.500.000',
    '8–30 days',
    'No response',
    'Today, 14:00',
    84,
    'WhatsApp 3h ago',
  ],
  [
    'INV-2026-022',
    'CV Berkat Bersama',
    'Rp 96.800.000',
    '61–90 days',
    'No response',
    'Today, 16:00',
    81,
    'Called 4d ago',
  ],
  [
    'INV-2026-014',
    'PT Arta Medika',
    'Rp 82.500.000',
    '90+ days',
    'Dispute aging',
    'Tomorrow, 09:00',
    78,
    'Note yesterday',
  ],
  [
    'INV-2026-047',
    'UD Sentosa Makmur',
    'Rp 176.000.000',
    '31–60 days',
    'Promise due',
    'Tomorrow, 10:30',
    74,
    'Called yesterday',
  ],
  [
    'INV-2026-008',
    'PT Prima Teknologi',
    'Rp 67.000.000',
    '90+ days',
    'No response',
    '17 Jul, 09:00',
    71,
    'Email 5d ago',
  ],
] as const;

function triggerTone(trigger: string) {
  if (trigger === 'Broken promise' || trigger === 'No response')
    return 'red' as const;
  if (trigger === 'Dispute aging') return 'violet' as const;
  if (trigger === 'Promise due') return 'green' as const;
  return 'blue' as const;
}

export default function CollectionQueuePage() {
  return (
    <DataPage
      title="Collection Queue"
      recordLabel="24 actions awaiting human review"
      pageLabel="Sorted by risk and due time"
      primaryLabel="Review selected"
      extraAction={
        <button className="control-button" type="button">
          <MessageSquareText size={14} />
          Activity
        </button>
      }
    >
      <table className="data-table aligned-data-table collection-queue-table">
        <colgroup>
          <col className="queue-selection-column" />
          <col style={{ width: 135 }} />
          <col style={{ width: 210 }} />
          <col style={{ width: 132 }} />
          <col style={{ width: 105 }} />
          <col style={{ width: 125 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 95 }} />
          <col style={{ width: 130 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="check-column">
              <RowCheckbox label="Select all collection tasks" />
            </th>
            <th>Invoice</th>
            <th>Debtor</th>
            <th>Outstanding</th>
            <th>Aging</th>
            <th>Trigger</th>
            <th>Next follow-up</th>
            <th>Score</th>
            <th>Last contact</th>
          </tr>
        </thead>
        <tbody>
          {queue.map(
            ([
              invoice,
              debtor,
              outstanding,
              aging,
              trigger,
              next,
              score,
              contact,
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
                <td className="money-cell">{outstanding}</td>
                <td>
                  <Pill
                    tone={
                      aging === '1–7 days' || aging === '8–30 days'
                        ? 'amber'
                        : 'red'
                    }
                  >
                    {aging}
                  </Pill>
                </td>
                <td>
                  <Pill tone={triggerTone(trigger)}>{trigger}</Pill>
                </td>
                <td className="blue-link">{next}</td>
                <td>
                  <Score value={score} />
                </td>
                <td className="muted-cell">{contact}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </DataPage>
  );
}
