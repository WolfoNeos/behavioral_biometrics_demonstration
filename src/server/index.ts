import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { buildKeystrokeProfile } from '../shared/scoring/keystroke';
import type { Fingerprint, KeyEvent, Profile, Thresholds } from '../shared/types';
import { SessionManager } from './sessions';
import { loadProfile, loadThresholds, saveProfile, saveThresholds } from './store';

export interface ServerOptions {
  dataDir?: string;
  baseUrl?: string;
}

const PORT = 3001;

export async function buildServer(opts: ServerOptions = {}) {
  const dataDir = resolve(opts.dataDir ?? 'data');
  const profilePath = join(dataDir, 'profile.json');
  const thresholdsPath = join(dataDir, 'thresholds.json');
  const baseUrl = opts.baseUrl ?? 'https://localhost:5173';

  const app = Fastify();
  await app.register(websocket);

  const sessions = new SessionManager({
    getProfile: () => loadProfile(profilePath),
    getThresholds: () => loadThresholds(thresholdsPath),
    baseUrl,
  });

  app.get('/api/profile', async () => loadProfile(profilePath));
  app.put('/api/profile', async (req, reply) => {
    const b = req.body as Partial<Profile> | null;
    if (!b || typeof b.password !== 'string' || typeof b.pin !== 'string') {
      return reply.code(400).send({ error: 'password et pin (texte) requis' });
    }
    saveProfile(b as Profile, profilePath);
    return loadProfile(profilePath);
  });

  app.get('/api/thresholds', async () => loadThresholds(thresholdsPath));
  app.put('/api/thresholds', async (req, reply) => {
    const b = req.body as Thresholds | null;
    if (!b || !b.keystroke || !b.device || !b.orientation) {
      return reply.code(400).send({ error: 'seuils incomplets' });
    }
    saveThresholds(b, thresholdsPath);
    return loadThresholds(thresholdsPath);
  });

  app.post('/api/enroll/keystroke', async (req, reply) => {
    const { samples } = (req.body ?? {}) as { samples?: KeyEvent[][] };
    if (!Array.isArray(samples) || samples.length === 0) {
      return reply.code(400).send({ error: 'samples requis' });
    }
    const profile = { ...loadProfile(profilePath), keystroke: buildKeystrokeProfile(samples) };
    saveProfile(profile, profilePath);
    return profile;
  });

  app.post('/api/enroll/phone', async (req, reply) => {
    const { fingerprint, beta } = (req.body ?? {}) as { fingerprint?: Fingerprint; beta?: number };
    if (!fingerprint || typeof beta !== 'number') {
      return reply.code(400).send({ error: 'fingerprint et beta requis' });
    }
    const profile = { ...loadProfile(profilePath), fingerprint, beta };
    saveProfile(profile, profilePath);
    return profile;
  });

  app.post('/api/session', async () => {
    const s = sessions.create();
    return { id: s.id, url: sessions.url(s.id) };
  });

  app.get('/ws', { websocket: true }, (socket, req) => {
    const { session, role } = req.query as { session?: string; role?: string };
    if (!session || !sessions.has(session) || (role !== 'pc' && role !== 'phone')) {
      socket.close(1008, 'session ou role invalide');
      return;
    }
    if (role === 'pc') sessions.attachPc(session, socket);
    else sessions.attachPhone(session, socket);
  });

  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await buildServer();
  await app.listen({ port: PORT });
}
