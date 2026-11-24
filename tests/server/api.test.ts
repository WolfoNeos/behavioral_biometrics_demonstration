import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server/index';
import { DEFAULT_THRESHOLDS } from '../../src/shared/types';

let dir: string;
let app: FastifyInstance;
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'api-'));
  app = await buildServer({ dataDir: dir, baseUrl: 'https://demo.test' });
});
afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('API REST', () => {
  it('GET /api/thresholds renvoie les seuils par defaut ; PUT les persiste', async () => {
    const r = await app.inject({ url: '/api/thresholds' });
    expect(r.json()).toEqual(DEFAULT_THRESHOLDS);
    const next = { ...DEFAULT_THRESHOLDS, enrollSamples: 3 };
    await app.inject({ method: 'PUT', url: '/api/thresholds', payload: next });
    expect((await app.inject({ url: '/api/thresholds' })).json()).toEqual(next);
  });

  it('PUT /api/thresholds invalide -> 400 et fichier inchange', async () => {
    const put = (payload: Record<string, unknown>) => app.inject({ method: 'PUT', url: '/api/thresholds', payload });
    const t = DEFAULT_THRESHOLDS;
    expect((await put({ keystroke: t.keystroke })).statusCode).toBe(400);
    expect((await put({ ...t, keystroke: { accept: 40, warn: 60 } })).statusCode).toBe(400);
    expect((await put({ ...t, device: { accept: 'x', warn: 1 } })).statusCode).toBe(400);
    expect((await put({ ...t, enrollSamples: 0 })).statusCode).toBe(400);
    expect((await put({ ...t, enrollSamples: 2.5 })).statusCode).toBe(400);
    expect((await app.inject({ url: '/api/thresholds' })).json()).toEqual(t);
  });

  it('PUT/GET /api/profile', async () => {
    const p = { password: 'pw', pin: '1111', keystroke: null, fingerprint: null, beta: null };
    expect((await app.inject({ method: 'PUT', url: '/api/profile', payload: p })).statusCode).toBe(
      200,
    );
    expect((await app.inject({ url: '/api/profile' })).json()).toEqual(p);
    const bad = await app.inject({ method: 'PUT', url: '/api/profile', payload: { pin: 1 } });
    expect(bad.statusCode).toBe(400);
  });

  it('PUT /api/profile avec un autre mot de passe efface le profil de frappe', async () => {
    const samples = [0, 1, 2].map(() => [{ key: 'p', down: 0, up: 100 }]);
    const put = (payload: Record<string, unknown>) =>
      app.inject({ method: 'PUT', url: '/api/profile', payload });
    await put({ password: 'pw', pin: '1111', keystroke: null, fingerprint: null, beta: 40 });
    await app.inject({ method: 'POST', url: '/api/enroll/keystroke', payload: { samples } });
    const enrolled = (await app.inject({ url: '/api/profile' })).json();
    expect(enrolled.keystroke.samples).toBe(3);
    // meme mot de passe (PIN change) : le profil de frappe reste
    const same = (await put({ ...enrolled, pin: '2222' })).json();
    expect(same.keystroke.samples).toBe(3);
    // nouveau mot de passe : profil de frappe efface, le reste conserve
    const changed = (await put({ ...enrolled, password: 'autre' })).json();
    expect(changed.keystroke).toBeNull();
    expect(changed.beta).toBe(40);
    expect((await app.inject({ url: '/api/profile' })).json().keystroke).toBeNull();
  });

  it('POST /api/enroll/keystroke construit le profil de frappe', async () => {
    const samples = [0, 1, 2].map(() => [
      { key: 'a', down: 0, up: 100 },
      { key: 'b', down: 180, up: 280 },
    ]);
    const r = await app.inject({ method: 'POST', url: '/api/enroll/keystroke', payload: { samples } });
    expect(r.statusCode).toBe(200);
    const profile = (await app.inject({ url: '/api/profile' })).json();
    expect(profile.keystroke.samples).toBe(3);
    expect(profile.keystroke.mean.a.dwell).toBe(100);
    const empty = await app.inject({
      method: 'POST',
      url: '/api/enroll/keystroke',
      payload: { samples: [] },
    });
    expect(empty.statusCode).toBe(400);
  });

  it('POST /api/enroll/phone enregistre empreinte et beta', async () => {
    const fingerprint = {
      userAgent: 'u',
      platform: 'p',
      language: 'fr',
      screen: '1x1',
      timezone: 'UTC',
      canvasHash: 'h',
    };
    await app.inject({ method: 'POST', url: '/api/enroll/phone', payload: { fingerprint, beta: 33 } });
    const profile = (await app.inject({ url: '/api/profile' })).json();
    // l'adresse IP est ajoutée par le serveur (jamais fournie par le client)
    expect(profile.fingerprint).toMatchObject({ ...fingerprint, ip: '127.0.0.1', ipVersion: '4' });
    expect(profile.beta).toBe(33);
  });

  it('POST /api/enroll/phone ignore l IP déclarée par le client et retient celle du proxy', async () => {
    const fingerprint = { userAgent: 'u', platform: 'p', language: 'fr', screen: '1x1', timezone: 'UTC', canvasHash: 'h', ip: '6.6.6.6' };
    await app.inject({
      method: 'POST',
      url: '/api/enroll/phone',
      headers: { 'x-forwarded-for': '9.9.9.9, 192.168.1.50' },
      payload: { fingerprint, beta: 10 },
    });
    expect((await app.inject({ url: '/api/profile' })).json().fingerprint.ip).toBe('192.168.1.50');
  });

  it('PUT /api/profile avec un nouveau mot de passe rafraichit expectedBars du PC', async () => {
    const put = (payload: Record<string, unknown>) => app.inject({ method: 'PUT', url: '/api/profile', payload });
    const samples = [0, 1, 2].map(() => [
      { key: 'a', down: 0, up: 100 },
      { key: 'b', down: 180, up: 280 },
    ]);
    await put({ password: 'ab', pin: '1111', keystroke: null, fingerprint: null, beta: null });
    await app.inject({ method: 'POST', url: '/api/enroll/keystroke', payload: { samples } });
    const { id } = (await app.inject({ method: 'POST', url: '/api/session' })).json();
    await app.ready();
    const states: { expectedBars: unknown[] | null }[] = [];
    let waiter: (() => void) | null = null;
    const ws = await app.injectWS(`/ws?session=${id}&role=pc`, {}, {
      onInit: (sock) =>
        sock.on('message', (d) => {
          states.push(JSON.parse(String(d)));
          waiter?.();
        }),
    });
    /** Attend la prochaine diffusion declenchee par `action`. */
    const after = async (action: () => Promise<unknown>) => {
      const n = states.length;
      const got = new Promise<void>((done) => (waiter = () => states.length > n && done()));
      await action();
      await got;
    };
    if (states.length === 0) await after(async () => {});
    expect(states.at(-1)?.expectedBars).toHaveLength(2);
    await after(() => put({ password: 'abba', pin: '1111', keystroke: null, fingerprint: null, beta: null }));
    // nouveau mot de passe : profil de frappe efface, plus de reference
    expect(states.at(-1)?.expectedBars).toBeNull();
    await after(() => app.inject({ method: 'POST', url: '/api/enroll/keystroke', payload: { samples } }));
    expect(states.at(-1)?.expectedBars).toHaveLength(4);
    expect(JSON.stringify(states.at(-1)?.expectedBars)).not.toMatch(/"[ab]"/);
    ws.terminate();
  });

  it('POST /api/session renvoie {id, url} avec /m/<id>', async () => {
    const { id, url } = (await app.inject({ method: 'POST', url: '/api/session' })).json();
    expect(id).toBeTruthy();
    expect(url).toBe(`https://demo.test/m/${id}`);
  });
});

