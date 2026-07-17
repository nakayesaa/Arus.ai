import { ApiTimeoutError } from './errors';

export const DEFAULT_API_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  path: string,
  input: string | URL,
  init: RequestInit,
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const externalSignal = init.signal;
  const abortFromExternalSignal = () =>
    controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener('abort', abortFromExternalSignal, {
    once: true,
  });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (timedOut) throw new ApiTimeoutError(path);
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
}
