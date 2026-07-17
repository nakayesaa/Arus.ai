import { parse } from 'csv-parse';

import {
  INVOICE_IMPORT_COLUMNS,
  InvoiceImportFileError,
  REQUIRED_INVOICE_IMPORT_COLUMNS,
  type InvoiceImportColumn,
  type InvoiceImportDiagnostic,
  type ParsedInvoiceImportFile,
} from './invoice-import.types.js';

export const MAX_INVOICE_IMPORT_ROWS = 10_000;

const MAX_RECORD_BYTES = 1_048_576;
const canonicalColumns = new Set<string>(INVOICE_IMPORT_COLUMNS);

export async function parseInvoiceCsv(
  buffer: Buffer,
): Promise<ParsedInvoiceImportFile> {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new InvoiceImportFileError(
      'INVALID_UTF8',
      'CSV file must use valid UTF-8 encoding',
    );
  }

  let headers: string[] | null = null;
  let columnMapping: Array<InvoiceImportColumn | null> = [];
  const warnings: InvoiceImportDiagnostic[] = [];
  const rows: ParsedInvoiceImportFile['rows'] = [];

  try {
    const parser = parse(source, {
      bom: true,
      delimiter: ',',
      max_record_size: MAX_RECORD_BYTES,
      quote: '"',
      relax_column_count: false,
      relax_quotes: false,
      skip_empty_lines: true,
    });

    for await (const record of parser) {
      if (!Array.isArray(record)) {
        throw new InvoiceImportFileError(
          'MALFORMED_CSV',
          'CSV parser returned an invalid record',
        );
      }

      const values = record.map((value) => String(value));
      if (!headers) {
        headers = normalizeHeaders(values);
        columnMapping = validateHeaders(headers, warnings);
        continue;
      }

      if (rows.length >= MAX_INVOICE_IMPORT_ROWS) {
        throw new InvoiceImportFileError(
          'TOO_MANY_ROWS',
          `CSV contains more than ${MAX_INVOICE_IMPORT_ROWS} data rows`,
          warnings,
        );
      }

      const mappedValues: Partial<Record<InvoiceImportColumn, string>> = {};
      for (const [index, value] of values.entries()) {
        const column = columnMapping[index];
        if (column) mappedValues[column] = value;
      }
      rows.push({ rowNumber: rows.length + 2, values: mappedValues });
    }
  } catch (error) {
    if (error instanceof InvoiceImportFileError) throw error;
    throw parserError(error, warnings);
  }

  if (!headers) {
    throw new InvoiceImportFileError(
      'EMPTY_FILE',
      'CSV file must contain a header row',
    );
  }
  if (rows.length === 0) {
    throw new InvoiceImportFileError(
      'EMPTY_FILE',
      'CSV file must contain at least one data row',
      warnings,
    );
  }

  return { rows, warnings };
}

function normalizeHeaders(values: string[]): string[] {
  return values.map((value) => value.trim().toLowerCase());
}

function validateHeaders(
  headers: string[],
  warnings: InvoiceImportDiagnostic[],
): Array<InvoiceImportColumn | null> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const header of headers) {
    if (!header) {
      throw new InvoiceImportFileError(
        'INVALID_HEADER',
        'CSV headers cannot be empty',
      );
    }
    if (seen.has(header)) duplicates.add(header);
    seen.add(header);
  }

  if (duplicates.size > 0) {
    throw new InvoiceImportFileError(
      'DUPLICATE_HEADER',
      `CSV contains duplicate headers: ${[...duplicates].sort().join(', ')}`,
    );
  }

  const missing = REQUIRED_INVOICE_IMPORT_COLUMNS.filter(
    (column) => !seen.has(column),
  );
  if (missing.length > 0) {
    throw new InvoiceImportFileError(
      'MISSING_REQUIRED_HEADER',
      `CSV is missing required headers: ${missing.join(', ')}`,
    );
  }

  for (const header of headers) {
    if (!canonicalColumns.has(header)) {
      warnings.push({
        code: 'UNKNOWN_COLUMN',
        field: 'header',
        message: `Unknown column ${JSON.stringify(header)} was ignored`,
      });
    }
  }

  return headers.map((header) =>
    canonicalColumns.has(header) ? (header as InvoiceImportColumn) : null,
  );
}

function parserError(
  error: unknown,
  warnings: InvoiceImportDiagnostic[],
): InvoiceImportFileError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
  if (code.includes('INCONSISTENT') || code.includes('COLUMN')) {
    return new InvoiceImportFileError(
      'COLUMN_COUNT_MISMATCH',
      'CSV rows must contain the same number of columns as the header',
      warnings,
    );
  }
  return new InvoiceImportFileError(
    'MALFORMED_CSV',
    'CSV contains malformed quoting or record structure',
    warnings,
  );
}
