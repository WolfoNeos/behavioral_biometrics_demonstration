import { X509Certificate } from 'node:crypto';
import { listCandidates } from './baseUrl';
import type { Interfaces } from './baseUrl';

export type NetworkSource = 'env' | 'auto' | 'manual';

export interface NetworkCandidate {
  name: string;
  address: string;
  /** URL du front (celle du QR) si on choisit cette interface. */
  url: string;
  active: boolean;
  /** Certificat valable pour cette adresse ; null si HTTP (rien à vérifier). */
  covered: boolean | null;
}

export interface NetworkInfo {
  baseUrl: string;
  source: NetworkSource;
  https: boolean;
  candidates: NetworkCandidate[];
  /** Hôtes couverts par le certificat HTTPS (vide sans certificat). */
  certHosts: string[];
  certValidTo: string | null;
  /** Le certificat couvre-t-il l'adresse actuelle ? null en HTTP. */
  covered: boolean | null;
  /** Commande à lancer quand l'adresse n'est pas couverte. */
  certCommand: string;
}

const WEB_PORT = 5173;

/** Hôtes (DNS et IP) d'un certificat PEM, et sa date de fin de validité. */
export function readCert(pem: Buffer | string): { hosts: string[]; validTo: string } | null {
  try {
    const x = new X509Certificate(pem);
    const hosts = (x.subjectAltName ?? '')
      .split(',')
      .map((e) => e.trim())
      .map((e) => (e.startsWith('DNS:') ? e.slice(4) : e.startsWith('IP Address:') ? e.slice(11) : ''))
      .filter(Boolean);
    return { hosts, validTo: new Date(x.validTo).toISOString() };
  } catch {
    return null;
  }
}

/** URL saisie à la main -> origine normalisée (http/https, sans chemin), ou null si invalide. */
export function normalizeBaseUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    // sans port explicite, on garde celui du front de la démo
    const port = u.port || (u.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) ? String(WEB_PORT) : '');
    return `${u.protocol}//${u.hostname}${port ? `:${port}` : ''}`;
  } catch {
    return null;
  }
}

export function describeNetwork(input: {
  baseUrl: string;
  source: NetworkSource;
  interfaces: Interfaces;
  certPem: Buffer | string | null;
}): NetworkInfo {
  const { baseUrl, source, interfaces, certPem } = input;
  const https = baseUrl.startsWith('https://');
  const cert = certPem ? readCert(certPem) : null;
  const covers = (host: string): boolean | null => (https ? !!cert && cert.hosts.includes(host) : null);
  let host = '';
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    // URL invalide : jamais produite par le serveur, on reste neutre
  }
  const scheme = https ? 'https' : 'http';
  const candidates = listCandidates(interfaces).map((c): NetworkCandidate => {
    const url = `${scheme}://${c.address}:${WEB_PORT}`;
    return { name: c.name, address: c.address, url, active: url === baseUrl, covered: covers(c.address) };
  });
  return {
    baseUrl,
    source,
    https,
    candidates,
    certHosts: cert?.hosts ?? [],
    certValidTo: cert?.validTo ?? null,
    covered: covers(host),
    certCommand: 'npm run cert -- --force',
  };
}
