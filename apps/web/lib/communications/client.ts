import { apiRequest } from '../api-client/http';

import {
  communicationEntityIdSchema,
  recordCommunicationInputSchema,
  recordCommunicationResponseSchema,
  type RecordCommunicationInput,
  type RecordCommunicationResponse,
} from './contracts';

const COMMAND_TIMEOUT_MS = 15_000;

export function recordCommunication(
  invoiceId: string,
  operationKey: string,
  input: RecordCommunicationInput,
  signal?: AbortSignal,
): Promise<RecordCommunicationResponse> {
  const invoice = encodeURIComponent(
    communicationEntityIdSchema.parse(invoiceId),
  );
  const idempotencyKey = communicationEntityIdSchema.parse(operationKey);
  const command = recordCommunicationInputSchema.parse(input);

  return apiRequest(
    `/api/invoices/${invoice}/communications`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(command),
      ...(signal ? { signal } : {}),
    },
    recordCommunicationResponseSchema,
    { timeoutMs: COMMAND_TIMEOUT_MS },
  );
}
