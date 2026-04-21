/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    appDir: true,
    turbopack: false,  // ← Deshabilitar Turbopack
  },
  // Forzar webpack
  webpack: (config) => {
    return config;
  },
};

module.exports = nextConfig;