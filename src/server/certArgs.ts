/** Fonctions pures du generateur de certificat auto-signe (scripts/make-cert.mjs). */

export const CERT_DAYS = 30;
export const CERT_CN = 'demo-biometrie';

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Entrees SAN dedupliquees : localhost et 127.0.0.1 toujours presents, puis IP LAN, puis hotes extra. */
export function buildSanEntries(lanIps: string[], extraHosts: string[] = []): string[] {
  const entries = ['DNS:localhost', 'IP:127.0.0.1'];
  for (const raw of [...lanIps, ...extraHosts]) {
    const h = raw.trim();
    if (!h) continue;
    const e = IPV4.test(h) ? `IP:${h}` : `DNS:${h}`;
    if (!entries.includes(e)) entries.push(e);
  }
  return entries;
}

export function buildSan(lanIps: string[], extraHosts: string[] = []): string {
  return buildSanEntries(lanIps, extraHosts).join(',');
}

/** Fichier de config openssl (evite -subj, que MSYS deformerait sous Windows). */
export function buildOpensslConfig(san: string): string {
  return [
    '[req]',
    'distinguished_name = dn',
    'x509_extensions = ext',
    'prompt = no',
    '[dn]',
    `CN = ${CERT_CN}`,
    '[ext]',
    `subjectAltName = ${san}`,
    'basicConstraints = critical,CA:FALSE',
    'keyUsage = critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage = serverAuth',
    '',
  ].join('\n');
}

export function buildOpensslArgs(o: { configPath: string; keyPath: string; certPath: string; days?: number }): string[] {
  return [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256',
    '-days', String(o.days ?? CERT_DAYS),
    '-config', o.configPath,
    '-keyout', o.keyPath,
    '-out', o.certPath,
  ];
}

/** Chemin d'openssl : PATH (resolu par l'appelant) sinon emplacements usuels de Git for Windows. */
export function pickOpenssl(opts: { onPath: boolean; exists: (p: string) => boolean; programFiles?: string[] }): string | null {
  if (opts.onPath) return 'openssl';
  const roots = opts.programFiles ?? ['C:\\Program Files\\Git', 'C:\\Program Files (x86)\\Git'];
  for (const r of roots) {
    for (const sub of ['mingw64\\bin\\openssl.exe', 'usr\\bin\\openssl.exe']) {
      const p = `${r}\\${sub}`;
      if (opts.exists(p)) return p;
    }
  }
  return null;
}
