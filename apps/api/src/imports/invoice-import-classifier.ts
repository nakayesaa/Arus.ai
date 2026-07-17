import type {
  ClassifiedInvoiceImportRow,
  ImportMatchingDebtor,
  InvoiceImportDiagnostic,
  InvoiceImportReferenceData,
  ValidatedInvoiceImportRow,
} from './invoice-import.types.js';

export function classifyInvoiceImportRows(
  rows: readonly ValidatedInvoiceImportRow[],
  referenceData: InvoiceImportReferenceData,
): ClassifiedInvoiceImportRow[] {
  const debtorsByCode = indexDebtorsByCode(referenceData.debtors);
  const debtorsByName = indexDebtorsByName(referenceData.debtors);
  const validInvoiceNumbers = new Set<string>();

  return rows.map((row) => {
    const errors = [...row.errors];
    const warnings = [...row.warnings];
    let debtorAction: ClassifiedInvoiceImportRow['debtorAction'] = null;
    let matchedDebtorId: string | null = null;

    if (errors.length === 0) {
      const resolution = resolveDebtor(row, debtorsByCode, debtorsByName);
      errors.push(...resolution.errors);
      warnings.push(...resolution.warnings);
      debtorAction = resolution.debtorAction;
      matchedDebtorId = resolution.matchedDebtorId;
    }

    let result: ClassifiedInvoiceImportRow['result'] = 'INVALID';
    const invoiceNumber = row.payload.normalizedInvoiceNumber;
    if (errors.length === 0 && invoiceNumber) {
      if (referenceData.existingInvoiceNumbers.has(invoiceNumber)) {
        errors.push({
          code: 'DUPLICATE_IN_DATABASE',
          field: 'invoice_number',
          message: 'invoice_number already exists in this organization',
        });
        result = 'DUPLICATE';
      } else if (validInvoiceNumbers.has(invoiceNumber)) {
        errors.push({
          code: 'DUPLICATE_IN_FILE',
          field: 'invoice_number',
          message:
            'invoice_number duplicates an earlier valid row in this file',
        });
        result = 'DUPLICATE';
      } else {
        validInvoiceNumbers.add(invoiceNumber);
        result = 'VALID';
      }
    }

    return {
      ...row,
      errors,
      warnings,
      result,
      debtorAction,
      matchedDebtorId,
    };
  });
}

interface DebtorResolution {
  debtorAction: ClassifiedInvoiceImportRow['debtorAction'];
  matchedDebtorId: string | null;
  errors: InvoiceImportDiagnostic[];
  warnings: InvoiceImportDiagnostic[];
}

function resolveDebtor(
  row: ValidatedInvoiceImportRow,
  debtorsByCode: ReadonlyMap<string, ImportMatchingDebtor>,
  debtorsByName: ReadonlyMap<string, readonly ImportMatchingDebtor[]>,
): DebtorResolution {
  const customerCode = row.payload.normalizedCustomerCode;
  const customerName = row.payload.normalizedCustomerName;

  if (customerCode) {
    const debtor = debtorsByCode.get(customerCode);
    if (!debtor) return willCreate();

    const warnings: InvoiceImportDiagnostic[] = [];
    if (customerName && customerName !== debtor.normalizedName) {
      warnings.push({
        code: 'DEBTOR_NAME_MISMATCH',
        field: 'customer_name',
        message:
          'customer_code matched an existing debtor with a different name',
      });
    }
    return {
      debtorAction: 'MATCH_EXISTING',
      matchedDebtorId: debtor.id,
      errors: [],
      warnings,
    };
  }

  const candidates = customerName
    ? (debtorsByName.get(customerName) ?? [])
    : [];
  if (candidates.length === 0) return willCreate();
  if (candidates.length === 1) {
    return {
      debtorAction: 'MATCH_EXISTING',
      matchedDebtorId: candidates[0]?.id ?? null,
      errors: [],
      warnings: [],
    };
  }

  return {
    debtorAction: null,
    matchedDebtorId: null,
    errors: [
      {
        code: 'AMBIGUOUS_DEBTOR',
        field: 'customer_name',
        message:
          'customer_name matches multiple existing debtors; provide customer_code',
      },
    ],
    warnings: [],
  };
}

function willCreate(): DebtorResolution {
  return {
    debtorAction: 'WILL_CREATE',
    matchedDebtorId: null,
    errors: [],
    warnings: [],
  };
}

function indexDebtorsByCode(
  debtors: readonly ImportMatchingDebtor[],
): Map<string, ImportMatchingDebtor> {
  const index = new Map<string, ImportMatchingDebtor>();
  for (const debtor of debtors) {
    if (debtor.normalizedCode && !index.has(debtor.normalizedCode)) {
      index.set(debtor.normalizedCode, debtor);
    }
  }
  return index;
}

function indexDebtorsByName(
  debtors: readonly ImportMatchingDebtor[],
): Map<string, ImportMatchingDebtor[]> {
  const index = new Map<string, ImportMatchingDebtor[]>();
  for (const debtor of debtors) {
    const matches = index.get(debtor.normalizedName);
    if (matches) matches.push(debtor);
    else index.set(debtor.normalizedName, [debtor]);
  }
  return index;
}
