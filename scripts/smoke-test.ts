interface HealthResponse {
  status: string;
  service: string;
}

export {};

const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';
const healthUrl = new URL('/health', apiOrigin);

const response = await fetch(healthUrl, {
  headers: {
    'X-Request-ID': 'smoke-test',
  },
  signal: AbortSignal.timeout(5_000),
});

if (!response.ok) {
  throw new Error(`Health check failed with HTTP ${response.status}`);
}

const body = (await response.json()) as HealthResponse;

if (body.status !== 'ok' || body.service !== 'arus-api') {
  throw new Error(`Unexpected health response: ${JSON.stringify(body)}`);
}

if (response.headers.get('x-request-id') !== 'smoke-test') {
  throw new Error('Health response did not propagate the smoke request ID');
}

console.info(`Smoke passed: ${healthUrl.toString()}`);
