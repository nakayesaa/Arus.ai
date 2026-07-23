export type DomainErrorCode =
  | 'ALLOCATION_NOT_POSITIVE'
  | 'INVALID_BUSINESS_DATE'
  | 'INVALID_DATE_OFFSET'
  | 'INVALID_MONEY'
  | 'INVALID_PROMISE_STATUS'
  | 'INVOICE_ALREADY_PAID'
  | 'LAST_CONTACT_IN_FUTURE'
  | 'NEXT_FOLLOW_UP_IN_PAST'
  | 'MONEY_OUT_OF_RANGE'
  | 'ORIGINAL_AMOUNT_NOT_POSITIVE'
  | 'OVER_ALLOCATED'
  | 'PAYMENT_AMOUNT_NOT_POSITIVE'
  | 'PAYMENT_DATE_IN_FUTURE'
  | 'PAYMENT_EXCEEDS_OUTSTANDING'
  | 'PROMISE_AMOUNT_NOT_POSITIVE'
  | 'PROMISE_DATE_IN_PAST'
  | 'PROMISE_EXCEEDS_OUTSTANDING';

export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
