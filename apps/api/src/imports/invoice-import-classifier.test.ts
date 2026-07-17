import { describe, expect, it } from 'vitest';

import { classifyInvoiceImportRows } from './invoice-import-classifier.js';
import { validateInvoiceImportRows } from './invoice-import-normalizer.js';
import type {
  InvoiceImportReferenceData,
  RawInvoiceImportRow,
} from './invoice-import.types.js';

describe('classifyInvoiceImportRows', () => {
  it('matches by code first and warns when the supplied name differs', () => {
    const [row] = classifyInvoiceImportRows(
      validRows([
        rawRow(2, {
          customer_code: 'EXIST-001',
          customer_name: 'PT Nama Baru',
          invoice_number: 'INV-NEW-1',
        }),
      ]),
      references({
        debtors: [
          {
            id: 'debtor-1',
            code: 'EXIST-001',
            normalizedCode: 'exist-001',
            name: 'PT Nama Lama',
            normalizedName: 'pt nama lama',
          },
        ],
      }),
    );

    expect(row).toMatchObject({
      result: 'VALID',
      debtorAction: 'MATCH_EXISTING',
      matchedDebtorId: 'debtor-1',
      errors: [],
      warnings: [{ code: 'DEBTOR_NAME_MISMATCH' }],
    });
  });

  it('rejects an ambiguous legacy debtor name without fuzzy matching', () => {
    const [row] = classifyInvoiceImportRows(
      validRows([
        rawRow(2, {
          customer_name: 'PT Nama Sama',
          invoice_number: 'INV-AMBIGUOUS-1',
        }),
      ]),
      references({
        debtors: [
          debtor('debtor-1', 'PT Nama Sama'),
          debtor('debtor-2', 'PT Nama Sama'),
        ],
      }),
    );

    expect(row).toMatchObject({
      result: 'INVALID',
      debtorAction: null,
      matchedDebtorId: null,
      errors: [{ code: 'AMBIGUOUS_DEBTOR' }],
    });
  });

  it('classifies database and in-file duplicates after row validation', () => {
    const rows = classifyInvoiceImportRows(
      validRows([
        rawRow(2, {
          customer_name: 'PT Existing',
          invoice_number: 'INV-DB-1',
        }),
        rawRow(3, {
          customer_name: 'PT New',
          invoice_number: 'INV-FILE-1',
        }),
        rawRow(4, {
          customer_name: 'PT New',
          invoice_number: 'inv-file-1',
        }),
        rawRow(5, {
          customer_name: '',
          invoice_number: 'INV-RECOVERED-1',
        }),
        rawRow(6, {
          customer_name: 'PT Recovered',
          invoice_number: 'INV-RECOVERED-1',
        }),
      ]),
      references({ existingInvoiceNumbers: new Set(['inv-db-1']) }),
    );

    expect(rows.map((row) => row.result)).toEqual([
      'DUPLICATE',
      'VALID',
      'DUPLICATE',
      'INVALID',
      'VALID',
    ]);
    expect(rows[0]?.errors.at(-1)?.code).toBe('DUPLICATE_IN_DATABASE');
    expect(rows[2]?.errors.at(-1)?.code).toBe('DUPLICATE_IN_FILE');
  });

  it('marks an unmatched debtor for creation and exact name match as existing', () => {
    const rows = classifyInvoiceImportRows(
      validRows([
        rawRow(2, {
          customer_name: 'PT Known',
          invoice_number: 'INV-KNOWN-1',
        }),
        rawRow(3, {
          customer_code: 'NEW-001',
          customer_name: 'PT New',
          invoice_number: 'INV-NEW-1',
        }),
      ]),
      references({ debtors: [debtor('debtor-known', 'PT Known')] }),
    );

    expect(rows).toMatchObject([
      {
        result: 'VALID',
        debtorAction: 'MATCH_EXISTING',
        matchedDebtorId: 'debtor-known',
      },
      {
        result: 'VALID',
        debtorAction: 'WILL_CREATE',
        matchedDebtorId: null,
      },
    ]);
  });
});

function validRows(rows: RawInvoiceImportRow[]) {
  return validateInvoiceImportRows(rows);
}

function rawRow(
  rowNumber: number,
  values: Pick<
    RawInvoiceImportRow['values'],
    'customer_code' | 'customer_name' | 'invoice_number'
  >,
): RawInvoiceImportRow {
  return {
    rowNumber,
    values: {
      invoice_date: '2026-07-01',
      due_date: '2026-07-31',
      original_amount: '1000000',
      ...values,
    },
  };
}

function debtor(id: string, name: string) {
  return {
    id,
    code: null,
    normalizedCode: null,
    name,
    normalizedName: name.toLowerCase(),
  };
}

function references(
  input: Partial<InvoiceImportReferenceData>,
): InvoiceImportReferenceData {
  return {
    debtors: input.debtors ?? [],
    existingInvoiceNumbers: input.existingInvoiceNumbers ?? new Set(),
  };
}
