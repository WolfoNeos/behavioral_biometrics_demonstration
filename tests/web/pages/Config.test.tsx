import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FINGERPRINT_FIELDS } from '../../../src/shared/fingerprint';
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
let criteriaBody: { criteria: unknown[]; overrides: Record<string, unknown>; last: unknown } = {
  criteria: [],
  overrides: {},
  last: null,
};
let network = {
  baseUrl: 'https://192.168.1.20:5173',
  source: 'auto',
  https: true,
  candidates: [
    { name: 'Wi-Fi', address: '192.168.1.20', url: 'https://192.168.1.20:5173', active: true, covered: true },
    { name: 'Hotspot', address: '192.168.43.10', url: 'https://192.168.43.10:5173', active: false, covered: false },
  ],
  certValidTo: null,
  covered: true,
  certCommand: 'npm run cert -- --force',
};
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
    // comme le serveur : un nouveau mot de passe efface le profil de frappe
    profile = body.password === profile.password ? body : { ...body, keystroke: null };
    return json(profile);
  }
  if (url === '/api/thresholds' && method === 'GET') return json(DEFAULT_THRESHOLDS);
  if (url === '/api/thresholds' && method === 'PUT') {
    return putThresholdsStatus === 200 ? json(body) : json({ error: 'invalid or incomplete thresholds' }, 400);
  }
  if (url === '/api/enroll/keystroke') return json(profile);
  if (url === '/api/session') return json({ id: 'abc', url: 'http://192.168.1.20:5173/m/abc' });
  if (url === '/api/criteria' && method === 'GET') return json(criteriaBody);
  if (url === '/api/criteria' && method === 'PUT') {
    criteriaBody = { ...criteriaBody, overrides: body };
    return json(criteriaBody);
  }
  if (url === '/api/network' && method === 'GET') return json(network);
  if (url === '/api/network' && method === 'PUT') {
    network = { ...network, baseUrl: body.baseUrl, source: 'manual' };
    return json(network);
  }
  if (url === '/api/network/detect') return json({ ...network, source: 'auto' });
  return json({}, 404);
};

