import { Download } from 'lucide-react';
import type { Metadata } from 'next';

import { InvoiceImportPreview } from '@/components/imports/invoice-import-preview';
import { PageHeader } from '@/components/page-header';
import { requireServerSession } from '@/lib/auth/server';

import styles from './page.module.css';

export const metadata: Metadata = { title: 'Import' };

export default async function ImportPage() {
  const session = await requireServerSession();
  return (
    <div className={styles.page}>
      <PageHeader
        title="Import invoices"
        description="Check a canonical CSV for data quality, debtor matches, and duplicate invoices before anything reaches your receivables ledger."
        action={
          <a
            className="control-button"
            href="/templates/invoice-import-template.csv"
            download
          >
            <Download size={15} aria-hidden="true" />
            Download template
          </a>
        }
      />

      <InvoiceImportPreview organizationName={session.organization.name} />
    </div>
  );
}
