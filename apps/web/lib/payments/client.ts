import { apiRequest } from '@/lib/api-client/http';

import {
  paymentEntityIdSchema,
  recordPaymentInputSchema,
  recordPaymentResponseSchema,
  type RecordPaymentInput,
  type RecordPaymentResponse,
} from './contracts';

const COMMAND_TIMEOUT_MS = 15_000;

export function recordInvoicePayment(
  invoiceId: string,
  operationKey: string,
  input: RecordPaymentInput,
  signal?: AbortSignal,
): Promise<RecordPaymentResponse> {
  const invoice = encodeURIComponent(paymentEntityIdSchema.parse(invoiceId));
  const idempotencyKey = paymentEntityIdSchema.parse(operationKey);
  const command = recordPaymentInputSchema.parse(input);

  return apiRequest(
    `/api/invoices/${invoice}/payments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(command),
      ...(signal ? { signal } : {}),
    },
    recordPaymentResponseSchema,
    { timeoutMs: COMMAND_TIMEOUT_MS },
  );
}
