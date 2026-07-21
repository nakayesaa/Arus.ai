import { serverApiRequest } from '../api-client/server';

import {
  collectionQueueQuery,
  collectionQueueResponseSchema,
  type CollectionQueueResponse,
} from './contracts';

export function listCollectionQueue(input: {
  asOfDate?: string | undefined;
  page: number;
  limit: number;
}): Promise<CollectionQueueResponse> {
  return serverApiRequest(
    `/api/collection-queue?${collectionQueueQuery(input)}`,
    collectionQueueResponseSchema,
  );
}
