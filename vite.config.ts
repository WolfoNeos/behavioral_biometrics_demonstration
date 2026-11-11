import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Certificats mkcert optionnels (voir scripts/dev-https.md) : HTTPS si presents, sinon HTTP.
const CERT = 'certs/dev.pem';
const KEY = 'certs/dev-key.pem';
const https =
  existsSync(CERT) && existsSync(KEY)
    ? { cert: readFileSync(CERT), key: readFileSync(KEY) }
    : undefined;

export default defineConfig({
  root: '.',
  plugins: [react()],
  server: {
    host: true,
    https,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
