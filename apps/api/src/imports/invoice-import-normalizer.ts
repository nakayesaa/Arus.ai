import {
  differenceInCalendarDays,
  formatMoney,
  parseBusinessDate,
  parseMoney,
} from '@arus/domain';
import { z } from 'zod';

import type {
  InvoiceImportColumn,
  InvoiceImportDiagnostic,
  NormalizedInvoiceImportPayload,
  RawInvoiceImportRow,
  ValidatedInvoiceImportRow,
} from './invoice-import.types.js';

const emailSchema = z.email().max(320);

const fieldLimits = {
  customer_code: 50,
  customer_name: 200,
  contact_name: 200,
  phone_number: 50,
  email: 320,
  invoice_number: 50,
  invoice_date: 10,
  due_date: 10,
  original_amount: 64,
  paid_amount: 64,
  outstanding_amount: 64,
  salesperson: 200,
  branch: 200,
  notes: 1000,
} as const satisfies Record<InvoiceImportColumn, number>;

export function validateInvoiceImportRows(
  rows: readonly RawInvoiceImportRow[],
): ValidatedInvoiceImportRow[] {
  return rows.map(validateRow);
}

export function parseImportedMoney(value: string): string {
  const compact = value
    .trim()
    .replace(/^rp\.?\s*/i, '')
    .replaceAll(/\s/gu, '');
  if (!compact || !/^[0-9.,]+$/.test(compact)) {
    throw new Error('Amount contains unsupported characters');
  }

  const dots = occurrences(compact, '.');
  const commas = occurrences(compact, ',');
  let integerDigits: string;
  let fractionalDigits = '';

  if (dots > 0 && commas > 0) {
    const decimalSeparator =
      compact.lastIndexOf('.') > compact.lastIndexOf(',') ? '.' : ',';
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
    const decimalIndex = compact.lastIndexOf(decimalSeparator);
    const integerPart = compact.slice(0, decimalIndex);
    fractionalDigits = compact.slice(decimalIndex + 1);
    assertFraction(fractionalDigits);
    integerDigits = groupedInteger(integerPart, thousandsSeparator);
  } else if (dots > 0 || commas > 0) {
    const separator = dots > 0 ? '.' : ',';
    const parts = compact.split(separator);
    if (isThousandsGrouping(parts)) {
      integerDigits = parts.join('');
    } else if (parts.length === 2) {
      integerDigits = parts[0] ?? '';
      fractionalDigits = parts[1] ?? '';
      assertPlainInteger(integerDigits);
      assertFraction(fractionalDigits);
    } else {
      throw new Error('Amount separators are ambiguous');
    }
  } else {
    integerDigits = compact;
    assertPlainInteger(integerDigits);
  }

  return formatMoney(
    parseMoney(
      fractionalDigits ? `${integerDigits}.${fractionalDigits}` : integerDigits,
    ),
  );
}

