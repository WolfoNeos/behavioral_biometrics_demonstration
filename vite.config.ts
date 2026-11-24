import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadCerts } from './src/server/certs';

// Certificats mkcert optionnels (voir scripts/dev-https.md) : HTTPS si presents, sinon HTTP.
const https = loadCerts() ?? undefined;

export default defineConfig({
  root: '.',
  plugins: [react()],
  server: {
    host: true,
    https,
    // Serveur de demo local : accepte tout Host (tunnel *.trycloudflare.com, ngrok).
    allowedHosts: true,
    proxy: {
      // xfwd : le serveur voit l'adresse réelle du téléphone (critère « IP »)
      '/api': { target: 'http://localhost:3001', xfwd: true },
      '/ws': { target: 'ws://localhost:3001', ws: true, xfwd: true },
    },
  },
});
