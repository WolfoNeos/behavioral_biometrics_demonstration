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

  it('PUT/GET /api/profile', async () => {
    const p = { password: 'pw', pin: '1111', keystroke: null, fingerprint: null, beta: null };
    expect((await app.inject({ method: 'PUT', url: '/api/profile', payload: p })).statusCode).toBe(
      200,
    );
    expect((await app.inject({ url: '/api/profile' })).json()).toEqual(p);
    const bad = await app.inject({ method: 'PUT', url: '/api/profile', payload: { pin: 1 } });
    expect(bad.statusCode).toBe(400);
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

  it('POST /api/session renvoie {id, url} avec /m/<id>', async () => {
    const { id, url } = (await app.inject({ method: 'POST', url: '/api/session' })).json();
    expect(id).toBeTruthy();
    expect(url).toBe(`https://demo.test/m/${id}`);
  });
});
