import { z } from 'zod';

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
  })
  .strict();

export const dashboardResponseSchema = z
  .object({
    data: dashboardSchema,
    meta: z.object({ asOfDate: z.iso.date() }).strict(),
  })
  .strict();

export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type DashboardAgingMetric = DashboardResponse['data']['aging'][number];
export type DashboardExposure =
  DashboardResponse['data']['largestOverdue'][number];
