import { apiRequest } from '../api-client/http';

import {
  cancelPromiseInputSchema,
  collectionCaseIdSchema,
  createDisputeInputSchema,
  createPromiseInputSchema,
  disputeCommandResponseSchema,
  promiseCommandResponseSchema,
  resolveDisputeInputSchema,
  type CancelPromiseInput,
  type CreateDisputeInput,
  type CreatePromiseInput,
  type DisputeCommandResponse,
  type PromiseCommandResponse,
  type ResolveDisputeInput,
} from './contracts';

const COMMAND_TIMEOUT_MS = 15_000;

export function createPromise(
  invoiceId: string,
  operationKey: string,
  input: CreatePromiseInput,
  signal?: AbortSignal,
): Promise<PromiseCommandResponse> {
  return command(
    `/api/invoices/${validId(invoiceId)}/promises`,
    operationKey,
    createPromiseInputSchema.parse(input),
    promiseCommandResponseSchema,
    signal,
  );
}

export function cancelPromise(
  promiseId: string,
  operationKey: string,
  input: CancelPromiseInput,
  signal?: AbortSignal,
): Promise<PromiseCommandResponse> {
  return command(
    `/api/promises/${validId(promiseId)}/cancel`,
    operationKey,
    cancelPromiseInputSchema.parse(input),
    promiseCommandResponseSchema,
    signal,
  );
}

export function createDispute(
  invoiceId: string,
  operationKey: string,
  input: CreateDisputeInput,
  signal?: AbortSignal,
): Promise<DisputeCommandResponse> {
  return command(
    `/api/invoices/${validId(invoiceId)}/disputes`,
    operationKey,
    createDisputeInputSchema.parse(input),
    disputeCommandResponseSchema,
    signal,
  );
}

export function resolveDispute(
  disputeId: string,
  operationKey: string,
  input: ResolveDisputeInput,
  signal?: AbortSignal,
): Promise<DisputeCommandResponse> {
  return command(
    `/api/disputes/${validId(disputeId)}/resolve`,
    operationKey,
    resolveDisputeInputSchema.parse(input),
    disputeCommandResponseSchema,
    signal,
  );
}

function command<T>(
  path: `/api/${string}`,
  operationKey: string,
  body: unknown,
  responseSchema: Parameters<typeof apiRequest<T>>[2],
  signal?: AbortSignal,
): Promise<T> {
  const idempotencyKey = collectionCaseIdSchema.parse(operationKey);
  return apiRequest(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    },
    responseSchema,
    { timeoutMs: COMMAND_TIMEOUT_MS },
  );
}

function validId(value: string): string {
  return encodeURIComponent(collectionCaseIdSchema.parse(value));
}
