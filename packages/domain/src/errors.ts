export type DomainErrorCode =
  | 'ALLOCATION_NOT_POSITIVE'
  | 'INVALID_BUSINESS_DATE'
  | 'INVALID_DATE_OFFSET'
  | 'INVALID_MONEY'
  | 'INVALID_PROMISE_STATUS'
  | 'LAST_CONTACT_IN_FUTURE'
  | 'NEXT_FOLLOW_UP_IN_PAST'
  | 'MONEY_OUT_OF_RANGE'
  | 'ORIGINAL_AMOUNT_NOT_POSITIVE'
  | 'OVER_ALLOCATED';

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
