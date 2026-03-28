const systemContract = require("./system-contract.json");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  experimental: {
    instrumentationHook: true,
  },
  async rewrites() {
    const destination = (process.env.AGI1_API_BASE || process.env.NEXT_PUBLIC_API_URL || systemContract.domains.api).replace(/\/$/, "");
    return {
      beforeFiles: [],
      afterFiles: [
        // Proxy the production AGI backend paths that power the live neural surface.
        { source: '/api/chat', destination: `${destination}/api/chat` },
        { source: '/api/chat/history', destination: `${destination}/api/chat/history` },
        { source: '/api/neural/runtime', destination: `${destination}/api/neural/runtime` },
        { source: '/api/livekit-token', destination: `${destination}/api/livekit-token` },
        { source: '/api/livekit-token/refresh', destination: `${destination}/api/livekit-token/refresh` },
        { source: '/api/livekit-runtime', destination: `${destination}/api/livekit-runtime` },
        { source: '/api/livekit-end', destination: `${destination}/api/livekit-end` },
        { source: '/api/vision/frame', destination: `${destination}/api/vision/frame` },
        { source: '/v1/neural/runtime', destination: `${destination}/v1/neural/runtime` },
      ],
      fallback: [],
    };
  },
}
module.exports = nextConfig
