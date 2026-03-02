/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // Determine the destination, defaulting to a valid URL string to prevent build failure
    const destination = (process.env.NEXT_PUBLIC_API_URL || "https://agi-1-superintelligent-mind.onrender.com").replace(/\/$/, "");
    
    return [
      {
        source: '/api/:path*',
        destination: `${destination}/api/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
