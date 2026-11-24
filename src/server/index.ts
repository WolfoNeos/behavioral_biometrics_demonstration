import { networkInterfaces } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { buildKeystrokeProfile } from '../shared/scoring/keystroke';
import type { Fingerprint, KeyEvent, Profile, Thresholds } from '../shared/types';
import { listCandidates, pickBaseUrl } from './baseUrl';
import type { Interfaces } from './baseUrl';
import { loadCerts } from './certs';
import type { Certs } from './certs';
import { describeNetwork, normalizeBaseUrl } from './network';
import type { NetworkSource } from './network';
import { SessionManager } from './sessions';
import {
  loadCriteria,
  loadProfile,
  loadThresholds,
  loadWelcome,
  saveCriteria,
  saveProfile,
  saveThresholds,
  saveWelcome,
} from './store';
import { sanitizeFingerprint, withServerFields } from '../shared/fingerprint';
import { CRITERIA, sanitizeCriteria } from '../shared/criteria';
import { serverFingerprintFields } from './clientIp';
import { sanitizeWelcome } from '../shared/welcome';

export interface ServerOptions {
  dataDir?: string;
  baseUrl?: string;
  /** Origine de l'adresse de base : variable d'environnement, détection ou manual entry. */
  baseUrlSource?: NetworkSource;
  /** Interfaces réseau (injectable pour les tests). */
  getInterfaces?: () => Interfaces;
  /** Certificats HTTPS (injectable pour les tests). */
  getCerts?: () => Certs | null;
}

const PORT = 3001;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const band = (v: unknown): boolean => {
  const o = v as { accept?: unknown; warn?: unknown } | null;
  return !!o && num(o.accept) && num(o.warn) && o.accept >= o.warn;
};

function validThresholds(b: Thresholds | null): b is Thresholds {
  return (
    !!b &&
    band(b.keystroke) &&
    band(b.device) &&
    band(b.orientation) &&
    num(b.orientation.toleranceDeg) &&
    b.orientation.toleranceDeg > 0 &&
    Number.isInteger(b.enrollSamples) &&
    b.enrollSamples >= 1
  );
}

