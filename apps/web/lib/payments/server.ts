import { serverApiRequest } from '@/lib/api-client/server';

import {
  paymentDetailResponseSchema,
  paymentEntityIdSchema,
  paymentListQuery,
  paymentListResponseSchema,
  type PaymentDetailResponse,
  type PaymentListQuery,
  type PaymentListResponse,
} from './contracts';

export function listPayments(
  query: PaymentListQuery,
): Promise<PaymentListResponse> {
  return serverApiRequest(
    `/api/payments?${paymentListQuery(query)}`,
    paymentListResponseSchema,
  );
}

export function getPayment(paymentId: string): Promise<PaymentDetailResponse> {
  const id = encodeURIComponent(paymentEntityIdSchema.parse(paymentId));
  return serverApiRequest(`/api/payments/${id}`, paymentDetailResponseSchema);
}
