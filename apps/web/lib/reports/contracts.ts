import { z } from 'zod';

import { agingBuckets } from '../receivables/contracts';

const moneySchema = z.string().regex(/^\d+\.\d{2}$/);
const countSchema = z.number().int().min(0).max(50_000);

export const weeklyReportResponseSchema = z
  .object({
    data: z
      .object({
        reportId: z.uuid(),
        period: z
          .object({
            from: z.iso.date(),
            to: z.iso.date(),
            inclusiveDayCount: z.number().int().min(1).max(366),
          })
          .strict(),
        generatedAt: z.iso.datetime({ offset: true }),
        timeZone: z.string().min(1).max(100),
        summary: z
          .object({
            totalAr: moneySchema,
            totalOverdue: moneySchema,
            overduePercent: z.string().regex(/^\d+\.\d{2}$/),
            openInvoiceCount: countSchema,
            overdueInvoiceCount: countSchema,
          })
          .strict(),
        collections: z
          .object({
            amount: moneySchema,
            allocationCount: countSchema,
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
        promises: z
          .object({
            active: workflowMetricSchema(),
            broken: workflowMetricSchema(),
            keptInPeriod: workflowMetricSchema(),
          })
          .strict(),
        disputes: z
          .object({
            openInvoiceCount: countSchema,
            outstandingAmount: moneySchema,
          })
          .strict(),
        priorityOverdue: z
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
                daysOverdue: z.number().int().positive(),
                outstandingAmount: moneySchema,
                agingBucket: z.enum(agingBuckets),
              })
              .strict(),
          )
          .max(8),
      })
      .strict(),
  })
  .strict();

function workflowMetricSchema() {
  return z.object({ count: countSchema, amount: moneySchema }).strict();
}

export type WeeklyReportResponse = z.infer<typeof weeklyReportResponseSchema>;
export type WeeklyReportAgingMetric =
  WeeklyReportResponse['data']['aging'][number];
export type WeeklyReportPriorityInvoice =
  WeeklyReportResponse['data']['priorityOverdue'][number];
