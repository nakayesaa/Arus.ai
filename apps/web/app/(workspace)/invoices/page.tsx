import type { Metadata } from 'next';

import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = {
  title: 'Invoices',
};

const columns = [
  'Due date',
  'Invoice',
  'Debtor',
  'Original',
  'Outstanding',
  'State',
  'Aging',
] as const;

export default function InvoicesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Receivables"
        title="Invoices"
        description="Telusuri setiap balance ke invoice, allocation, dan collection history."
      />

      <section className="table-card" aria-label="Invoice list">
        <div className="table-toolbar">
          <input
            className="input"
            type="search"
            placeholder="Cari invoice atau debtor"
            aria-label="Cari invoice atau debtor"
          />
          <button className="button button-secondary" type="button">
            Filters
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="table-empty" colSpan={columns.length}>
                  Belum ada invoice. Import canonical CSV untuk memulai.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
