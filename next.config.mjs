/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Native/Node-only modules must not be bundled by the server compiler; they
  // are required at runtime from node_modules instead.
  serverExternalPackages: [
    'better-sqlite3',
    'better-sqlite3-multiple-ciphers',
    'keytar',
    // Node-oriented libraries that must not be bundled by the server compiler —
    // pdf.js especially fails when bundled (it expects a Node/runtime context).
    'pdfjs-dist',
    'tesseract.js',
    'googleapis',
    'libsodium-wrappers',
  ],
};

export default nextConfig;