export async function buildServer(opts: ServerOptions = {}) {
  const dataDir = resolve(opts.dataDir ?? 'data');
  const profilePath = join(dataDir, 'profile.json');
  const thresholdsPath = join(dataDir, 'thresholds.json');
  const welcomePath = join(dataDir, 'welcome.json');
  const criteriaPath = join(dataDir, 'criteria.json');
  const baseUrl = opts.baseUrl ?? 'https://localhost:5173';
  let baseUrlSource: NetworkSource = opts.baseUrlSource ?? 'auto';
  const getInterfaces = opts.getInterfaces ?? (() => networkInterfaces());
  const getCerts = opts.getCerts ?? (() => loadCerts());

  const app = Fastify();
  await app.register(websocket);

  const sessions = new SessionManager({
    getProfile: () => loadProfile(profilePath),
    getThresholds: () => loadThresholds(thresholdsPath),
    getCriteria: () => loadCriteria(criteriaPath),
    baseUrl,
  });

  app.get('/api/profile', async () => loadProfile(profilePath));
  app.put('/api/profile', async (req, reply) => {
    const b = req.body as Partial<Profile> | null;
    if (!b || typeof b.password !== 'string' || typeof b.pin !== 'string') {
      return reply.code(400).send({ error: 'password and pin (text) required' });
    }
    // nouveau mot de passe : l'ancien profil de frappe ne correspond plus aux touches tapees
    const previous = loadProfile(profilePath);
    const next = b.password === previous.password ? (b as Profile) : { ...(b as Profile), keystroke: null };
    saveProfile(next, profilePath);
    sessions.broadcastAll();
    return loadProfile(profilePath);
  });

  app.get('/api/thresholds', async () => loadThresholds(thresholdsPath));
  app.put('/api/thresholds', async (req, reply) => {
    const b = req.body as Thresholds | null;
    if (!validThresholds(b)) {
      return reply.code(400).send({ error: 'invalid or incomplete thresholds' });
    }
    saveThresholds(b, thresholdsPath);
    sessions.broadcastAll();
    return loadThresholds(thresholdsPath);
  });

  // Screen affiché une fois la sécurité passée (textes, solde, blagues…)
  app.get('/api/welcome', async () => loadWelcome(welcomePath));
  app.put('/api/welcome', async (req, reply) => {
    const b = req.body as Record<string, unknown> | null;
    if (!b || typeof b !== 'object' || Array.isArray(b)) {
      return reply.code(400).send({ error: 'invalid content' });
    }
    saveWelcome(sanitizeWelcome(b), welcomePath);
    return loadWelcome(welcomePath);
  });


  // Critères de l'empreinte : catalogue, réglages (actif, poids, identité) et dernier relevé
  const criteriaPayload = () => ({
    criteria: CRITERIA,
    overrides: loadCriteria(criteriaPath),
    last: sessions.lastDeviceLines(),
  });
  app.get('/api/criteria', async () => criteriaPayload());
  app.put('/api/criteria', async (req, reply) => {
    const b = req.body;
    if (b === null || typeof b !== 'object' || Array.isArray(b)) {
      return reply.code(400).send({ error: 'invalid content' });
    }
    saveCriteria(sanitizeCriteria(b), criteriaPath);
    sessions.broadcastAll();
    return criteriaPayload();
  });

  app.post('/api/enroll/keystroke', async (req, reply) => {
    const { samples } = (req.body ?? {}) as { samples?: KeyEvent[][] };
    if (!Array.isArray(samples) || samples.length === 0) {
      return reply.code(400).send({ error: 'samples required' });
    }
    const profile = { ...loadProfile(profilePath), keystroke: buildKeystrokeProfile(samples) };
    saveProfile(profile, profilePath);
    sessions.broadcastAll();
    return profile;
  });

  app.post('/api/enroll/phone', async (req, reply) => {
    const { fingerprint: rawFingerprint, beta } = (req.body ?? {}) as { fingerprint?: unknown; beta?: number };
    const fingerprint = sanitizeFingerprint(rawFingerprint);
    if (!fingerprint || typeof beta !== 'number') {
      return reply.code(400).send({ error: 'fingerprint and beta required' });
    }
    const server = serverFingerprintFields(req.headers, req.socket.remoteAddress);
    const profile = { ...loadProfile(profilePath), fingerprint: withServerFields(fingerprint, server), beta };
    saveProfile(profile, profilePath);
    sessions.broadcastAll();
    return profile;
  });

  // Network : adresse encodée dans les QR, modifiable à chaud (changement de wifi)
  const network = () =>
    describeNetwork({
      baseUrl: sessions.getBaseUrl(),
      source: baseUrlSource,
      interfaces: getInterfaces(),
      certPem: getCerts()?.cert ?? null,
    });

  app.get('/api/network', async () => network());
  app.put('/api/network', async (req, reply) => {
    const url = normalizeBaseUrl((req.body as { baseUrl?: unknown } | null)?.baseUrl);
    if (!url) return reply.code(400).send({ error: 'invalid address (e.g. https://192.168.1.20:5173)' });
    baseUrlSource = 'manual';
    sessions.setBaseUrl(url);
    return network();
  });
  // redétection : meilleure interface actuelle (nouveau wifi), schéma selon les certificats
  app.post('/api/network/detect', async () => {
    baseUrlSource = 'auto';
    sessions.setBaseUrl(pickBaseUrl({ interfaces: getInterfaces(), hasCerts: getCerts() !== null }));
    return network();
  });

  app.post('/api/session', async () => {
    const s = sessions.create();
    return { id: s.id, url: sessions.url(s.id) };
  });

  app.get('/ws', { websocket: true }, (socket, req) => {
    const { session, role } = req.query as { session?: string; role?: string };
    if (!session || !sessions.has(session) || (role !== 'pc' && role !== 'phone')) {
      socket.close(1008, 'invalid session or role');
      return;
    }
    if (role === 'pc') sessions.attachPc(session, socket);
    else sessions.attachPhone(session, socket, serverFingerprintFields(req.headers, req.socket.remoteAddress));
  });

  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const interfaces = networkInterfaces();
  const baseUrl = pickBaseUrl({
    env: process.env.DEMO_BASE_URL,
    interfaces,
    hasCerts: loadCerts() !== null,
  });
  for (const c of listCandidates(interfaces)) console.log(`Network candidate: ${c.name} ${c.address}`);
  const app = await buildServer({ baseUrl, baseUrlSource: process.env.DEMO_BASE_URL ? 'env' : 'auto' });
  await app.listen({ port: PORT });
  console.log(`Base URL (QR): ${baseUrl}`);
}
