export const INVOICE_IMPORT_COLUMNS = [
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
] as const;

export type InvoiceImportColumn = (typeof INVOICE_IMPORT_COLUMNS)[number];

export const REQUIRED_INVOICE_IMPORT_COLUMNS = [
  'customer_name',
  'invoice_number',
  'invoice_date',
  'due_date',
  'original_amount',
] as const satisfies readonly InvoiceImportColumn[];

export const INVOICE_IMPORT_DIAGNOSTIC_CODES = [
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

export type InvoiceImportDiagnosticCode =
  (typeof INVOICE_IMPORT_DIAGNOSTIC_CODES)[number];

export interface InvoiceImportDiagnostic {
  code: InvoiceImportDiagnosticCode;
  field?: InvoiceImportColumn | 'file' | 'header' | undefined;
  message: string;
}

export interface RawInvoiceImportRow {
  rowNumber: number;
  values: Partial<Record<InvoiceImportColumn, string>>;
}

export interface ParsedInvoiceImportFile {
  rows: RawInvoiceImportRow[];
  warnings: InvoiceImportDiagnostic[];
}

export interface NormalizedInvoiceImportPayload {
  customerCode: string | null;
  normalizedCustomerCode: string | null;
  customerName: string | null;
  normalizedCustomerName: string | null;
  contactName: string | null;
  phoneNumber: string | null;
  email: string | null;
  invoiceNumber: string | null;
  normalizedInvoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  originalAmount: string | null;
  paidAmount: string | null;
  declaredOutstandingAmount: string | null;
  calculatedOutstandingAmount: string | null;
  salesperson: string | null;
  branch: string | null;
  notes: string | null;
}

export interface ValidatedInvoiceImportRow {
  rowNumber: number;
  payload: NormalizedInvoiceImportPayload;
  errors: InvoiceImportDiagnostic[];
  warnings: InvoiceImportDiagnostic[];
}

export type InvoiceImportRowResult = 'VALID' | 'INVALID' | 'DUPLICATE';

export type InvoiceImportDebtorAction = 'MATCH_EXISTING' | 'WILL_CREATE';

export interface ImportMatchingDebtor {
  id: string;
  code: string | null;
  normalizedCode: string | null;
  name: string;
  normalizedName: string;
}

export interface InvoiceImportReferenceData {
  debtors: ImportMatchingDebtor[];
  existingInvoiceNumbers: Set<string>;
}

export interface ClassifiedInvoiceImportRow extends ValidatedInvoiceImportRow {
  result: InvoiceImportRowResult;
  debtorAction: InvoiceImportDebtorAction | null;
  matchedDebtorId: string | null;
}

export class InvoiceImportFileError extends Error {
  constructor(
    readonly code: InvoiceImportDiagnosticCode,
    message: string,
    readonly warnings: InvoiceImportDiagnostic[] = [],
  ) {
    super(message);
    this.name = 'InvoiceImportFileError';
  }
}
