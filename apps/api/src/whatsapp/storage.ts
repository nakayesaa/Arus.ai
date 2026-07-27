import { z } from 'zod';

import type { Environment } from '../config/env.js';
import type { EvidenceStorage } from './contracts.js';

const signedUrlSchema = z.object({
  signedURL: z.string().startsWith('/'),
});

export function createEvidenceStorage(
  environment: Environment,
): EvidenceStorage {
  return environment.EVIDENCE_STORAGE_MODE === 'supabase'
    ? new SupabaseEvidenceStorage(environment)
    : new MemoryEvidenceStorage();
}

export class SupabaseEvidenceStorage implements EvidenceStorage {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;

  constructor(
    environment: Pick<
      Environment,
      'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'WHATSAPP_EVIDENCE_BUCKET'
    >,
  ) {
    this.baseUrl = required(
      environment.SUPABASE_URL,
      'Supabase URL is unavailable',
    ).replace(/\/$/u, '');
    this.serviceRoleKey = required(
      environment.SUPABASE_SERVICE_ROLE_KEY,
      'Supabase service role key is unavailable',
    );
    this.bucket = environment.WHATSAPP_EVIDENCE_BUCKET;
  }

  private readonly bucket: string;

  async putPrivateObject(input: {
    objectKey: string;
    bytes: Uint8Array;
    contentType: string;
  }): Promise<void> {
    const response = await fetch(this.objectUrl(input.objectKey), {
      method: 'POST',
      headers: {
        ...this.authorizationHeaders(),
        'Content-Type': input.contentType,
        'x-upsert': 'false',
      },
      body: input.bytes,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok && response.status !== 409) {
      throw new StorageError('PRIVATE_UPLOAD_FAILED');
    }
  }

  async createSignedReadUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const response = await fetch(
      `${this.baseUrl}/storage/v1/object/sign/${encodePath(this.bucket)}/${encodePath(input.objectKey)}`,
      {
        method: 'POST',
        headers: {
          ...this.authorizationHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: input.expiresInSeconds }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new StorageError('SIGNED_URL_FAILED');
    const result = signedUrlSchema.parse(await response.json());
    return new URL(`/storage/v1${result.signedURL}`, this.baseUrl).toString();
  }

  private objectUrl(objectKey: string): string {
    return `${this.baseUrl}/storage/v1/object/${encodePath(this.bucket)}/${encodePath(objectKey)}`;
  }

  private authorizationHeaders(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }
}

export class MemoryEvidenceStorage implements EvidenceStorage {
  private readonly objects = new Map<string, Uint8Array>();

  async putPrivateObject(input: {
    objectKey: string;
    bytes: Uint8Array;
  }): Promise<void> {
    if (!this.objects.has(input.objectKey)) {
      this.objects.set(input.objectKey, input.bytes.slice());
    }
  }

  async createSignedReadUrl(input: {
    objectKey: string;
    expiresInSeconds: number;
  }): Promise<string> {
    if (!this.objects.has(input.objectKey)) {
      throw new StorageError('OBJECT_NOT_FOUND');
    }
    return `memory://private/${encodeURIComponent(input.objectKey)}?ttl=${input.expiresInSeconds}`;
  }
}

export class StorageError extends Error {
  constructor(readonly code: string) {
    super('Private evidence storage operation failed');
    this.name = 'StorageError';
  }
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

function required(value: string | undefined, message: string): string {
  if (!value) throw new Error(message);
  return value;
}
