import { z } from 'zod';

import { disputeCategories } from '../collection-cases/contracts';
import { agingBuckets } from '../receivables/contracts';

const moneySchema = z.string().regex(/^\d+\.\d{2}$/);
const percentageSchema = z.string().regex(/^\d+\.\d{2}$/);
const countSchema = z.number().int().min(0).max(10_000);

const dashboardSchema = z
  .object({
    summary: z
      .object({
        totalAr: moneySchema,
        totalOverdue: moneySchema,
        overduePercent: percentageSchema,
        openInvoiceCount: countSchema,
        overdueInvoiceCount: countSchema,
      })
      .strict(),
    aging: z
      .array(
        z
          .object({
            bucket: z.enum(agingBuckets),
            invoiceCount: countSchema,
            outstandingAmount: moneySchema,
          })
          .strict(),
      )
      .length(agingBuckets.length),
    largestOverdue: z
      .array(
        z
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
            outstandingAmount: moneySchema,
            daysOverdue: z.number().int().positive(),
            agingBucket: z.enum(agingBuckets),
          })
          .strict(),
      )
      .max(5),
    workflows: z
      .object({
        brokenPromiseCount: countSchema,
        openDisputeCount: countSchema,
      })
      .strict(),
  })
  .strict();

export const dashboardResponseSchema = z
  .object({
    data: dashboardSchema,
    meta: z.object({ asOfDate: z.iso.date() }).strict(),
  })
  .strict();

export const dashboardWorkflowKinds = [
  'BROKEN_PROMISE',
  'OPEN_DISPUTE',
] as const;

const workflowInvoiceSchema = z
  .object({
    id: z.uuid(),
    invoiceNumber: z.string().min(1).max(100),
    debtor: z
      .object({
        id: z.uuid(),
        code: z.string().max(50).nullable(),
        name: z.string().min(1).max(200),
      })
      .strict(),
    dueDate: z.iso.date(),
    outstandingAmount: moneySchema,
  })
  .strict();

const workflowCaseBase = {
  id: z.uuid(),
  invoice: workflowInvoiceSchema,
  createdAt: z.iso.datetime({ offset: true }),
};

const dashboardWorkflowCaseSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...workflowCaseBase,
      kind: z.literal('BROKEN_PROMISE'),
      promise: z
        .object({ amount: moneySchema, promiseDate: z.iso.date() })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...workflowCaseBase,
      kind: z.literal('OPEN_DISPUTE'),
      dispute: z
        .object({
          category: z.enum(disputeCategories),
          details: z.string().min(1).max(2_000),
        })
        .strict(),
    })
    .strict(),
]);

export const dashboardWorkflowCasesResponseSchema = z
  .object({
    data: z.array(dashboardWorkflowCaseSchema).max(25),
    pagination: z
      .object({
        page: z.number().int().positive(),
        limit: z.number().int().min(1).max(25),
        total: z.number().int().nonnegative(),
        totalPages: z.number().int().nonnegative(),
      })
      .strict(),
    meta: z.object({ asOfDate: z.iso.date() }).strict(),
  })
  .strict();

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type DashboardAgingMetric = DashboardResponse['data']['aging'][number];
export type DashboardExposure =
  DashboardResponse['data']['largestOverdue'][number];
export type DashboardWorkflowKind = (typeof dashboardWorkflowKinds)[number];
export type DashboardWorkflowCasesResponse = z.infer<
  typeof dashboardWorkflowCasesResponseSchema
>;
export type DashboardWorkflowCase =
  DashboardWorkflowCasesResponse['data'][number];

export function dashboardWorkflowCasesQuery(input: {
  kind: DashboardWorkflowKind;
  asOfDate: string;
  page: number;
  limit: number;
}): string {
  return new URLSearchParams({
    kind: input.kind,
    asOfDate: input.asOfDate,
    page: String(input.page),
    limit: String(input.limit),
  }).toString();
}