describe('API réseau (changement de wifi)', () => {
  const nics = {
    wifi: [{ address: '192.168.43.10', family: 'IPv4', internal: false }],
    eth: [{ address: '10.0.0.5', family: 'IPv4', internal: false }],
  };
  let netApp: FastifyInstance;
  let netDir: string;
  beforeEach(async () => {
    netDir = mkdtempSync(join(tmpdir(), 'net-'));
    netApp = await buildServer({
      dataDir: netDir,
      baseUrl: 'https://192.168.1.20:5173',
      getInterfaces: () => nics,
      getCerts: () => null,
    });
  });
  afterEach(async () => {
    await netApp.close();
    rmSync(netDir, { recursive: true, force: true });
  });

  it('GET /api/network : adresse courante et interfaces détectées', async () => {
    const info = (await netApp.inject({ url: '/api/network' })).json();
    expect(info.baseUrl).toBe('https://192.168.1.20:5173');
    expect(info.source).toBe('auto');
    expect(info.candidates.map((c: { address: string }) => c.address)).toEqual(['192.168.43.10', '10.0.0.5']);
    expect(info.certCommand).toMatch(/npm run cert/);
  });

  it('PUT /api/network change l’adresse des QR à chaud', async () => {
    const created = (await netApp.inject({ method: 'POST', url: '/api/session' })).json();
    expect(created.url).toMatch(/^https:\/\/192\.168\.1\.20:5173\/m\//);
    const put = await netApp.inject({ method: 'PUT', url: '/api/network', payload: { baseUrl: '192.168.43.10' } });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ baseUrl: 'https://192.168.43.10:5173', source: 'manual' });
    const next = (await netApp.inject({ method: 'POST', url: '/api/session' })).json();
    expect(next.url).toMatch(/^https:\/\/192\.168\.43\.10:5173\/m\//);
  });

  it('PUT /api/network invalide -> 400, adresse inchangée', async () => {
    for (const baseUrl of ['', 'ftp://x', 42, '://']) {
      const r = await netApp.inject({ method: 'PUT', url: '/api/network', payload: { baseUrl } });
      expect(r.statusCode).toBe(400);
    }
    expect((await netApp.inject({ url: '/api/network' })).json().baseUrl).toBe('https://192.168.1.20:5173');
  });

  it('POST /api/network/detect : repasse sur la meilleure interface détectée', async () => {
    const r = await netApp.inject({ method: 'POST', url: '/api/network/detect' });
    expect(r.json()).toMatchObject({ baseUrl: 'http://192.168.43.10:5173', source: 'auto' });
  });
});

