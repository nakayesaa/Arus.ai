import { apiRequest } from '../api-client/http';

import {
  importCommitEnvelopeSchema,
  importJobEnvelopeSchema,
  importRowsResponseSchema,
  invoiceImportRowsQuery,
  type InvoiceImportJob,
  type InvoiceImportCommit,
  type InvoiceImportRowResult,
  type InvoiceImportRowsResponse,
} from './contracts';

const PREVIEW_TIMEOUT_MS = 30_000;
const COMMIT_TIMEOUT_MS = 60_000;
const previewJobEnvelopeSchema = importJobEnvelopeSchema.refine(
  ({ data }) => data.status === 'READY' || data.status === 'FAILED',
  { message: 'Preview response must be terminal' },
);

export async function previewInvoiceCsv(
  file: File,
  signal?: AbortSignal,
): Promise<InvoiceImportJob> {
  const formData = new FormData();
  formData.set('file', file);

  const response = await apiRequest(
    '/api/imports/invoices/preview',
    {
      method: 'POST',
      body: formData,
      ...(signal ? { signal } : {}),
    },
    previewJobEnvelopeSchema,
    { timeoutMs: PREVIEW_TIMEOUT_MS },
  );
  return response.data;
}

export function listInvoiceImportRows(
  importJobId: string,
  input: {
    result?: InvoiceImportRowResult | undefined;
    page: number;
    limit: number;
    signal?: AbortSignal | undefined;
  },
): Promise<InvoiceImportRowsResponse> {
  const query = invoiceImportRowsQuery(input);
  return apiRequest(
    `/api/imports/${encodeURIComponent(importJobId)}/rows?${query}`,
    input.signal ? { signal: input.signal } : {},
    importRowsResponseSchema,
  );
}

export async function commitInvoiceImportJob(
  importJobId: string,
  signal?: AbortSignal,
): Promise<InvoiceImportCommit> {
  const response = await apiRequest(
    `/api/imports/${encodeURIComponent(importJobId)}/commit`,
    {
      method: 'POST',
      ...(signal ? { signal } : {}),
    },
    importCommitEnvelopeSchema,
    { timeoutMs: COMMIT_TIMEOUT_MS },
  );
  return response.data;
}
