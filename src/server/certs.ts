import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Certs {
  cert: Buffer;
  key: Buffer;
}

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Certificats HTTPS locaux (mkcert) : les deux fichiers doivent exister et etre lisibles.
 * Source unique pour Vite et pour le choix du schema de l'URL du QR. Null -> HTTP.
 */
export function loadCerts(root: string = PROJECT_ROOT): Certs | null {
  const certPath = join(root, 'certs', 'dev.pem');
  const keyPath = join(root, 'certs', 'dev-key.pem');
  if (!existsSync(certPath) && !existsSync(keyPath)) return null;
  try {
    return { cert: readFileSync(certPath), key: readFileSync(keyPath) };
  } catch (err) {
    console.warn(`Certificats HTTPS inutilisables (${certPath}, ${keyPath}), retour en HTTP :`, err);
    return null;
  }
}
