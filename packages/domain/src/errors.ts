export type DomainErrorCode =
  | 'ALLOCATION_NOT_POSITIVE'
  | 'INVALID_BUSINESS_DATE'
  | 'INVALID_MONEY'
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