beforeEach(() => {
  criteriaBody = { criteria: [], overrides: {}, last: null };
  network = { ...network, baseUrl: 'https://192.168.1.20:5173', source: 'auto', covered: true };
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
  const field = screen.getByLabelText('Password entry') as HTMLInputElement;
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
    expect(await screen.findByText(/Enrollment complete/)).toBeInTheDocument();
  });

  it('refuse une saisie differente du mot de passe', async () => {
    renderPage();
    await screen.findByText('0 / 10');
    const field = await enter('mauvais');
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not match/);
    expect(screen.getByText('0 / 10')).toBeInTheDocument();
    expect(field.value).toBe('');
  });

  it('enregistre les seuils saisis et met a jour le compteur', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    const n = screen.getByLabelText("Number of enrollment samples");
    await user.clear(n);
    await user.type(n, '5');
    const k = screen.getByLabelText('Typing: acceptance threshold');
    await user.clear(k);
    await user.type(k, '70');
    await user.click(screen.getByRole('button', { name: 'Save thresholds' }));
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
    await user.click(screen.getByRole('button', { name: 'Save thresholds' }));
    expect(await screen.findByText(/invalid or incomplete thresholds/)).toBeInTheDocument();
  });

  it('restaure les valeurs par defaut', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    const n = screen.getByLabelText("Number of enrollment samples");
    await user.clear(n);
    await user.type(n, '5');
    await user.click(screen.getByRole('button', { name: 'Default values' }));
    await waitFor(() => expect(thresholdPuts()).toHaveLength(1));
    expect(thresholdPuts()[0].body).toEqual(DEFAULT_THRESHOLDS);
    expect(screen.getByLabelText("Number of enrollment samples")).toHaveValue(10);
  });

  it('le recalibrage rapide demande 3 echantillons', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    await user.click(screen.getByRole('button', { name: 'Quick recalibration' }));
    expect(screen.getByText('0 / 3')).toBeInTheDocument();
    for (let i = 0; i < 3; i++) await enter('secret');
    await waitFor(() => expect(enrollCalls()).toHaveLength(1));
    expect((enrollCalls()[0].body as { samples: unknown[] }).samples).toHaveLength(3);
  });

  it('Restart remet le compteur a zero', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    await enter('secret');
    expect(await screen.findByText('1 / 10')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "Restart enrollment" }));
    expect(screen.getByText('0 / 10')).toBeInTheDocument();
  });

  it('enregistre mot de passe et PIN en conservant le reste du profil', async () => {
    const user = userEvent.setup();
    profile = { ...baseProfile, beta: 30, fingerprint: fp };
    const before = { ...profile };
    renderPage();
    await screen.findByText('0 / 10');
    const pin = screen.getByLabelText('PIN code');
    await waitFor(() => expect(pin).toHaveValue('1234'));
    await user.clear(pin);
    await user.type(pin, '9876');
    await user.click(screen.getByRole('button', { name: "Save identity" }));
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
    expect(screen.queryByText(/Phone enrolled/)).toBeNull();
    profile = { ...baseProfile, fingerprint: fp, beta: 42 };
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(await screen.findByText('Phone enrolled ✓ (tilt 42°)')).toBeInTheDocument();
  });

  it('signale une frappe deja enrolee apres rechargement', async () => {
    profile = { ...baseProfile, keystroke: { mean: {}, std: {}, samples: 7 } };
    renderPage();
    expect(await screen.findByText(/Typing already enrolled \(7 samples\)/)).toBeInTheDocument();
    expect(screen.getByText('0 / 10')).toBeInTheDocument();
  });

  it('changer le mot de passe apres enrolement retire « Frappe deja enrolee »', async () => {
    const user = userEvent.setup();
    profile = { ...baseProfile, keystroke: { mean: {}, std: {}, samples: 7 } };
    renderPage();
    expect(await screen.findByText(/Typing already enrolled/)).toBeInTheDocument();
    const pw = screen.getByLabelText('Password');
    await waitFor(() => expect(pw).toHaveValue('secret'));
    await user.clear(pw);
    await user.type(pw, 'nouveau');
    await user.click(screen.getByRole('button', { name: "Save identity" }));
    expect(await screen.findByText('Identity saved')).toBeInTheDocument();
    expect(screen.queryByText(/already enrolled/)).toBeNull();
    expect(profile.keystroke).toBeNull();
  });

  it('pas de bandeau sans profil de frappe', async () => {

    renderPage();
    await screen.findByText('0 / 10');
    expect(screen.queryByText(/already enrolled/)).toBeNull();
    expect(screen.getByText(/must match the saved password/)).toBeInTheDocument();
  });

  it('un changement de mot de passe remet le compteur a zero', async () => {
    const user = userEvent.setup();
    const small = { ...DEFAULT_THRESHOLDS, enrollSamples: 4 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) =>
        url === '/api/thresholds' && !init?.method ? json(small) : handler(url, init),
      ),
    );
    renderPage();
    await screen.findByText('0 / 4');
    for (let i = 0; i < 3; i++) await enter('secret');
    expect(await screen.findByText('3 / 4')).toBeInTheDocument();
    const pw = screen.getByLabelText('Password');
    await waitFor(() => expect(pw).toHaveValue('secret'));
    await user.clear(pw);
    await user.type(pw, 'nouveau');
    await user.click(screen.getByRole('button', { name: "Save identity" }));
    expect(await screen.findByText('0 / 4')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) await enter('nouveau');
    await waitFor(() => expect(enrollCalls()).toHaveLength(1));
    expect((enrollCalls()[0].body as { samples: unknown[] }).samples).toHaveLength(4);
  });

  it('un POST d enrolement echoue est retente a l Entree suivante', async () => {
    let fail = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) =>
        url === '/api/enroll/keystroke' && fail ? json({ error: 'boom' }, 500) : handler(url, init),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    await user.click(screen.getByRole('button', { name: 'Quick recalibration' }));
    for (let i = 0; i < 3; i++) await enter('secret');
    expect(await screen.findByText(/boom/)).toBeInTheDocument();
    fail = false;
    await enter('secret');
    expect(await screen.findByText(/Enrollment complete/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect((enrollCalls().at(-1)!.body as { samples: unknown[] }).samples).toHaveLength(3);
  });

  it('deux Entrees rapides au but ne font qu un seul POST', async () => {
    let release: () => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/enroll/keystroke') {
          calls.push({ method: 'POST', url });
          await new Promise<void>((r) => {
            release = r;
          });
          return json(profile);
        }
        return handler(url, init);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    await user.click(screen.getByRole('button', { name: 'Quick recalibration' }));
    for (let i = 0; i < 5; i++) await enter('secret');
    expect(enrollCalls()).toHaveLength(1);
    await act(async () => release());
    expect(await screen.findByText(/Enrollment complete/)).toBeInTheDocument();
    expect(enrollCalls()).toHaveLength(1);
  });

  it('un POST qui aboutit apres un changement de mot de passe est ignore', async () => {
    let release: () => void = () => undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/enroll/keystroke') {
          await new Promise<void>((r) => {
            release = r;
          });
          return json(profile);
        }
        return handler(url, init);
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('0 / 10');
    await user.click(screen.getByRole('button', { name: 'Quick recalibration' }));
    for (let i = 0; i < 3; i++) await enter('secret');
    const pw = screen.getByLabelText('Password');
    await waitFor(() => expect(pw).toHaveValue('secret'));
    await user.clear(pw);
    await user.type(pw, 'nouveau');
    await user.click(screen.getByRole('button', { name: "Save identity" }));
    expect(await screen.findByText('0 / 3')).toBeInTheDocument();
    await act(async () => release());
    expect(screen.queryByText(/Enrollment complete/)).toBeNull();
    expect(screen.getByText('0 / 3')).toBeInTheDocument();
  });

  it('a un lien retour vers la demo', async () => {
    renderPage();
    await screen.findByText('0 / 10');
    expect(within(document.body).getByRole('link', { name: /demo/i })).toHaveAttribute('href', '/');
  });
});

