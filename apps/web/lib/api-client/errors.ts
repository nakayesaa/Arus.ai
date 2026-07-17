export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string> | undefined;
    requestId: string;
  };
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: ApiErrorBody | undefined,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export class ApiContractError extends Error {
  constructor(readonly path: string) {
    super(`API returned an invalid response for ${path}`);
    this.name = 'ApiContractError';
  }
}

export class ApiTimeoutError extends Error {
  constructor(readonly path: string) {
    super(`API request timed out for ${path}`);
    this.name = 'ApiTimeoutError';
  }
}
