import { apiRequest } from '../api-client/http';
import {
  recordPaymentResponseSchema,
  type RecordPaymentInput,
} from '../payments/contracts';
import {
  evidenceDecisionResponseSchema,
  evidenceViewResponseSchema,
  paymentEvidenceResponseSchema,
  whatsappConnectionResponseSchema,
  whatsappMessageResponseSchema,
  whatsappThreadResponseSchema,
  type WhatsAppThreadResponse,
} from './contracts';

/**
 * WhatsApp browser commands attach fresh UUID idempotency keys to every mutation.
 * Responses are parsed before state reaches the focused drawer or review surface.
 * Callers may cancel reads during close, navigation, or polling backoff.
 * Provider and storage credentials never appear in these browser requests.
 * A successful command reflects durable API state, not an assumed Meta outcome.
 */

export function getWhatsAppThread(input: {
  debtorId: string;
  invoiceId: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<WhatsAppThreadResponse> {
  const query = new URLSearchParams({
    invoiceId: input.invoiceId,
    limit: String(input.limit ?? 50),
  });
  return apiRequest(
    `/api/debtors/${encodeURIComponent(input.debtorId)}/whatsapp-thread?${query}`,
    input.signal ? { signal: input.signal } : {},
    whatsappThreadResponseSchema,
  );
}

export function updateWhatsAppConnectionState(
  state: 'LIVE' | 'PAUSED',
  signal?: AbortSignal,
) {
  return apiRequest(
    '/api/whatsapp/connection/state',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
      ...(signal ? { signal } : {}),
    },
    whatsappConnectionResponseSchema,
  );
}

export function sendWhatsAppMessage(input: {
  debtorId: string;
  invoiceId: string;
  body: string;
  operationKey?: string;
}) {
  return apiRequest(
    `/api/debtors/${encodeURIComponent(input.debtorId)}/whatsapp-messages`,
    mutation(input.operationKey, {
      invoiceId: input.invoiceId,
      body: input.body,
    }),
    whatsappMessageResponseSchema,
  );
}

export function getPaymentEvidence(evidenceId: string, signal?: AbortSignal) {
  return apiRequest(
    `/api/payment-evidence/${encodeURIComponent(evidenceId)}`,
    signal ? { signal } : {},
    paymentEvidenceResponseSchema,
  );
}

export function createEvidenceView(evidenceId: string) {
  return apiRequest(
    `/api/payment-evidence/${encodeURIComponent(evidenceId)}/view`,
    mutation(undefined, {}),
    evidenceViewResponseSchema,
  );
}

export function rejectPaymentEvidence(input: {
  evidenceId: string;
  reason: string;
  operationKey?: string;
}) {
  return apiRequest(
    `/api/payment-evidence/${encodeURIComponent(input.evidenceId)}/reject`,
    mutation(input.operationKey, { reason: input.reason }),
    evidenceDecisionResponseSchema,
  );
}

export function confirmEvidencePayment(input: {
  evidenceId: string;
  invoiceId: string;
  payment: RecordPaymentInput;
  operationKey?: string;
}) {
  return apiRequest(
    `/api/payment-evidence/${encodeURIComponent(input.evidenceId)}/confirm-payment`,
    mutation(input.operationKey, {
      invoiceId: input.invoiceId,
      ...input.payment,
    }),
    recordPaymentResponseSchema,
  );
}

function mutation(
  operationKey: string | undefined,
  body: unknown,
): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': operationKey ?? crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  };
}
