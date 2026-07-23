import { businessDateSchema } from '../receivables/contracts';
import { queryValue, type PageSearchParams } from '../url-query';

export function reportPeriodQuery(
  searchParams: PageSearchParams,
): { from: string; to: string } | undefined {
  const from = businessDateSchema.safeParse(queryValue(searchParams, 'from'));
  const to = businessDateSchema.safeParse(queryValue(searchParams, 'to'));
  if (!from.success || !to.success) return undefined;
  return { from: from.data, to: to.data };
}
