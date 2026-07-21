import { z } from 'zod';

const countSchema = z.number().int().min(0).max(10_000);
const moneySchema = z.string().regex(/^\d+\.\d{2}$/);
const nullableMoneySchema = moneySchema.nullable();
const nullableDateSchema = z.iso.date().nullable();
const timestampSchema = z.iso.datetime({ offset: true });

export const invoiceImportRowResults = [
  'VALID',
  'INVALID',
  'DUPLICATE',
  'COMMITTED',
] as const;

const invoiceImportDiagnosticCodes = [
  'AMBIGUOUS_DEBTOR',
  'COLUMN_COUNT_MISMATCH',
  'DEBTOR_NAME_MISMATCH',
  'DUE_BEFORE_INVOICE_DATE',
  'DUPLICATE_HEADER',
  'DUPLICATE_IN_DATABASE',
  'DUPLICATE_IN_FILE',
  'EMPTY_FILE',
  'FIELD_TOO_LONG',
  'INVALID_AMOUNT',
  'INVALID_DATE',
  'INVALID_EMAIL',
  'INVALID_HEADER',
  'INVALID_TEXT',
  'INVALID_UTF8',
  'MALFORMED_CSV',
  'MISSING_REQUIRED_HEADER',
  'MISSING_REQUIRED_VALUE',
  'OUTSTANDING_MISMATCH',
  'PAID_EXCEEDS_ORIGINAL',
  'TOO_MANY_ROWS',
  'UNKNOWN_COLUMN',
] as const;

const invoiceImportColumns = [
  'customer_code',
  'customer_name',
  'contact_name',
  'phone_number',
  'email',
  'invoice_number',
  'invoice_date',
  'due_date',
  'original_amount',
  'paid_amount',
  'outstanding_amount',
  'salesperson',
  'branch',
  'notes',
  'file',
  'header',
] as const;

const diagnosticSchema = z
  .object({
    code: z.enum(invoiceImportDiagnosticCodes),
    field: z.enum(invoiceImportColumns).optional(),
    message: z.string().min(1).max(500),
  })
  .strict();

const importJobSchema = z
  .object({
    id: z.uuid(),
    filename: z.string().min(1).max(255),
    fileHash: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['PREVIEWING', 'READY', 'COMMITTED', 'FAILED', 'CANCELLED']),
    counts: z
      .object({
        total: countSchema,
        valid: countSchema,
        invalid: countSchema,
        duplicate: countSchema,
        warning: countSchema,
      })
      .strict(),
    fileWarnings: z.array(diagnosticSchema).max(100),
    failure: z
      .object({
        code: z.string().min(1).max(100),
        message: z.string().min(1).max(500),
      })
      .strict()
      .nullable(),
    committedAt: timestampSchema.nullable(),
    cancelledAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

const normalizedPayloadSchema = z
  .object({
    customerCode: z.string().max(50).nullable(),
    normalizedCustomerCode: z.string().max(50).nullable(),
    customerName: z.string().max(200).nullable(),
    normalizedCustomerName: z.string().max(200).nullable(),
    contactName: z.string().max(200).nullable(),
    phoneNumber: z.string().max(50).nullable(),
    email: z.string().max(320).nullable(),
    invoiceNumber: z.string().max(50).nullable(),
    normalizedInvoiceNumber: z.string().max(50).nullable(),
    invoiceDate: nullableDateSchema,
    dueDate: nullableDateSchema,
    originalAmount: nullableMoneySchema,
    paidAmount: nullableMoneySchema,
    declaredOutstandingAmount: nullableMoneySchema,
    calculatedOutstandingAmount: nullableMoneySchema,
    salesperson: z.string().max(200).nullable(),
    branch: z.string().max(200).nullable(),
    notes: z.string().max(2_000).nullable(),
  })
  .strict();

const importRowSchema = z
  .object({
    id: z.uuid(),
    rowNumber: z.number().int().min(2).max(10_001),
    result: z.enum(invoiceImportRowResults),
    payload: normalizedPayloadSchema,
    errors: z.array(diagnosticSchema).max(20),
    warnings: z.array(diagnosticSchema).max(20),
    debtor: z
      .object({
        action: z.enum(['MATCH_EXISTING', 'WILL_CREATE']).nullable(),
        matchedDebtorId: z.uuid().nullable(),
      })
      .strict(),
    committedInvoiceId: z.uuid().nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .strict();

const paginationSchema = z
  .object({
    page: z.number().int().positive(),
    limit: z.number().int().min(1).max(100),
    total: countSchema,
    totalPages: countSchema,
  })
  .strict();

export const importJobEnvelopeSchema = z
  .object({ data: importJobSchema })
  .strict();

export const importRowsResponseSchema = z
  .object({
    data: z.array(importRowSchema).max(100),
    pagination: paginationSchema,
  })
  .strict();

export type InvoiceImportJob = z.infer<typeof importJobSchema>;
export type InvoiceImportRow = z.infer<typeof importRowSchema>;
export type InvoiceImportRowResult = (typeof invoiceImportRowResults)[number];
export type InvoiceImportRowsResponse = z.infer<
  typeof importRowsResponseSchema
>;

export function invoiceImportRowsQuery(input: {
  result?: InvoiceImportRowResult | undefined;
  page: number;
  limit: number;
}): string {
  const searchParams = new URLSearchParams({
    page: String(input.page),
    limit: String(input.limit),
  });
  if (input.result) searchParams.set('result', input.result);
  return searchParams.toString();
}
