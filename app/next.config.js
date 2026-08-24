/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@ffmpeg-installer/ffmpeg", "fluent-ffmpeg"]
  }
};

module.exports = nextConfig;
