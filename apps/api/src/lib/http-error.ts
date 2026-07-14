export type ErrorFields = Record<string, string>;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: ErrorFields,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}
