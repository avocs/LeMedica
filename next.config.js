/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['tesseract.js'],
  outputFileTracingIncludes: {'/api/**/*': ['./node_modules/**/*.wasm', './node_modules/**/*.proto']},
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb'
    }
  },
  turbopack: {
    root: __dirname, 
  },
};

module.exports = nextConfig;

