import type { Metadata } from 'next';

import { DataPage } from '@/components/data-page';
import { Avatar, Pill, RowCheckbox } from '@/components/table-ui';

export const metadata: Metadata = { title: 'Debtors' };

const debtors = [
  [
    'PT Nusantara Distribusi',
    'ND',
    'finance@nusantara.co.id',
    '8',
    'Rp 714.000.000',
    'Rp 428.000.000',
    'High value',
    'Called 2h ago',
    'Alex',
    'blue',
  ],
  [
    'CV Karya Prima',
    'KP',
    'rina@karyaprima.id',
    '5',
    'Rp 492.500.000',
    'Rp 315.000.000',
    'Broken promise',
    'Email yesterday',
    'Maya',
    'violet',
  ],
  [
    'PT Sinar Abadi Retail',
    'SA',
    'ap@sinarabadi.co.id',
    '7',
    'Rp 438.200.000',
    'Rp 284.500.000',
    'Responsive',
    'WhatsApp 3h ago',
    'Alex',
    'amber',
  ],
  [
    'PT Metro Logistik',
    'ML',
    'bayu@metrologistik.id',
    '4',
    'Rp 346.750.000',
    'Rp 241.750.000',
    'In dispute',
    'Note 1d ago',
    'Dimas',
    'green',
  ],
  [
    'UD Sentosa Makmur',
    'SM',
    'owner@sentosamakmur.id',
    '6',
    'Rp 298.000.000',
    'Rp 176.000.000',
    'Promise active',
    'Called yesterday',
    'Maya',
    'rose',
  ],
  [
    'PT Cipta Pangan Indonesia',
    'CP',
    'ar@ciptapangan.co.id',
    '3',
    'Rp 221.250.000',
    'Rp 148.250.000',
    'Broken promise',
    'Email 2d ago',
    'Alex',
    'violet',
  ],
  [
    'CV Berkat Bersama',
    'BB',
    'lina@berkatbersama.id',
    '2',
    'Rp 136.800.000',
    'Rp 96.800.000',
    'Unresponsive',
    'Called 4d ago',
    'Dimas',
    'blue',
  ],
  [
    'PT Arta Medika',
    'AM',
    'payable@artamedika.co.id',
    '3',
    'Rp 114.500.000',
    'Rp 82.500.000',
    'In dispute',
    'Note yesterday',
    'Maya',
    'green',
  ],
  [
    'PT Prima Teknologi',
    'PT',
    'finance@primatek.id',
    '1',
    'Rp 67.000.000',
    'Rp 67.000.000',
    'New',
    'Imported 5d ago',
    'Alex',
    'amber',
  ],
] as const;

function riskTone(risk: string) {
  if (risk === 'Responsive' || risk === 'Promise active')
    return 'green' as const;
  if (risk === 'In dispute') return 'violet' as const;
  if (risk === 'High value' || risk === 'New') return 'blue' as const;
  return 'red' as const;
}

export default function DebtorsPage() {
  return (
    <DataPage
      title="Debtors"
      recordLabel="28 companies · Rp 3,42 M total AR"
      pageLabel="Page 1 of 2"
      searchPlaceholder="Search debtors"
      primaryLabel="New debtor"
    >
      <table className="data-table">
        <colgroup>
          <col style={{ width: 38 }} />
          <col style={{ width: 220 }} />
          <col style={{ width: 205 }} />
          <col style={{ width: 82 }} />
          <col style={{ width: 132 }} />
          <col style={{ width: 132 }} />
          <col style={{ width: 125 }} />
          <col style={{ width: 125 }} />
          <col style={{ width: 92 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="check-column">
              <RowCheckbox label="Select all debtors" />
            </th>
            <th>Debtor</th>
            <th>Primary contact</th>
            <th>Open</th>
            <th>Total AR</th>
            <th>Overdue</th>
            <th>Risk / tags</th>
            <th>Last activity</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          {debtors.map(
            ([
              name,
              initials,
              email,
              open,
              total,
              overdue,
              risk,
              activity,
              owner,
              tone,
            ]) => (
              <tr key={name}>
                <td className="check-column">
                  <RowCheckbox label={`Select ${name}`} />
                </td>
                <td>
                  <span className="entity-cell">
                    <Avatar
                      label={initials}
                      tone={
                        tone as 'blue' | 'violet' | 'amber' | 'green' | 'rose'
                      }
                    />
                    <a className="blue-link primary-cell" href={`#${initials}`}>
                      {name}
                    </a>
                  </span>
                </td>
                <td className="muted-cell">{email}</td>
                <td>{open}</td>
                <td className="money-cell">{total}</td>
                <td className="money-cell">{overdue}</td>
                <td>
                  <Pill tone={riskTone(risk)}>{risk}</Pill>
                </td>
                <td className="muted-cell">{activity}</td>
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
