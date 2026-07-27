import { serverApiRequest } from '../api-client/server';
import {
  nullableWhatsAppConnectionResponseSchema,
  type WhatsAppConnection,
} from './contracts';

export function getWhatsAppConnection(): Promise<{
  data: WhatsAppConnection | null;
}> {
  return serverApiRequest(
    '/api/whatsapp/connection',
    nullableWhatsAppConnectionResponseSchema,
  );
}
