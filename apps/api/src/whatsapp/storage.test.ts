import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageError, SupabaseEvidenceStorage } from './storage.js';

/**
 * Storage tests verify private Supabase calls without contacting an external project.
 * Organization-scoped keys are encoded as path segments rather than trusted URLs.
 * Service-role credentials stay in server headers and never appear in safe errors.
 * Signed reads are short lived and rebuilt only against the configured Supabase host.
 * Existing immutable objects are accepted while other upload failures remain fatal.
 */

const environment = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-secret-value',
  WHATSAPP_EVIDENCE_BUCKET: 'whatsapp-evidence',
} as const;

describe('SupabaseEvidenceStorage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uploads immutable private bytes with an encoded organization key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await new SupabaseEvidenceStorage(environment).putPrivateObject({
      objectKey: 'org one/evidence/id/proof image.png',
      bytes: Uint8Array.from([1, 2, 3]),
      contentType: 'image/png',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://project-ref.supabase.co/storage/v1/object/whatsapp-evidence/org%20one/evidence/id/proof%20image.png',
    );
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${environment.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: environment.SUPABASE_SERVICE_ROLE_KEY,
      'x-upsert': 'false',
    });
  });

  it('creates a short-lived URL on the configured host', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            signedURL: '/object/sign/bucket/key?token=temporary',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );
    await expect(
      new SupabaseEvidenceStorage(environment).createSignedReadUrl({
        objectKey: 'org/evidence/proof.png',
        expiresInSeconds: 60,
      }),
    ).resolves.toBe(
      'https://project-ref.supabase.co/storage/v1/object/sign/bucket/key?token=temporary',
    );
  });

  it('collapses provider details into a secret-free storage error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('service-role-test-secret-value', { status: 500 }),
        ),
    );
    const result = new SupabaseEvidenceStorage(environment).putPrivateObject({
      objectKey: 'org/evidence/proof.png',
      bytes: Uint8Array.from([1]),
      contentType: 'image/png',
    });
    await expect(result).rejects.toEqual(
      new StorageError('PRIVATE_UPLOAD_FAILED'),
    );
    await expect(result).rejects.not.toThrow(/service-role-test-secret-value/u);
  });
});
