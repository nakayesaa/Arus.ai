const CANONICAL_MONEY = /^(\d+)(?:\.(\d{1,2}))?$/;

export function canonicalPaymentInput(value: string): string | null {
  const compact = value
    .trim()
    .replace(/^rp\.?\s*/iu, '')
    .replaceAll(/\s|\u00a0/gu, '');
  if (!compact) return null;

  let canonical: string;
  if (compact.includes(',')) {
    if ((compact.match(/,/g) ?? []).length !== 1) return null;
    const [integerPart, fractionPart] = compact.split(',');
    if (
      !integerPart ||
      !fractionPart ||
      fractionPart.length > 2 ||
      !/^\d+$/u.test(fractionPart)
    ) {
      return null;
    }
    const integer = integerPart.replaceAll('.', '');
    if (!/^\d+$/u.test(integer)) return null;
    canonical = `${integer}.${fractionPart}`;
  } else {
    const dotCount = (compact.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      const integer = compact.replaceAll('.', '');
      if (!/^\d+$/u.test(integer)) return null;
      canonical = integer;
    } else if (dotCount === 1) {
      const [integerPart, tail] = compact.split('.');
      if (!integerPart || !tail || !/^\d+$/u.test(integerPart + tail)) {
        return null;
      }
      canonical =
        tail.length === 3 ? `${integerPart}${tail}` : `${integerPart}.${tail}`;
    } else {
      canonical = compact;
    }
  }

  const match = CANONICAL_MONEY.exec(canonical);
  if (!match) return null;
  const integer = (match[1] ?? '').replace(/^0+(?=\d)/u, '') || '0';
  const fraction = (match[2] ?? '').padEnd(2, '0');
  return `${integer}.${fraction}`;
}

export function subtractPaymentAmount(
  outstandingAmount: string,
  paymentAmount: string,
): string | null {
  const outstanding = minorUnits(outstandingAmount);
  const payment = minorUnits(paymentAmount);
  if (outstanding === null || payment === null || payment > outstanding) {
    return null;
  }
  return formatMinorUnits(outstanding - payment);
}

function minorUnits(value: string): bigint | null {
  const match = /^(\d+)\.(\d{2})$/u.exec(value);
  if (!match) return null;
  return BigInt(match[1] ?? '0') * 100n + BigInt(match[2] ?? '0');
}

function formatMinorUnits(value: bigint): string {
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}
