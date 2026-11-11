import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../../../src/shared/types';
import type { KeyEvent, Profile } from '../../../src/shared/types';

const toDataURL = vi.fn();
vi.mock('qrcode', () => ({
  default: { toDataURL: (...a: unknown[]) => toDataURL(...a) },
}));

let onDone: ((events: KeyEvent[]) => void) | null = null;
vi.mock('../../../src/web/capture/keystroke', () => ({
  attachKeystrokeCapture: (_input: HTMLInputElement, cb: (events: KeyEvent[]) => void) => {
    onDone = cb;
    return () => {
      onDone = null;
    };
  },
}));

import { Config } from '../../../src/web/pages/Config';

const fp = { userAgent: 'UA', platform: 'P', language: 'fr', screen: '1x1x24', timezone: 'Z', canvasHash: 'h' };
const baseProfile: Profile = { password: 'secret', pin: '1234', keystroke: null, fingerprint: null, beta: null };
const events: KeyEvent[] = [{ key: 's', down: 0, up: 50 }];

let profile: Profile;
let putThresholdsStatus = 200;
const calls: { method: string; url: string; body?: unknown }[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const handler = async (url: string, init?: RequestInit): Promise<Response> => {
  const method = init?.method ?? 'GET';
  const body = init?.body ? JSON.parse(init.body as string) : undefined;
  calls.push({ method, url, body });
  if (url === '/api/profile' && method === 'GET') return json(profile);
  if (url === '/api/profile' && method === 'PUT') {
    profile = body;
    return json(profile);
  }
  if (url === '/api/thresholds' && method === 'GET') return json(DEFAULT_THRESHOLDS);
  if (url === '/api/thresholds' && method === 'PUT') {
    return putThresholdsStatus === 200 ? json(body) : json({ error: 'seuils invalides ou incomplets' }, 400);
  }
  if (url === '/api/enroll/keystroke') return json(profile);
  if (url === '/api/session') return json({ id: 'abc', url: 'http://192.168.1.20:5173/m/abc' });
  return json({}, 404);
};

beforeEach(() => {
  profile = { ...baseProfile };
  putThresholdsStatus = 200;
  calls.length = 0;
  toDataURL.mockReset();
  toDataURL.mockResolvedValue('data:image/png;base64,QR');
  vi.stubGlobal('fetch', vi.fn(handler));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <Config />
    </MemoryRouter>,
  );

async function enter(text: string) {
  const field = screen.getByLabelText('Saisie du mot de passe') as HTMLInputElement;
  fireEvent.change(field, { target: { value: text } });
  await act(async () => {
    onDone?.(events);
  });
  return field;
}

const enrollCalls = () => calls.filter((c) => c.url === '/api/enroll/keystroke');
const thresholdPuts = () => calls.filter((c) => c.method === 'PUT' && c.url === '/api/thresholds');

describe('Config', () => {
  it('affiche 0 / 10 apres chargement des seuils par defaut', async () => {
    renderPage();
    expect(await screen.findByText('0 / 10')).toBeInTheDocument();
  });

  it('envoie 10 echantillons a la 10e saisie correcte', async () => {
    renderPage();
    await screen.findByText('0 / 10');
    for (let i = 0; i < 9; i++) await enter('secret');
    expect(await screen.findByText('9 / 10')).toBeInTheDocument();
    expect(enrollCalls()).toHaveLength(0);
    const field = await enter('secret');
    await waitFor(() => expect(enrollCalls()).toHaveLength(1));
    expect((enrollCalls()[0].body as { samples: unknown[] }).samples).toHaveLength(10);
    expect(field.value).toBe('');
    expect(await screen.findByText(/Enrôlement terminé/)).toBeInTheDocument();
  });

  it('refuse une saisie differente du mot de passe', async () => {
    renderPage();
    await screen.findByText('0 / 10');
    const field = await enter('mauvais');
    expect(await screen.findByRole('alert')).toHaveTextContent(/ne correspond pas/);
    expect(screen.getByText('0 / 10')).toBeInTheDocument();
    expect(field.value).toBe('');
  });

  it('enregistre les seuils saisis et met a jour le compteur', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    const n = screen.getByLabelText("Nombre d'échantillons d'enrôlement");
    await user.clear(n);
    await user.type(n, '5');
    const k = screen.getByLabelText('Frappe : seuil d’acceptation');
    await user.clear(k);
    await user.type(k, '70');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les seuils' }));
    expect(await screen.findByText('0 / 5')).toBeInTheDocument();
    expect(thresholdPuts()[0].body).toEqual({
      ...DEFAULT_THRESHOLDS,
      keystroke: { accept: 70, warn: 50 },
      enrollSamples: 5,
    });
  });

  it('affiche l erreur 400 du serveur', async () => {
    putThresholdsStatus = 400;
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    await user.click(screen.getByRole('button', { name: 'Enregistrer les seuils' }));
    expect(await screen.findByText(/seuils invalides ou incomplets/)).toBeInTheDocument();
  });

  it('restaure les valeurs par defaut', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    const n = screen.getByLabelText("Nombre d'échantillons d'enrôlement");
    await user.clear(n);
    await user.type(n, '5');
    await user.click(screen.getByRole('button', { name: 'Valeurs par défaut' }));
    await waitFor(() => expect(thresholdPuts()).toHaveLength(1));
    expect(thresholdPuts()[0].body).toEqual(DEFAULT_THRESHOLDS);
    expect(screen.getByLabelText("Nombre d'échantillons d'enrôlement")).toHaveValue(10);
  });

  it('le recalibrage rapide demande 3 echantillons', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    await user.click(screen.getByRole('button', { name: 'Recalibrage rapide' }));
    expect(screen.getByText('0 / 3')).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await enter('secret');
    await waitFor(() => expect(enrollCalls()).toHaveLength(1));
    expect((enrollCalls()[0].body as { samples: unknown[] }).samples).toHaveLength(3);
  });

  it('Recommencer remet le compteur a zero', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    await enter('secret');
    expect(await screen.findByText('1 / 10')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Recommencer l'enrôlement" }));
    expect(screen.getByText('0 / 10')).toBeInTheDocument();
  });

  it('enregistre mot de passe et PIN en conservant le reste du profil', async () => {
    const user = userEvent.setup();
    profile = { ...baseProfile, beta: 30, fingerprint: fp };
    const before = { ...profile };
    renderPage();
    await screen.findByText('0 / 10');
    const pin = screen.getByLabelText('Code PIN');
    await user.clear(pin);
    await user.type(pin, '9876');
    await user.click(screen.getByRole('button', { name: "Enregistrer l'identité" }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.url === '/api/profile')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT' && c.url === '/api/profile')?.body).toEqual({
      ...before,
      pin: '9876',
    });
  });

  it('le QR pointe vers <origine>/m-enroll', async () => {
    renderPage();
    expect(await screen.findByText('http://192.168.1.20:5173/m-enroll')).toBeInTheDocument();
    expect(toDataURL.mock.calls[0][0]).toBe('http://192.168.1.20:5173/m-enroll');
    expect(await screen.findByAltText(/QR/)).toHaveAttribute('src', 'data:image/png;base64,QR');
  });

  it('retombe sur location.origin si /api/session echoue', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/session') throw new Error('down');
        return handler(url, init);
      }),
    );
    renderPage();
    expect(await screen.findByText(`${location.origin}/m-enroll`)).toBeInTheDocument();
  });

  it('indique le telephone enregistre apres le polling du profil', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    renderPage();
    await screen.findByText('0 / 10');
    expect(screen.queryByText(/Téléphone enregistré/)).toBeNull();
    profile = { ...baseProfile, fingerprint: fp, beta: 42 };
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(await screen.findByText('Téléphone enregistré ✓ (inclinaison 42°)')).toBeInTheDocument();
  });

  it('a un lien retour vers la demo', async () => {
    renderPage();
    await screen.findByText('0 / 10');
    expect(within(document.body).getByRole('link', { name: /démo/i })).toHaveAttribute('href', '/');
  });
});
