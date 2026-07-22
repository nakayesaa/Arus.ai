import { DomainError } from './errors.js';

export type BusinessDate = string & { readonly __businessDate: unique symbol };

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MILLISECONDS_PER_DAY = 86_400_000;

export function parseBusinessDate(value: string): BusinessDate {
  const match = BUSINESS_DATE_PATTERN.exec(value);
  if (!match) {
    throw invalidBusinessDate(value);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw invalidBusinessDate(value);
  }

  return value as BusinessDate;
}

export function differenceInCalendarDays(
  laterDate: string,
  earlierDate: string,
): number {
  return (
    epochDay(parseBusinessDate(laterDate)) -
    epochDay(parseBusinessDate(earlierDate))
  );
}

export function addCalendarDays(value: string, days: number): BusinessDate {
  if (!Number.isSafeInteger(days)) {
    throw new DomainError(
      'INVALID_DATE_OFFSET',
      'Calendar date offset must be a safe integer',
    );
  }

  const result = new Date(
    (epochDay(parseBusinessDate(value)) + days) * MILLISECONDS_PER_DAY,
  );
  const year = result.getUTCFullYear();
  if (year < 1 || year > 9999) {
    throw new DomainError(
      'INVALID_DATE_OFFSET',
      'Calendar date offset is outside the supported year range',
    );
  }
  const month = String(result.getUTCMonth() + 1).padStart(2, '0');
  const day = String(result.getUTCDate()).padStart(2, '0');
  return parseBusinessDate(`${String(year).padStart(4, '0')}-${month}-${day}`);
}

function epochDay(value: BusinessDate): number {
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return Math.trunc(date.getTime() / MILLISECONDS_PER_DAY);
}

function daysInMonth(year: number, month: number): number {
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return monthLengths[month - 1] ?? 0;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function invalidBusinessDate(value: string): DomainError {
  return new DomainError(
    'INVALID_BUSINESS_DATE',
    `Business date must be a valid YYYY-MM-DD calendar date: ${JSON.stringify(value)}`,
  );
}