describe('API écran de réussite', () => {
  it('GET renvoie les valeurs par défaut ; PUT les persiste et les nettoie', async () => {
    const first = (await app.inject({ url: '/api/welcome' })).json();
    expect(first.transactions.length).toBeGreaterThan(0);
    const put = await app.inject({
      method: 'PUT',
      url: '/api/welcome',
      payload: { name: 'Prof', notice: 'Bravo', transactions: [{ icon: '🎉', label: 'Party', amount: '− 5' }] },
    });
    expect(put.statusCode).toBe(200);
    const next = (await app.inject({ url: '/api/welcome' })).json();
    expect(next.name).toBe('Prof');
    expect(next.transactions).toEqual([{ icon: '🎉', label: 'Party', amount: '− 5' }]);
  });

  it('PUT invalide -> 400', async () => {
    const r = await app.inject({ method: 'PUT', url: '/api/welcome', payload: '[]', headers: { 'content-type': 'application/json' } });
    expect(r.statusCode).toBe(400);
  });
});


describe('API critères de l’empreinte', () => {
  it('GET : catalogue, réglages (vides par défaut) et dernier relevé', async () => {
    const body = (await app.inject({ url: '/api/criteria' })).json();
    expect(body.criteria.length).toBeGreaterThan(80);
    expect(body.overrides).toEqual({});
    expect(body.last).toBeNull();
  });

  it('PUT enregistre les réglages valides et écarte le reste', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/criteria',
      payload: { cores: { enabled: false, weight: 4 }, inconnu: { enabled: true }, memory: { weight: -2, identity: 'oui' } },
    });
    expect(put.json().overrides).toEqual({ cores: { enabled: false, weight: 4 } });
    expect((await app.inject({ url: '/api/criteria' })).json().overrides.cores.weight).toBe(4);
  });

  it('PUT invalide -> 400', async () => {
    const r = await app.inject({ method: 'PUT', url: '/api/criteria', payload: '[]', headers: { 'content-type': 'application/json' } });
    expect(r.statusCode).toBe(400);
  });
});
