/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export',  <-- DISABLED TO ALLOW API ROUTES
  images: { unoptimized: true },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_BACKEND_URL + '/api/:path*' || 'http://localhost:8000/api/:path*',
      },
    ]
  },
}
module.exports = nextConfig
