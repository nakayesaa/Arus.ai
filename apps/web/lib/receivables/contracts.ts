import { z } from 'zod';

export const invoiceStates = ['OPEN', 'PARTIALLY_PAID', 'PAID'] as const;
export const agingBuckets = [
  'CURRENT',
  'OVERDUE_1_7',
  'OVERDUE_8_30',
  'OVERDUE_31_60',
  'OVERDUE_61_90',
  'OVERDUE_90_PLUS',
] as const;

const moneySchema = z.string().regex(/^\d+\.\d{2}$/);
const businessDateSchema = z.iso.date();
const timestampSchema = z.iso.datetime({ offset: true });
const nullableText = (maximum: number) => z.string().max(maximum).nullable();
const countSchema = z.number().int().nonnegative();

export const invoiceStateSchema = z.enum(invoiceStates);
export const agingBucketSchema = z.enum(agingBuckets);

const paginationSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().min(1).max(100),
  total: countSchema,
  totalPages: countSchema,
});

const responseMetaSchema = z.object({
  asOfDate: businessDateSchema,
});

const debtorSummarySchema = z.object({
  invoiceCount: countSchema,
  openInvoiceCount: countSchema,
  totalOutstanding: moneySchema,
  overdueOutstanding: moneySchema,
});

const debtorSchema = z.object({
  id: z.uuid(),
  code: nullableText(50),
  name: z.string().min(1).max(200),
  contactName: nullableText(200),
  phoneNumber: nullableText(50),
  email: nullableText(320),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const invoiceAgingSchema = z.object({
  bucket: agingBucketSchema,
  daysToDue: z.number().int(),
  daysOverdue: countSchema,
  flags: z.array(z.enum(['DUE_SOON', 'DUE_TODAY', 'OVERDUE'])).max(3),
});

export const invoiceSchema = z.object({
  id: z.uuid(),
  debtor: z.object({
    id: z.uuid(),
    code: nullableText(50),
    name: z.string().min(1).max(200),
  }),
  invoiceNumber: z.string().min(1).max(100),
  invoiceDate: businessDateSchema,
  dueDate: businessDateSchema,
  originalAmount: moneySchema,
  allocatedAmount: moneySchema,
  outstandingAmount: moneySchema,
  state: invoiceStateSchema,
  aging: invoiceAgingSchema,
  description: nullableText(2_000),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const allocationSchema = z.object({
  id: z.uuid(),
  amount: moneySchema,
  allocationDate: businessDateSchema,
  reversedAt: timestampSchema.nullable(),
  reversalReason: nullableText(500),
  payment: z.object({
    id: z.uuid(),
    paymentDate: businessDateSchema,
    amount: moneySchema,
    bankReference: nullableText(200),
    isOpeningBalance: z.boolean(),
  }),
});

export const debtorListResponseSchema = z.object({
  data: z.array(debtorSchema.extend({ summary: debtorSummarySchema })).max(100),
  pagination: paginationSchema,
  meta: responseMetaSchema,
});

export const debtorDetailResponseSchema = z.object({
  data: debtorSchema.extend({
    summary: debtorSummarySchema,
    invoices: z.array(invoiceSchema).max(10_000),
  }),
  meta: responseMetaSchema,
});

export const invoiceListResponseSchema = z.object({
  data: z.array(invoiceSchema).max(100),
  pagination: paginationSchema,
  meta: responseMetaSchema,
});

export const invoiceDetailResponseSchema = z.object({
  data: invoiceSchema.extend({
    allocations: z.array(allocationSchema).max(10_000),
  }),
  meta: responseMetaSchema,
});

export type InvoiceState = z.infer<typeof invoiceStateSchema>;
export type AgingBucket = z.infer<typeof agingBucketSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type DebtorListResponse = z.infer<typeof debtorListResponseSchema>;
export type DebtorDetailResponse = z.infer<typeof debtorDetailResponseSchema>;
export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;
export type InvoiceDetailResponse = z.infer<typeof invoiceDetailResponseSchema>;

interface ListQuery {
  search?: string | undefined;
  asOfDate?: string | undefined;
  page: number;
  limit: number;
}

export interface InvoiceListQuery extends ListQuery {
  debtorId?: string | undefined;
  state?: InvoiceState | undefined;
  agingBucket?: AgingBucket | undefined;
}

export function receivablesQuery(query: ListQuery | InvoiceListQuery): string {
  const searchParams = new URLSearchParams();
  const search = query.search?.trim();
  if (search) searchParams.set('search', search);
  if (query.asOfDate) searchParams.set('asOfDate', query.asOfDate);
  if ('debtorId' in query && query.debtorId) {
    searchParams.set('debtorId', query.debtorId);
  }
  if ('state' in query && query.state) {
    searchParams.set('state', query.state);
  }
  if ('agingBucket' in query && query.agingBucket) {
    searchParams.set('agingBucket', query.agingBucket);
  }
  searchParams.set('page', String(query.page));
  searchParams.set('limit', String(query.limit));
  return searchParams.toString();
}
