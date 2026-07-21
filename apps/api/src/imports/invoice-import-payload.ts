import { z } from 'zod';

import {
  INVOICE_IMPORT_COLUMNS,
  INVOICE_IMPORT_DIAGNOSTIC_CODES,
  type InvoiceImportDiagnostic,
  type NormalizedInvoiceImportPayload,
} from './invoice-import.types.js';

const nullableString = z.string().nullable();

export const normalizedInvoiceImportPayloadSchema = z
  .object({
    customerCode: nullableString,
    normalizedCustomerCode: nullableString,
    customerName: nullableString,
    normalizedCustomerName: nullableString,
    contactName: nullableString,
    phoneNumber: nullableString,
    email: nullableString,
    invoiceNumber: nullableString,
    normalizedInvoiceNumber: nullableString,
    invoiceDate: nullableString,
    dueDate: nullableString,
    originalAmount: nullableString,
    paidAmount: nullableString,
    declaredOutstandingAmount: nullableString,
    calculatedOutstandingAmount: nullableString,
    salesperson: nullableString,
    branch: nullableString,
    notes: nullableString,
  })
  .strict();

export const invoiceImportDiagnosticSchema = z
  .object({
    code: z.enum(INVOICE_IMPORT_DIAGNOSTIC_CODES),
    field: z.enum([...INVOICE_IMPORT_COLUMNS, 'file', 'header']).optional(),
    message: z.string(),
  })
  .strict();

export const invoiceImportDiagnosticsSchema = z.array(
  invoiceImportDiagnosticSchema,
);

const committableInvoiceImportPayloadSchema =
  normalizedInvoiceImportPayloadSchema.extend({
    customerName: z.string().min(1),
    normalizedCustomerName: z.string().min(1),
    invoiceNumber: z.string().min(1),
    normalizedInvoiceNumber: z.string().min(1),
    invoiceDate: z.string().min(1),
    dueDate: z.string().min(1),
    originalAmount: z.string().min(1),
    paidAmount: z.string().min(1),
    calculatedOutstandingAmount: z.string().min(1),
  });

export type CommittableInvoiceImportPayload = z.infer<
  typeof committableInvoiceImportPayloadSchema
>;

export function parseNormalizedInvoiceImportPayload(
  value: unknown,
): NormalizedInvoiceImportPayload {
  return normalizedInvoiceImportPayloadSchema.parse(value);
}

export function parseCommittableInvoiceImportPayload(
  value: unknown,
): CommittableInvoiceImportPayload {
  return committableInvoiceImportPayloadSchema.parse(value);
}

export function parseInvoiceImportDiagnostics(
  value: unknown,
): InvoiceImportDiagnostic[] {
  return invoiceImportDiagnosticsSchema.parse(value);
}
