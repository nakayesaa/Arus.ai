export type ImportResultFilter = 'ALL' | 'VALID' | 'INVALID' | 'DUPLICATE';

export interface ImportUiError {
  message: string;
  requestId?: string | undefined;
}
