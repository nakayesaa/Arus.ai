import type { Metadata } from 'next';

import { InvoiceCaseWorkspace } from '@/components/invoice-case-workspace';

export const metadata: Metadata = {
  title: 'INV-2026-0418 · PT Sinar Abadi Retail',
};

export default function InvoiceCasePage() {
  return <InvoiceCaseWorkspace />;
}
