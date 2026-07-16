import { DomainError } from './errors.js';

export const MONEY_SCALE = 2 as const;
export const MAX_MONEY_MINOR_UNITS = 999_999_999_999_999_999n;

const CANONICAL_MONEY_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parses a non-negative canonical decimal string into integer minor units.
 * Localized amounts belong at an import boundary, never in domain arithmetic.
 */
export function parseMoney(value: string): bigint {
  if (value.length === 0 || value.length > 32 || value.trim() !== value) {
    throw invalidMoney(value);
  }

  const match = CANONICAL_MONEY_PATTERN.exec(value);
  if (!match) {
    throw invalidMoney(value);
  }

  const integerPart = match[1] ?? '';
  const fractionPart = (match[2] ?? '').padEnd(MONEY_SCALE, '0');
  const minorUnits = BigInt(integerPart) * 100n + BigInt(fractionPart || '0');
  assertMoneyRange(minorUnits);
  return minorUnits;
}

export function formatMoney(minorUnits: bigint): string {
  if (minorUnits < 0n) {
    throw new DomainError(
      'MONEY_OUT_OF_RANGE',
      'Money cannot be formatted from negative minor units',
    );
  }
  const integerPart = minorUnits / 100n;
  const fractionPart = (minorUnits % 100n).toString().padStart(2, '0');
  return `${integerPart}.${fractionPart}`;
}

export function assertMoneyRange(minorUnits: bigint): void {
  if (minorUnits < 0n || minorUnits > MAX_MONEY_MINOR_UNITS) {
    throw new DomainError(
      'MONEY_OUT_OF_RANGE',
      'Money exceeds Decimal(18,2) range',
    );
  }
}

function invalidMoney(value: string): DomainError {
  return new DomainError(
    'INVALID_MONEY',
    `Money must be a canonical non-negative decimal string: ${JSON.stringify(value)}`,
  );
}
