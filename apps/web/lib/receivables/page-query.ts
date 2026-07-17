import { businessDateSchema, entityIdSchema } from './contracts';
import {
  positiveInteger,
  queryValue,
  type PageSearchParams,
} from '../url-query';

export function listPage(searchParams: PageSearchParams): number {
  return positiveInteger(queryValue(searchParams, 'page'), 1, 100_000);
}

export function listSearch(searchParams: PageSearchParams): string | undefined {
  const search = queryValue(searchParams, 'search');
  return search && search.length <= 200 ? search : undefined;
}

export function businessDateQuery(
  searchParams: PageSearchParams,
): string | undefined {
  const result = businessDateSchema.safeParse(
    queryValue(searchParams, 'asOfDate'),
  );
  return result.success ? result.data : undefined;
}

export function entityIdQuery(
  searchParams: PageSearchParams,
  key: string,
): string | undefined {
  const result = entityIdSchema.safeParse(queryValue(searchParams, key));
  return result.success ? result.data : undefined;
}

export function supportedQueryValue<const Values extends readonly string[]>(
  searchParams: PageSearchParams,
  key: string,
  supportedValues: Values,
): Values[number] | undefined {
  const value = queryValue(searchParams, key);
  return value && supportedValues.includes(value)
    ? (value as Values[number])
    : undefined;
}
