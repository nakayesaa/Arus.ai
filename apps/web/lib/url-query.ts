export type PageSearchParams = Record<string, string | string[] | undefined>;

export function queryValue(
  searchParams: PageSearchParams,
  key: string,
): string | undefined {
  const value = searchParams[key];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export function positiveInteger(
  value: string | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : fallback;
}

export function buildUrl(
  path: string,
  current: PageSearchParams,
  changes: Record<string, string | number | null | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    if (typeof value === 'string' && value.trim()) query.set(key, value);
  }
  return urlWithChanges(path, query.toString(), changes);
}

export function urlWithChanges(
  path: string,
  currentQuery: string,
  changes: Record<string, string | number | null | undefined>,
): string {
  const query = new URLSearchParams(currentQuery);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined || value === '')
      query.delete(key);
    else query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}
