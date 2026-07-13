import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '@fontsource-variable/manrope/wght.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'AR Collections OS',
    template: '%s | AR Collections OS',
  },
  description: 'Internal workspace for managed accounts receivable collection.',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