describe('Config : réseau (changement de wifi)', () => {
  it('affiche l’adresse des QR et les réseaux détectés', async () => {
    renderPage();
    expect(await screen.findByTestId('net-url')).toHaveTextContent('https://192.168.1.20:5173');
    expect(screen.getByText('Hotspot')).toBeInTheDocument();
    expect(screen.getByText('Certificate to regenerate')).toBeInTheDocument();
  });

  it('« Use » change l’adresse et régénère le QR d’enrôlement', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('net-url');
    await user.click(screen.getByRole('button', { name: 'Use' }));
    await waitFor(() => expect(screen.getByTestId('net-url')).toHaveTextContent('https://192.168.43.10:5173'));
    expect(calls.some((c) => c.method === 'PUT' && c.url === '/api/network' && (c.body as { baseUrl: string }).baseUrl === 'https://192.168.43.10:5173')).toBe(true);
    expect(await screen.findByText(/now point to the new network/)).toBeInTheDocument();
  });

  it('adresse manuelle appliquée', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByTestId('net-url');
    await user.type(screen.getByLabelText('Manual address'), '10.1.2.3');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.url === '/api/network')).toBe(true));
  });

  it('avertit quand le certificat ne couvre pas l’adresse', async () => {
    network = { ...network, covered: false };
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(/HTTPS certificate does not cover/);
    expect(screen.getByText('npm run cert -- --force')).toBeInTheDocument();
  });
});

