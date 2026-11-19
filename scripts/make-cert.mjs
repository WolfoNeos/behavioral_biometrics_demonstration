// Certificat HTTPS auto-signe (openssl) pour la demo : npm run cert [-- --force] [ip-ou-hote ...]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, networkInterfaces } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCandidates } from '../src/server/baseUrl.ts';
import { buildSan, buildOpensslConfig, buildOpensslArgs, pickOpenssl, CERT_DAYS } from '../src/server/certArgs.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const extra = args.filter((a) => !a.startsWith('--'));

const onPath = spawnSync('openssl', ['version'], { encoding: 'utf8' }).status === 0;
const openssl = pickOpenssl({ onPath, exists: existsSync });
if (!openssl) {
  console.error(
    "openssl introuvable.\n- Installer Git for Windows (https://git-scm.com), qui fournit openssl, puis relancer `npm run cert`.\n- Ou installer mkcert et suivre scripts/dev-https.md (section mkcert).",
  );
  process.exit(1);
}

const certDir = join(root, 'certs');
const certPath = join(certDir, 'dev.pem');
const keyPath = join(certDir, 'dev-key.pem');
if ((existsSync(certPath) || existsSync(keyPath)) && !force) {
  console.error('certs/dev.pem ou certs/dev-key.pem existe deja. Relancer avec --force pour regenerer : npm run cert -- --force');
  process.exit(1);
}
mkdirSync(certDir, { recursive: true });

const lanIps = listCandidates(networkInterfaces()).map((c) => c.address);
const san = buildSan(lanIps, extra);
const tmp = mkdtempSync(join(tmpdir(), 'demo-cert-'));
try {
  const configPath = join(tmp, 'openssl.cnf');
  writeFileSync(configPath, buildOpensslConfig(san));
  const r = spawnSync(openssl, buildOpensslArgs({ configPath, keyPath, certPath }), { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('echec openssl :', r.stderr || r.error);
    process.exit(1);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

const expiry = new Date(Date.now() + CERT_DAYS * 86400000).toLocaleDateString('fr-FR');
const firstIp = san.split(',').find((e) => e.startsWith('IP:') && e !== 'IP:127.0.0.1');
console.log(`Certificat auto-signe genere (valable ${CERT_DAYS} jours, jusqu'au ${expiry}).`);
console.log(`  certs/dev.pem et certs/dev-key.pem (ne jamais commiter la cle)`);
console.log(`  SAN : ${san.replaceAll(',', ', ')}`);
console.log('\nEtapes suivantes :');
console.log('  1. Relancer `npm start` (le QR passe en https automatiquement).');
console.log(`  2. Sur chaque appareil (telephones et PC), ouvrir https://${firstIp ? firstIp.slice(3) : 'localhost'}:5173 et accepter l'avertissement du navigateur.`);
console.log("  3. IP changee (point d acces) ou certificat expire : npm run cert -- --force <ip>");
