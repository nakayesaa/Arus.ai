import { z } from 'zod';

import { agingBuckets, invoiceStates } from '../receivables/contracts';

const exactDecimalSchema = z.string().regex(/^\d+\.\d{2}$/);
const countSchema = z.number().int().min(0).max(10_000);
const nullableDateSchema = z.iso.date().nullable();

export const collectionQueueReasons = [
  'PROMISE_BROKEN',
  'PROMISE_DUE',
  'FOLLOW_UP_DUE',
  'OVERDUE',
  'DUE_SOON_UNCONTACTED',
] as const;

const prioritySchema = z
  .object({
    score: exactDecimalSchema,
    components: z
      .object({
        amount: exactDecimalSchema,
        aging: exactDecimalSchema,
        stale: exactDecimalSchema,
        promise: exactDecimalSchema,
        dueSoon: exactDecimalSchema,
      })
      .strict(),
  })
  .strict();

const collectionQueueItemSchema = z
  .object({
    id: z.uuid(),
    invoiceNumber: z.string().min(1).max(50),
    debtor: z
      .object({
        id: z.uuid(),
        code: z.string().max(50).nullable(),
        name: z.string().min(1).max(200),
      })
      .strict(),
    dueDate: z.iso.date(),
    outstandingAmount: exactDecimalSchema,
    state: z.enum(invoiceStates),
    aging: z
      .object({
        bucket: z.enum(agingBuckets),
        daysToDue: z.number().int(),
        daysOverdue: z.number().int().min(0),
      })
      .strict(),
    lastContactDate: nullableDateSchema,
    nextFollowUpDate: nullableDateSchema,
    promiseStatus: z
      .enum(['ACTIVE', 'DUE', 'BROKEN', 'FULFILLED', 'CANCELLED'])
      .nullable(),
    hasOpenDispute: z.boolean(),
    daysSinceLastContact: z.number().int().min(0),
    reasons: z.array(z.enum(collectionQueueReasons)).min(1).max(5),
    priority: prioritySchema,
  })
  .strict();

export const collectionQueueResponseSchema = z
  .object({
    data: z.array(collectionQueueItemSchema).max(100),
    pagination: z
      .object({
        page: z.number().int().positive(),
        limit: z.number().int().min(1).max(100),
        total: countSchema,
        totalPages: countSchema,
      })
      .strict(),
    meta: z.object({ asOfDate: z.iso.date() }).strict(),
  })
  .strict();

export type CollectionQueueReason = (typeof collectionQueueReasons)[number];
export type CollectionQueueResponse = z.infer<
  typeof collectionQueueResponseSchema
>;
export type CollectionQueueItem = CollectionQueueResponse['data'][number];

export function collectionQueueQuery(input: {
  asOfDate?: string | undefined;
  page: number;
  limit: number;
}): string {
  const query = new URLSearchParams({
    page: String(input.page),
    limit: String(input.limit),
  });
  if (input.asOfDate) query.set('asOfDate', input.asOfDate);
  return query.toString();
}
