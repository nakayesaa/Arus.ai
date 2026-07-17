export function sessionCookieHeader(
  cookieHeader: string | null,
  environment: string | undefined = process.env.NODE_ENV,
): string | null {
  if (!cookieHeader) return null;

  const expectedName =
    environment === 'production' ? '__Host-arus_session' : 'arus_session';
  for (const segment of cookieHeader.split(';')) {
    const cookie = segment.trim();
    if (cookie.startsWith(`${expectedName}=`)) return cookie;
  }
  return null;
}
