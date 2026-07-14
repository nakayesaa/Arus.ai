import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  async rewrites() {
    const apiOrigin = new URL(process.env.API_ORIGIN ?? 'http://localhost:4000')
      .origin;

    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
