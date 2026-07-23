import { z } from 'zod';

export const paymentEntityIdSchema = z.uuid();
export const paymentBusinessDateSchema = z.iso.date();
export const paymentMoneySchema = z.string().regex(/^\d+\.\d{2}$/);
const timestampSchema = z.iso.datetime({ offset: true });
const nullableText = (maximum: number) => z.string().max(maximum).nullable();
const paymentPaginationSchema = z
  .object({
    page: z.number().int().positive(),
    limit: z.number().int().min(1).max(100),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const paymentSchema = z
  .object({
    id: paymentEntityIdSchema,
    debtor: z
      .object({
        id: paymentEntityIdSchema,
        code: nullableText(50),
        name: z.string().min(1).max(200),
      })
      .strict(),
    paymentDate: paymentBusinessDateSchema,
    amount: paymentMoneySchema,
    payerReference: nullableText(100),
    bankReference: nullableText(100),
    isOpeningBalance: z.boolean(),
    createdBy: z
      .object({
        id: paymentEntityIdSchema,
        name: z.string().min(1).max(200),
      })
      .strict(),
    allocations: z
      .array(
        z
          .object({
            id: paymentEntityIdSchema,
            amount: paymentMoneySchema,
            allocationDate: paymentBusinessDateSchema,
            reversedAt: timestampSchema.nullable(),
            reversalReason: nullableText(500),
            invoice: z
              .object({
                id: paymentEntityIdSchema,
                invoiceNumber: z.string().min(1).max(100),
              })
              .strict(),
          })
          .strict(),
      )
      .max(100),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

export const paymentListResponseSchema = z
  .object({
    data: z.array(paymentSchema).max(100),
    pagination: paymentPaginationSchema,
  })
  .strict();

export const paymentDetailResponseSchema = z
  .object({ data: paymentSchema })
  .strict();

export const recordPaymentInputSchema = z
  .object({
    paymentDate: paymentBusinessDateSchema,
    amount: paymentMoneySchema,
    payerReference: z.string().trim().min(1).max(100),
    bankReference: z.string().trim().min(1).max(100).nullable(),
  })
  .strict();

export const recordPaymentResponseSchema = z
  .object({
    data: paymentSchema,
    invoice: z
      .object({
        id: paymentEntityIdSchema,
        invoiceNumber: z.string().min(1).max(100),
        originalAmount: paymentMoneySchema,
        allocatedAmount: paymentMoneySchema,
        outstandingAmount: paymentMoneySchema,
        state: z.enum(['OPEN', 'PARTIALLY_PAID', 'PAID']),
      })
      .strict(),
    fulfilledPromiseIds: z.array(paymentEntityIdSchema).max(10_000),
    replayed: z.boolean(),
  })
  .strict();

export interface PaymentListQuery {
  from?: string | undefined;
  to?: string | undefined;
  page: number;
  limit: number;
}

export function paymentListQuery(query: PaymentListQuery): string {
  const search = new URLSearchParams();
  if (query.from)
    search.set('from', paymentBusinessDateSchema.parse(query.from));
  if (query.to) search.set('to', paymentBusinessDateSchema.parse(query.to));
  search.set('page', String(query.page));
  search.set('limit', String(query.limit));
  return search.toString();
}

export type Payment = z.infer<typeof paymentSchema>;
export type PaymentListResponse = z.infer<typeof paymentListResponseSchema>;
export type PaymentDetailResponse = z.infer<typeof paymentDetailResponseSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentInputSchema>;
export type RecordPaymentResponse = z.infer<typeof recordPaymentResponseSchema>;