function validateRow(row: RawInvoiceImportRow): ValidatedInvoiceImportRow {
  const values = normalizedValues(row);
  const errors: InvoiceImportDiagnostic[] = [];
  const warnings: InvoiceImportDiagnostic[] = [];

  requireValue(values.customer_name, 'customer_name', errors);
  requireValue(values.invoice_number, 'invoice_number', errors);
  requireValue(values.invoice_date, 'invoice_date', errors);
  requireValue(values.due_date, 'due_date', errors);
  requireValue(values.original_amount, 'original_amount', errors);

  for (const [field, limit] of Object.entries(fieldLimits) as Array<
    [InvoiceImportColumn, number]
  >) {
    const value = values[field];
    if (value && value.length > limit) {
      errors.push({
        code: 'FIELD_TOO_LONG',
        field,
        message: `${field} must not exceed ${limit} characters`,
      });
    }
    if (value && hasControlCharacter(value)) {
      errors.push({
        code: 'INVALID_TEXT',
        field,
        message: `${field} contains unsupported control characters`,
      });
    }
  }

  if (values.email && !emailSchema.safeParse(values.email).success) {
    errors.push({
      code: 'INVALID_EMAIL',
      field: 'email',
      message: 'email must be a valid email address',
    });
  }

  const invoiceDate = normalizedDate(
    values.invoice_date,
    'invoice_date',
    errors,
  );
  const dueDate = normalizedDate(values.due_date, 'due_date', errors);
  if (
    invoiceDate &&
    dueDate &&
    differenceInCalendarDays(dueDate, invoiceDate) < 0
  ) {
    errors.push({
      code: 'DUE_BEFORE_INVOICE_DATE',
      field: 'due_date',
      message: 'due_date must not be before invoice_date',
    });
  }

  const originalAmount = normalizedAmount(
    values.original_amount,
    'original_amount',
    errors,
  );
  const paidAmount = values.paid_amount
    ? normalizedAmount(values.paid_amount, 'paid_amount', errors)
    : '0.00';
  const declaredOutstandingAmount = values.outstanding_amount
    ? normalizedAmount(values.outstanding_amount, 'outstanding_amount', errors)
    : null;

  let calculatedOutstandingAmount: string | null = null;
  if (originalAmount && parseMoney(originalAmount) === 0n) {
    errors.push({
      code: 'INVALID_AMOUNT',
      field: 'original_amount',
      message: 'original_amount must be greater than zero',
    });
  }
  if (originalAmount && paidAmount) {
    const original = parseMoney(originalAmount);
    const paid = parseMoney(paidAmount);
    if (paid > original) {
      errors.push({
        code: 'PAID_EXCEEDS_ORIGINAL',
        field: 'paid_amount',
        message: 'paid_amount must not exceed original_amount',
      });
    } else {
      calculatedOutstandingAmount = formatMoney(original - paid);
      if (
        declaredOutstandingAmount &&
        parseMoney(declaredOutstandingAmount) !== original - paid
      ) {
        errors.push({
          code: 'OUTSTANDING_MISMATCH',
          field: 'outstanding_amount',
          message:
            'outstanding_amount must equal original_amount minus paid_amount',
        });
      }
    }
  }

  const customerCode = optional(values.customer_code);
  const customerName = optional(values.customer_name);
  const invoiceNumber = optional(values.invoice_number);
  const payload: NormalizedInvoiceImportPayload = {
    customerCode,
    normalizedCustomerCode: customerCode?.toLowerCase() ?? null,
    customerName,
    normalizedCustomerName: customerName?.toLowerCase() ?? null,
    contactName: optional(values.contact_name),
    phoneNumber: optional(values.phone_number),
    email: optional(values.email)?.toLowerCase() ?? null,
    invoiceNumber,
    normalizedInvoiceNumber: invoiceNumber?.toLowerCase() ?? null,
    invoiceDate,
    dueDate,
    originalAmount,
    paidAmount,
    declaredOutstandingAmount,
    calculatedOutstandingAmount,
    salesperson: optional(values.salesperson),
    branch: optional(values.branch),
    notes: optional(values.notes),
  };

  return { rowNumber: row.rowNumber, payload, errors, warnings };
}

function normalizedValues(
  row: RawInvoiceImportRow,
): Record<InvoiceImportColumn, string> {
  const values = {} as Record<InvoiceImportColumn, string>;
  for (const field of Object.keys(fieldLimits) as InvoiceImportColumn[]) {
    values[field] = row.values[field]?.trim() ?? '';
  }
  return values;
}

function requireValue(
  value: string,
  field: InvoiceImportColumn,
  errors: InvoiceImportDiagnostic[],
): void {
  if (!value) {
    errors.push({
      code: 'MISSING_REQUIRED_VALUE',
      field,
      message: `${field} is required`,
    });
  }
}

function normalizedDate(
  value: string,
  field: 'invoice_date' | 'due_date',
  errors: InvoiceImportDiagnostic[],
): string | null {
  if (!value) return null;
  let canonical = value;
  const localized = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (localized) {
    canonical = `${localized[3]}-${localized[2]}-${localized[1]}`;
  }
  try {
    return parseBusinessDate(canonical);
  } catch {
    errors.push({
      code: 'INVALID_DATE',
      field,
      message: `${field} must use YYYY-MM-DD or DD/MM/YYYY`,
    });
    return null;
  }
}

function normalizedAmount(
  value: string,
  field: 'original_amount' | 'paid_amount' | 'outstanding_amount',
  errors: InvoiceImportDiagnostic[],
): string | null {
  if (!value) return null;
  try {
    return parseImportedMoney(value);
  } catch {
    errors.push({
      code: 'INVALID_AMOUNT',
      field,
      message: `${field} is not a supported non-negative Rupiah amount`,
    });
    return null;
  }
}

function optional(value: string): string | null {
  return value || null;
}

function occurrences(value: string, character: '.' | ','): number {
  return value.split(character).length - 1;
}

function groupedInteger(value: string, separator: '.' | ','): string {
  const groups = value.split(separator);
  if (!isThousandsGrouping(groups)) {
    throw new Error('Amount thousands grouping is invalid');
  }
  return groups.join('');
}

function isThousandsGrouping(groups: string[]): boolean {
  if (groups.length < 2 || !/^\d{1,3}$/.test(groups[0] ?? '')) return false;
  return groups.slice(1).every((group) => /^\d{3}$/.test(group));
}

function assertPlainInteger(value: string): void {
  if (!/^\d+$/.test(value)) throw new Error('Amount integer is invalid');
}

function assertFraction(value: string): void {
  if (!/^\d{1,2}$/.test(value)) {
    throw new Error('Amount must have at most two decimal places');
  }
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });
}
