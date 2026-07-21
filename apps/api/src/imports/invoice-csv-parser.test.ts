import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { parseInvoiceCsv } from './invoice-csv-parser.js';
import { classifyInvoiceImportRows } from './invoice-import-classifier.js';
import { validateInvoiceImportRows } from './invoice-import-normalizer.js';

const fixtureRoot = new URL(
  '../../../../tests/fixtures/imports/',
  import.meta.url,
);

describe('parseInvoiceCsv', () => {
  it.each([
    'valid-canonical.csv',
    'valid-indonesian-amounts.csv',
    'partial-paid.csv',
    'csv-injection-text.csv',
  ])(
    'matches the deterministic normalized fixture for %s',
    async (filename) => {
      const [csv, expectedDocument] = await Promise.all([
        fixture(filename),
        fixture('expected-normalized.json'),
      ]);
      const expected = JSON.parse(expectedDocument.toString('utf8')) as Record<
        string,
        Array<Record<string, unknown>>
      >;

      const parsed = await parseInvoiceCsv(csv);
      const rows = validateInvoiceImportRows(parsed.rows);

      expect(parsed.warnings).toEqual([]);
      expect(rows).toHaveLength(expected[filename]?.length ?? 0);
      for (const [index, expectedRow] of (expected[filename] ?? []).entries()) {
        const row = rows[index];
        expect(row?.errors).toEqual([]);
        expect({
          rowNumber: row?.rowNumber,
          ...row?.payload,
        }).toMatchObject(expectedRow);
      }
    },
  );

  it('accepts a UTF-8 BOM and case-insensitive trimmed headers', async () => {
    const csv = Buffer.from(
      '\ufeff Customer_Name , Invoice_Number , Invoice_Date , Due_Date , Original_Amount ,extra\nPT BOM,INV-BOM-1,2026-07-01,2026-07-31,1000,ignored\n',
    );

    await expect(parseInvoiceCsv(csv)).resolves.toMatchObject({
      rows: [
        {
          rowNumber: 2,
          values: {
            customer_name: 'PT BOM',
            invoice_number: 'INV-BOM-1',
          },
        },
      ],
      warnings: [{ code: 'UNKNOWN_COLUMN', field: 'header' }],
    });
  });

  it.each([
    ['missing-header.csv', 'MISSING_REQUIRED_HEADER'],
    ['bad-quoting.csv', 'MALFORMED_CSV'],
  ])('rejects whole-file error fixture %s', async (filename, code) => {
    await expect(
      parseInvoiceCsv(await fixture(filename)),
    ).rejects.toMatchObject({
      code,
    });
  });

  it('rejects invalid UTF-8 and inconsistent column counts', async () => {
    await expect(
      parseInvoiceCsv(Buffer.from([0xff, 0xfe, 0xfd])),
    ).rejects.toMatchObject({ code: 'INVALID_UTF8' });

    await expect(
      parseInvoiceCsv(
        Buffer.from(
          'customer_name,invoice_number,invoice_date,due_date,original_amount\nPT Short,INV-1,2026-07-01\n',
        ),
      ),
    ).rejects.toMatchObject({ code: 'COLUMN_COUNT_MISMATCH' });
  });

  it('enforces the 10,000 data-row limit', async () => {
    const header =
      'customer_name,invoice_number,invoice_date,due_date,original_amount';
    const rows = Array.from(
      { length: 10_001 },
      (_, index) => `PT Limit,INV-${index},2026-07-01,2026-07-31,1000000`,
    );

    await expect(
      parseInvoiceCsv(Buffer.from([header, ...rows].join('\n'))),
    ).rejects.toMatchObject({ code: 'TOO_MANY_ROWS' });
  });

  it('keeps the browser E2E mixed preview fixture deterministic', async () => {
    const parsed = await parseInvoiceCsv(await fixture('mixed-preview.csv'));
    const rows = classifyInvoiceImportRows(
      validateInvoiceImportRows(parsed.rows),
      {
        debtors: [
          {
            id: '20000000-0000-4000-8000-000000000001',
            code: 'CUST-001',
            normalizedCode: 'cust-001',
            name: 'PT Sinar Abadi Retail',
            normalizedName: 'pt sinar abadi retail',
          },
        ],
        existingInvoiceNumbers: new Set(),
      },
    );

    expect(parsed.warnings).toEqual([
      expect.objectContaining({ code: 'UNKNOWN_COLUMN', field: 'header' }),
    ]);
    expect(rows.map((row) => row.result)).toEqual([
      'VALID',
      'VALID',
      'DUPLICATE',
      'INVALID',
      'INVALID',
    ]);
    expect(rows.filter((row) => row.warnings.length > 0)).toHaveLength(1);
  });
});

function fixture(filename: string): Promise<Buffer> {
  return readFile(new URL(filename, fixtureRoot));
}
