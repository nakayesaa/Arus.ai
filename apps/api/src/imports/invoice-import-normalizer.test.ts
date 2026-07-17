import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { parseInvoiceCsv } from './invoice-csv-parser.js';
import {
  parseImportedMoney,
  validateInvoiceImportRows,
} from './invoice-import-normalizer.js';
import type { RawInvoiceImportRow } from './invoice-import.types.js';

const fixtureRoot = new URL(
  '../../../../tests/fixtures/imports/',
  import.meta.url,
);

describe('parseImportedMoney', () => {
  it.each([
    ['1500000', '1500000.00'],
    ['1500000.50', '1500000.50'],
    ['1.500.000', '1500000.00'],
    ['1.500.000,50', '1500000.50'],
    ['Rp 1.500.000,50', '1500000.50'],
    ['1,500,000.50', '1500000.50'],
    ['0,25', '0.25'],
  ])('parses %s exactly', (input, expected) => {
    expect(parseImportedMoney(input)).toBe(expected);
  });

  it.each([
    '-1',
    '1e6',
    'NaN',
    'Infinity',
    '1.234,567',
    '10.00.00',
    '10000000000000000',
  ])('rejects unsupported amount %s', (input) => {
    expect(() => parseImportedMoney(input)).toThrow();
  });
});

describe('validateInvoiceImportRows', () => {
  it('reports invalid dates without rollover and outstanding mismatch', async () => {
    const invalidDates = await normalizedFixture('invalid-date.csv');
    const mismatch = await normalizedFixture('outstanding-mismatch.csv');

    expect(invalidDates).toHaveLength(2);
    expect(
      invalidDates.map((row) => row.errors.map((error) => error.code)),
    ).toEqual([['INVALID_DATE'], ['INVALID_DATE']]);
    expect(mismatch[0]?.errors).toEqual([
      expect.objectContaining({
        code: 'OUTSTANDING_MISMATCH',
        field: 'outstanding_amount',
      }),
    ]);
  });

  it('reports independent row validation failures in contract order', () => {
    const [row] = validateInvoiceImportRows([
      rawRow({
        customer_name: '',
        invoice_number: '',
        invoice_date: '2026-07-31',
        due_date: '2026-07-01',
        original_amount: '0',
        paid_amount: '1',
        email: 'not-an-email',
      }),
    ]);

    expect(row?.errors.map((error) => error.code)).toEqual([
      'MISSING_REQUIRED_VALUE',
      'MISSING_REQUIRED_VALUE',
      'INVALID_EMAIL',
      'DUE_BEFORE_INVOICE_DATE',
      'INVALID_AMOUNT',
      'PAID_EXCEEDS_ORIGINAL',
    ]);
  });

  it('keeps formula-like text as inert plain text in normalized payload', async () => {
    const [row] = await normalizedFixture('csv-injection-text.csv');
    expect(row?.errors).toEqual([]);
    expect(row?.payload.notes).toBe(
      '=HYPERLINK("https://malicious.invalid","click")',
    );
  });
});

async function normalizedFixture(filename: string) {
  const parsed = await parseInvoiceCsv(
    await readFile(new URL(filename, fixtureRoot)),
  );
  return validateInvoiceImportRows(parsed.rows);
}

function rawRow(values: RawInvoiceImportRow['values']): RawInvoiceImportRow {
  return { rowNumber: 2, values };
}
