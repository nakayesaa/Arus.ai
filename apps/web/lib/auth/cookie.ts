export function sessionCookieHeader(
  cookieHeader: string | null,
  environment: string | undefined = process.env.NODE_ENV,
  appOrigin: string | undefined = process.env.APP_ORIGIN,
): string | null {
  if (!cookieHeader) return null;

  const secureTransport =
    !appOrigin || new URL(appOrigin).protocol === 'https:';
  const expectedName =
    environment === 'production' && secureTransport
      ? '__Host-arus_session'
      : 'arus_session';
  for (const segment of cookieHeader.split(';')) {
    const cookie = segment.trim();
    if (cookie.startsWith(`${expectedName}=`)) return cookie;
  }
  return null;
}
