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
    expect(profile.fingerprint).toEqual(fingerprint);
    expect(profile.beta).toBe(33);
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
