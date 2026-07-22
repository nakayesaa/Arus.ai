import {
  addCalendarDays,
  differenceInCalendarDays,
  parseBusinessDate,
  type BusinessDate,
} from './business-date.js';
import { DomainError } from './errors.js';

export type NextFollowUpSuggestion =
  | {
      date: BusinessDate;
      basis: 'STANDARD_NEXT_DAY' | 'ACTIVE_PROMISE';
    }
  | { date: null; basis: 'OPEN_DISPUTE' };

export function suggestNextFollowUp(input: {
  asOfDate: string;
  activePromiseDate?: string | null | undefined;
  hasOpenDispute?: boolean | undefined;
}): NextFollowUpSuggestion {
  const asOfDate = parseBusinessDate(input.asOfDate);
  if (input.hasOpenDispute) {
    return { date: null, basis: 'OPEN_DISPUTE' };
  }

  const tomorrow = addCalendarDays(asOfDate, 1);
  if (!input.activePromiseDate) {
    return { date: tomorrow, basis: 'STANDARD_NEXT_DAY' };
  }

  const promiseDate = parseBusinessDate(input.activePromiseDate);
  const dayBeforePromise = addCalendarDays(promiseDate, -1);
  return {
    date:
      differenceInCalendarDays(dayBeforePromise, tomorrow) >= 0
        ? dayBeforePromise
        : tomorrow,
    basis: 'ACTIVE_PROMISE',
  };
}

export function validateNextFollowUpDate(input: {
  asOfDate: string;
  nextFollowUpDate: string | null;
}): BusinessDate | null {
  const asOfDate = parseBusinessDate(input.asOfDate);
  if (input.nextFollowUpDate === null) return null;

  const nextFollowUpDate = parseBusinessDate(input.nextFollowUpDate);
  if (differenceInCalendarDays(nextFollowUpDate, asOfDate) < 0) {
    throw new DomainError(
      'NEXT_FOLLOW_UP_IN_PAST',
      'Next follow-up date cannot be before the current business date',
    );
  }
  return nextFollowUpDate;
}
