import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the workspace root to this project. Without this, Next/Turbopack can
  // infer the wrong root when a stray lockfile exists higher up the tree
  // (e.g. ~/package-lock.json), which breaks runtime module resolution.
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
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
