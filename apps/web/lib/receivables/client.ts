import { apiRequest } from '../api-client/http';

import {
  invoiceListResponseSchema,
  receivablesQuery,
  type AgingBucket,
  type InvoiceListResponse,
} from './contracts';

export function listInvoices(input: {
  agingBucket: AgingBucket;
  outstandingOnly: boolean;
  asOfDate: string;
  page: number;
  limit: number;
  signal?: AbortSignal | undefined;
}): Promise<InvoiceListResponse> {
  const query = receivablesQuery({
    agingBucket: input.agingBucket,
    outstandingOnly: input.outstandingOnly,
    asOfDate: input.asOfDate,
    page: input.page,
    limit: input.limit,
  });

  return apiRequest(
    `/api/invoices?${query}`,
    input.signal ? { signal: input.signal } : {},
    invoiceListResponseSchema,
  );
}
