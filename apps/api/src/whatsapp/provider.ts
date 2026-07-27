import { z } from 'zod';

import type { Environment } from '../config/env.js';
import type { DownloadedMedia, WhatsAppProviderAdapter } from './contracts.js';

const mediaMetadataSchema = z.object({
  url: z.url(),
  mime_type: z.string().max(100).optional(),
});

export function createWhatsAppProvider(
  environment: Environment,
): WhatsAppProviderAdapter {
  return environment.WHATSAPP_PROVIDER_MODE === 'meta'
    ? new MetaWhatsAppProvider(environment)
    : new DeterministicWhatsAppProvider();
}

export class MetaWhatsAppProvider implements WhatsAppProviderAdapter {
  constructor(
    private readonly environment: Pick<
      Environment,
      | 'WHATSAPP_ACCESS_TOKEN'
      | 'WHATSAPP_EVIDENCE_MAX_BYTES'
      | 'WHATSAPP_GRAPH_VERSION'
    >,
  ) {}

  async downloadMedia(providerMediaId: string): Promise<DownloadedMedia> {
    const accessToken = required(
      this.environment.WHATSAPP_ACCESS_TOKEN,
      'Meta access token is unavailable',
    );
    const metadataResponse = await fetch(
      `https://graph.facebook.com/${this.environment.WHATSAPP_GRAPH_VERSION}/${encodeURIComponent(providerMediaId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!metadataResponse.ok) {
      throw new ProviderError('MEDIA_METADATA_FAILED');
    }
    const metadata = mediaMetadataSchema.parse(await metadataResponse.json());
    assertMetaMediaUrl(metadata.url);

    const mediaResponse = await fetch(metadata.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    if (!mediaResponse.ok || !mediaResponse.body) {
      throw new ProviderError('MEDIA_DOWNLOAD_FAILED');
    }
    return {
      bytes: await readBoundedBody(
        mediaResponse.body,
        this.environment.WHATSAPP_EVIDENCE_MAX_BYTES,
      ),
      declaredMime:
        mediaResponse.headers.get('content-type') ?? metadata.mime_type ?? null,
    };
  }
}

export class DeterministicWhatsAppProvider implements WhatsAppProviderAdapter {
  async downloadMedia(): Promise<DownloadedMedia> {
    return {
      bytes: Uint8Array.from([
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0,
        2, 0, 0, 0, 3,
      ]),
      declaredMime: 'image/png',
    };
  }
}

export class ProviderError extends Error {
  constructor(readonly code: string) {
    super('WhatsApp provider operation failed');
    this.name = 'ProviderError';
  }
}

async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  maximumBytes: number,
): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        throw new ProviderError('MEDIA_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function assertMetaMediaUrl(value: string): void {
  const url = new URL(value);
  const allowed =
    url.protocol === 'https:' &&
    ['facebook.com', 'fbcdn.net', 'fbsbx.com'].some(
      (suffix) =>
        url.hostname === suffix || url.hostname.endsWith(`.${suffix}`),
    );
  if (!allowed) throw new ProviderError('UNTRUSTED_MEDIA_URL');
}

function required(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}
