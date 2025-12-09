/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['tesseract.js'],
    outputFileTracingIncludes: {'/api/**/*': ['./node_modules/**/*.wasm', './node_modules/**/*.proto']}
  }
};

module.exports = nextConfig;

