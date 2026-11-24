/** `::ffff:192.168.1.5` -> `192.168.1.5` ; vide si l'adresse est absente. */
export function normalizeIp(raw: string | undefined | null): string {
  if (!raw) return '';
  const ip = raw.trim();
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * Adresse du client. Derrière le proxy de Vite (en-tête `x-forwarded-for`), on prend la DERNIÈRE
 * valeur : c'est celle que le proxy local a ajoutée, pas une valeur envoyée par le client.
 */
export function clientIp(headers: Record<string, string | string[] | undefined>, socketAddress?: string): string {
  const fwd = headers['x-forwarded-for'];
  const value = Array.isArray(fwd) ? fwd.join(',') : fwd;
  if (value) {
    const last = value.split(',').pop();
    if (last && last.trim()) return normalizeIp(last);
  }
  return normalizeIp(socketAddress);
}

type Headers = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v.join(', ') : (v ?? '')).trim();

/**
 * Critères relevés par le serveur sur la requête du téléphone : adresse et en-têtes que le
 * navigateur envoie tout seul. Seuls les en-têtes identiques sur une requête fetch (enrôlement)
 * et sur la connexion WebSocket (démo) sont retenus : les indications Sec-CH-UA ne sont pas
 * envoyées de la même façon par les deux, elles donneraient de faux écarts.
 */
export function serverFingerprintFields(headers: Headers, socketAddress?: string): Record<string, string> {
  const ip = clientIp(headers, socketAddress);
  const header = (name: string): string => one(headers[name]) || 'unavailable';
  return {
    ip: ip || 'unknown',
    ipVersion: ip.includes(':') ? '6' : ip ? '4' : 'unknown',
    acceptLanguage: header('accept-language'),
  };
}
