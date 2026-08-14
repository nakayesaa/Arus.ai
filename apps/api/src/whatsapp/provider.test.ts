import { afterEach, describe, expect, it, vi } from 'vitest';

import { MetaWhatsAppProvider, ProviderError } from './provider.js';

/**
 * Provider tests pin Meta request construction without making network calls.
 * Access tokens remain authorization headers and never enter logged-safe errors.
 * Text acceptance yields only the stable provider message identifier.
 * Media redirects are restricted to trusted Meta-controlled HTTPS hosts.
 * Non-success responses collapse into safe operational failure codes.
 */

const environment = {
  WHATSAPP_ACCESS_TOKEN: 'test-access-token-that-is-long-enough',
  WHATSAPP_EVIDENCE_MAX_BYTES: 8 * 1024 * 1024,
  WHATSAPP_GRAPH_VERSION: 'v23.0',
} as const;

describe('MetaWhatsAppProvider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends exact text through the configured phone-number endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: 'wamid.accepted' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      new MetaWhatsAppProvider(environment).sendText({
        providerPhoneNumberId: 'phone-123',
        recipient: '+6281210000002',
        body: 'Exact approved text',
      }),
    ).resolves.toEqual({ providerMessageId: 'wamid.accepted' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v23.0/phone-123/messages');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${environment.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: '6281210000002',
      text: { body: 'Exact approved text', preview_url: false },
    });
  });

  it('returns a safe error without provider response details', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('secret provider detail', { status: 400 }),
        ),
    );
    const result = new MetaWhatsAppProvider(environment).sendText({
      providerPhoneNumberId: 'phone-123',
      recipient: '+6281210000002',
      body: 'Exact approved text',
    });
    await expect(result).rejects.toEqual(
      new ProviderError('MESSAGE_SEND_FAILED'),
    );
    await expect(result).rejects.not.toThrow(/secret provider detail/u);
  });
});
