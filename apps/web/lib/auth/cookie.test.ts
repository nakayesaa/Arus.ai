import { describe, expect, it } from 'vitest';

import { sessionCookieHeader } from './cookie';

describe('sessionCookieHeader', () => {
  it('forwards only the expected non-production session cookie', () => {
    expect(
      sessionCookieHeader(
        'theme=dark; arus_session=session-token; analytics=value',
        'development',
      ),
    ).toBe('arus_session=session-token');
  });

  it('requires the host-prefixed cookie in production', () => {
    expect(
      sessionCookieHeader(
        'arus_session=development; __Host-arus_session=production',
        'production',
      ),
    ).toBe('__Host-arus_session=production');
    expect(
      sessionCookieHeader('arus_session=development', 'production'),
    ).toBeNull();
  });

  it('supports a production web build against an explicit HTTP test origin', () => {
    expect(
      sessionCookieHeader(
        'arus_session=test; __Host-arus_session=production',
        'production',
        'http://127.0.0.1:3000',
      ),
    ).toBe('arus_session=test');
  });
});
