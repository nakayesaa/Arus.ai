import type { Metadata } from 'next';
import { Download, FileSpreadsheet, UploadCloud } from 'lucide-react';

import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Import' };

export default function ImportPage() {
  return (
    <div className="content-page">
      <PageHeader
        title="Import"
        eyebrow="Invoice CSV"
        description="Validate every row before anything changes in your receivables ledger."
        action={
          <button className="control-button" type="button">
            <Download size={15} /> Download template
          </button>
        }
      />

      <section className="content-grid">
        <div className="panel panel-span-8 dropzone">
          <div className="dropzone-inner">
            <span className="dropzone-icon">
              <UploadCloud size={23} />
            </span>
            <h2>Drop your invoice CSV here</h2>
            <p>or choose a file from your computer · maximum 10 MB</p>
            <button className="primary-button" type="button">
              Choose CSV file
            </button>
          </div>
        </div>

        <aside className="panel panel-span-4">
          <FileSpreadsheet size={20} aria-hidden="true" />
          <h2>Safe import flow</h2>
          <p>Nothing is committed until the validation preview is approved.</p>
          <div className="step-list">
            {[
              ['1', 'Upload canonical CSV'],
              ['2', 'Review valid, invalid, and duplicate rows'],
              ['3', 'Commit validated invoices'],
              ['4', 'Open your collection queue'],
            ].map(([number, label]) => (
              <div className="step-row" key={number}>
                <span className="step-number">{number}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