describe('Config : écran de réussite', () => {
  it('modifie le message et les opérations puis enregistre', async () => {
    const user = userEvent.setup();
    let saved: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === '/api/welcome' && init?.method === 'PUT') {
          saved = JSON.parse(init.body as string);
          return json(saved);
        }
        if (url === '/api/welcome') return json({});
        return handler(url, init);
      }),
    );
    renderPage();
    const notice = await screen.findByLabelText('Advisor message');
    await user.clear(notice);
    await user.type(notice, 'Blague du jour');
    await user.click(screen.getByRole('button', { name: 'Delete transaction 1' }));
    await user.click(screen.getByRole('button', { name: '+ Add a transaction' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Success screen saved')).toBeInTheDocument();
    expect((saved as unknown as { notice: string }).notice).toBe('Blague du jour');
  });
});

describe('Config : profil d’empreinte ancien', () => {
  it('invite à ré-enrôler un téléphone enrôlé avec les six critères d’origine', async () => {
    profile = { ...baseProfile, fingerprint: fp, beta: 30 };
    renderPage();
    expect(await screen.findByTestId('reenroll-note')).toHaveTextContent(new RegExp(`enrolled with 6 of ${FINGERPRINT_FIELDS.length} criteria`));
  });

  it('pas d’invitation quand le profil contient les nouveaux critères', async () => {
    const everything = Object.fromEntries(FINGERPRINT_FIELDS.map((f) => [f, 'x'])) as unknown as typeof fp;
    profile = { ...baseProfile, fingerprint: everything, beta: 30 };
    renderPage();
    await screen.findByText(/Phone enrolled/);
    expect(screen.queryByTestId('reenroll-note')).toBeNull();
  });
});


describe('Config : choix des critères de l’empreinte', () => {
  it('liste tous les critères, avec le dernier test, et enregistre les réglages', async () => {
    criteriaBody = {
      criteria: [],
      overrides: {},
      last: [
        { field: 'cores', expected: '6', actual: '8', match: false },
        { field: 'platform', expected: 'P', actual: 'P', match: true },
      ],
    };
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByRole('region', { name: 'Device criteria' });
    expect(within(card).getByText(/of \d+ enabled/)).toBeInTheDocument();
    expect(within(card).getAllByText('✗ differed').length).toBe(1);
    // désactiver un critère et changer un poids
    await user.click(within(card).getByLabelText('Enable CPU cores'));
    const weight = within(card).getByLabelText('Weight of Memory');
    await user.clear(weight);
    await user.type(weight, '4');
    await user.click(within(card).getByRole('button', { name: 'Save criteria' }));
    expect(await within(card).findByText('Criteria saved')).toBeInTheDocument();
    const put = calls.find((c) => c.method === 'PUT' && c.url === '/api/criteria')!;
    const sent = put.body as Record<string, { enabled: boolean; weight: number }>;
    expect(sent.cores.enabled).toBe(false);
    expect(sent.memory.weight).toBe(4);
  });

  it('« Only those that differed » ne garde que les critères qui ont différé au dernier test', async () => {
    criteriaBody = { criteria: [], overrides: {}, last: [{ field: 'cores', expected: '6', actual: '8', match: false }] };
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByRole('region', { name: 'Device criteria' });
    await user.click(within(card).getByRole('button', { name: 'Only those that differed' }));
    expect(within(card).getByText(/1 of \d+ enabled/)).toBeInTheDocument();
    expect((within(card).getByLabelText('Enable CPU cores') as HTMLInputElement).checked).toBe(true);
    expect((within(card).getByLabelText('Enable Memory') as HTMLInputElement).checked).toBe(false);
  });

  it('filtre par nom', async () => {
    const user = userEvent.setup();
    renderPage();
    const card = await screen.findByRole('region', { name: 'Device criteria' });
    await user.type(within(card).getByLabelText('Filter criteria'), 'webgl');
    expect(within(card).getByLabelText('Enable WebGL rendering')).toBeInTheDocument();
    expect(within(card).queryByLabelText('Enable CPU cores')).toBeNull();
  });
});
