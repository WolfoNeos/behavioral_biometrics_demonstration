export interface Nic {
  address: string;
  family: string | number;
  internal: boolean;
}
export type Interfaces = Record<string, Nic[] | undefined>;

export interface BaseUrlInput {
  env?: string;
  interfaces: Interfaces;
  hasCerts: boolean;
}

const WEB_PORT = 5173;

/** URL publique du front (celle encodee dans le QR) : env > IPv4 LAN > localhost. */
export function pickBaseUrl({ env, interfaces, hasCerts }: BaseUrlInput): string {
  if (env) return env.replace(/\/+$/, '');
  const scheme = hasCerts ? 'https' : 'http';
  for (const list of Object.values(interfaces)) {
    const nic = list?.find((n) => (n.family === 'IPv4' || n.family === 4) && !n.internal);
    if (nic) return `${scheme}://${nic.address}:${WEB_PORT}`;
  }
  return `${scheme}://localhost:${WEB_PORT}`;
}
