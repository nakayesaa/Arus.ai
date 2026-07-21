export type ImportResultFilter =
  'ALL' | 'VALID' | 'INVALID' | 'DUPLICATE' | 'COMMITTED';

export interface ImportUiError {
  message: string;
  requestId?: string | undefined;
}
