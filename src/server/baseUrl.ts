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

export interface Candidate {
  name: string;
  address: string;
}

const WEB_PORT = 5173;
const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vbox|vmware|vmnet|docker|loopback|br-|veth/i;

/** Rang d'une adresse : 192.168 < 10 < 172.16-31 < autres ; null si link-local. */
function rank(address: string): number | null {
  const p = address.split('.').map(Number);
  if (p[0] === 169 && p[1] === 254) return null;
  if (p[0] === 192 && p[1] === 168) return 0;
  if (p[0] === 10) return 1;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return 2;
  return 3;
}

/** IPv4 candidates, best first : adaptateurs reels avant virtuels, puis par plage privee. */
export function listCandidates(interfaces: Interfaces): Candidate[] {
  const out: { c: Candidate; virtual: boolean; r: number }[] = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const n of list ?? []) {
      if (!(n.family === 'IPv4' || n.family === 4) || n.internal) continue;
      const r = rank(n.address);
      if (r === null) continue;
      out.push({ c: { name, address: n.address }, virtual: VIRTUAL.test(name), r });
    }
  }
  out.sort((a, b) => Number(a.virtual) - Number(b.virtual) || a.r - b.r);
  return out.map((x) => x.c);
}

/** URL publique du front (celle encodee dans le QR) : env > meilleure IPv4 LAN > localhost. */
export function pickBaseUrl({ env, interfaces, hasCerts }: BaseUrlInput): string {
  if (env) return env.replace(/\/+$/, '');
  const scheme = hasCerts ? 'https' : 'http';
  const best = listCandidates(interfaces)[0];
  return `${scheme}://${best ? best.address : 'localhost'}:${WEB_PORT}`;
}
