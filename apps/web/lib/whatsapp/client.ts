import { apiRequest } from '../api-client/http';
import {
  whatsappConnectionResponseSchema,
  whatsappThreadResponseSchema,
  type WhatsAppThreadResponse,
} from './contracts';

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
