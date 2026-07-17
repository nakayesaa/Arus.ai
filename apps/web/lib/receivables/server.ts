import { serverApiRequest } from '@/lib/api-client/server';

import {
  debtorDetailResponseSchema,
  debtorListResponseSchema,
  invoiceDetailResponseSchema,
  invoiceListResponseSchema,
  receivablesQuery,
  type DebtorDetailResponse,
  type DebtorListResponse,
  type InvoiceDetailResponse,
  type InvoiceListQuery,
  type InvoiceListResponse,
} from './contracts';

interface DebtorListQuery {
  search?: string | undefined;
  asOfDate?: string | undefined;
  page: number;
  limit: number;
}

export function listDebtors(
  query: DebtorListQuery,
): Promise<DebtorListResponse> {
  return serverApiRequest(
    `/api/debtors?${receivablesQuery(query)}`,
    debtorListResponseSchema,
  );
}

export function getDebtor(
  debtorId: string,
  asOfDate?: string,
): Promise<DebtorDetailResponse> {
  return serverApiRequest(
    detailPath('/api/debtors', debtorId, asOfDate),
    debtorDetailResponseSchema,
  );
}

export function listInvoices(
  query: InvoiceListQuery,
): Promise<InvoiceListResponse> {
  return serverApiRequest(
    `/api/invoices?${receivablesQuery(query)}`,
    invoiceListResponseSchema,
  );
}

export function getInvoice(
  invoiceId: string,
  asOfDate?: string,
): Promise<InvoiceDetailResponse> {
  return serverApiRequest(
    detailPath('/api/invoices', invoiceId, asOfDate),
    invoiceDetailResponseSchema,
  );
}

function detailPath(
  resource: '/api/debtors' | '/api/invoices',
  id: string,
  asOfDate: string | undefined,
): `/api/${string}` {
  const query = new URLSearchParams();
  if (asOfDate) query.set('asOfDate', asOfDate);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return `${resource}/${encodeURIComponent(id)}${suffix}`;
}
