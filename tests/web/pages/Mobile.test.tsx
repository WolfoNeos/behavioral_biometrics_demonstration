import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../../../src/shared/types';
import type { Snapshot } from '../../../src/shared/types';

const send = vi.fn((_msg: Record<string, any>) => true);
let snapshot: Snapshot | null = null;
let connected = true;
let lost = false;
vi.mock('../../../src/web/ws', () => ({
  usePhoneSession: () => ({ snapshot, connected, lost, send }),
}));

const fp = {
  userAgent: 'UA',
  platform: 'P',
  language: 'fr',
  screen: '1x1x24',
  timezone: 'Z',
  canvasHash: 'h',
};
const requestOrientation = vi.fn();
vi.mock('../../../src/web/capture/fingerprint', () => ({
  collectFingerprint: () => Promise.resolve(fp),
}));
vi.mock('../../../src/web/capture/orientation', () => ({
  requestOrientation: () => requestOrientation(),
}));

import { Mobile } from '../../../src/web/pages/Mobile';

const snap = (over: Partial<Snapshot>): Snapshot => ({
  state: { status: 'pending', level: 2 },
  level: 2,
  live: {},
  expected: { keystroke: null, fingerprint: null, beta: null },
  phoneConnected: true,
  sessionUrl: 'http://pc/m/abc',
  lastVerdict: null,
  liveOrientation: null,
  thresholds: DEFAULT_THRESHOLDS,
  expectedBars: null,
  ...over,
});

const verdict = { level: 3 as const, score: 90, color: 'green' as const, granted: true };
const level3 = () => snap({ level: 3, state: { status: 'pending', level: 3 } });

function ui() {
  return (
    <MemoryRouter initialEntries={['/m/abc']}>
      <Routes>
        <Route path="/m/:id" element={<Mobile />} />
      </Routes>
    </MemoryRouter>
  );
}

/** Messages envoyés au serveur, hors reflet d'écran (phoneView) qui accompagne chaque changement. */
const sent = () => send.mock.calls.map((c) => c[0]).filter((m) => m.type !== 'phoneView');
const views = () => send.mock.calls.map((c) => c[0]).filter((m) => m.type === 'phoneView');

const fire = (beta: number | null) => {
  const ev = new Event('deviceorientation') as Event & Record<string, unknown>;
  Object.assign(ev, { alpha: null, beta, gamma: 3 });
  act(() => {
    window.dispatchEvent(ev);
  });
};

async function typePin(user: ReturnType<typeof userEvent.setup>, digits = '1234') {
  for (const d of digits) await user.click(screen.getByRole('button', { name: d }));
}

beforeEach(() => {
  // iOS : une autorisation est à demander, depuis un geste
  vi.stubGlobal('DeviceOrientationEvent', class { static requestPermission = () => undefined; });
  send.mockReset();
  send.mockImplementation(() => true);
  lost = false;
  requestOrientation.mockReset();
  requestOrientation.mockResolvedValue('granted');
  snapshot = snap({});
  connected = true;
});

describe('Mobile', () => {
  it('niveau 2 : envoie le PIN avec empreinte et frappes', async () => {
    const user = userEvent.setup();
    render(ui());
    await typePin(user);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(sent()).toHaveLength(1));
    const msg = sent()[0];
    expect(msg.type).toBe('pin');
    expect(msg.pin).toBe('1234');
    expect(msg.fingerprint).toEqual(fp);
    expect(msg.taps).toHaveLength(4);
  });

  it('le pavé PIN est le seul écran, à tous les niveaux en attente', () => {
    for (const lvl of [1, 2, 3] as const) {
      snapshot = snap({ level: lvl, state: { status: 'pending', level: lvl } });
      const { unmount } = render(ui());
      expect(screen.getByRole('heading', { name: /PIN/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Confirm' })).toBeTruthy();
      unmount();
    }
  });

  it('niveau 3 : même écran, mesures silencieuses envoyées à la validation', async () => {
    snapshot = level3();
    const user = userEvent.setup();
    render(ui());
    // le premier appui arme le capteur sans rien afficher
    await user.click(screen.getByRole('button', { name: '1' }));
    await waitFor(() => expect(requestOrientation).toHaveBeenCalledTimes(1));
    fire(41);
    fire(42);
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        type: 'orientation',
        pin: '12',
        readings: [
          { alpha: 0, beta: 41, gamma: 3 },
          { alpha: 0, beta: 42, gamma: 3 },
        ],
      }),
    );
  });

  it("n'affiche jamais l'inclinaison ni de texte lié au capteur", async () => {
    snapshot = level3();
    const user = userEvent.setup();
    const { container } = render(ui());
    await user.click(screen.getByRole('button', { name: '1' }));
    await waitFor(() => expect(requestOrientation).toHaveBeenCalled());
    fire(42);
    expect(container.textContent).not.toMatch(/\d+\s*°/);
    expect(container.textContent).not.toMatch(/posture|capteur|angle|orientation|inclinaison/i);
  });

  it('diffuse l’orientation en direct au PC (limitée), au niveau 3 seulement', async () => {
    snapshot = level3();
    const user = userEvent.setup();
    render(ui());
    await user.click(screen.getByRole('button', { name: '1' }));
    await waitFor(() => expect(requestOrientation).toHaveBeenCalled());
    fire(30);
    fire(31); // trop rapproché : non envoyé
    fire(null); // beta invalide : ignoré
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toEqual({ type: 'orientationLive', alpha: 0, beta: 30, gamma: 3 });
  });

  it('capteur muet : message neutre, rien n’est envoyé', async () => {
    requestOrientation.mockResolvedValue('denied');
    snapshot = level3();
    const user = userEvent.setup();
    render(ui());
    await typePin(user, '12');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Try again')).toBeTruthy();
    expect(sent()).toHaveLength(0);
  });

  it('accès accordé ou bloqué : aucun verdict ni score sur le téléphone', () => {
    snapshot = snap({ state: { status: 'granted', level: 3, verdict } });
    const { container, unmount } = render(ui());
    expect(container.textContent).toContain('Look at the screen');
    expect(container.textContent).not.toMatch(/granted|denied|score|successful|suspended/i);
    unmount();
    snapshot = snap({ state: { status: 'blocked', verdict: { ...verdict, granted: false, color: 'red' } } });
    const second = render(ui());
    expect(second.container.textContent).toContain('Look at the screen');
    expect(second.container.textContent).not.toMatch(/granted|denied|score|successful|suspended/i);
    expect(screen.queryByText(/accord|refus|score|✓|✗/i)).toBeNull();
  });

  it('échec du niveau précédent : aucune information sur le téléphone', () => {
    snapshot = snap({
      level: 3,
      state: { status: 'pending', level: 3 },
      lastVerdict: { level: 2, score: 0, granted: false, reason: 'PIN incorrect' },
    });
    const { container } = render(ui());
    expect(container.textContent).not.toMatch(/denied|incorrect|fail|screen/i);
  });

  it('Confirm désactivé hors connexion', () => {
    connected = false;
    render(ui());
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });

  it('envoi échoué : chiffres conservés et message, puis renvoi possible', async () => {
    send.mockImplementation(() => false);
    const user = userEvent.setup();
    render(ui());
    await typePin(user);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Try again')).toBeTruthy();
    expect(screen.getByLabelText('4 digits entered')).toBeTruthy();
    send.mockImplementation(() => true);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Verifying…')).toBeTruthy();
    expect(sent()[1]).toMatchObject({ type: 'pin', pin: '1234' });
    expect(screen.queryByText('Try again')).toBeNull();
  });

  it('session inconnue (1008) : demande de rescanner', () => {
    lost = true;
    render(ui());
    expect(screen.getByText(/scan the QR code again/)).toBeTruthy();
  });
});

describe('Mobile : capteur sans autorisation à demander', () => {
  it('diffuse l’orientation dès l’ouverture, sans toucher l’écran', async () => {
    class Stub {}
    vi.stubGlobal('DeviceOrientationEvent', Stub);
    try {
      snapshot = level3();
      render(ui());
      await waitFor(() => expect(requestOrientation).not.toHaveBeenCalled());
      fire(33);
      expect(send).toHaveBeenCalledWith({ type: 'orientationLive', alpha: 0, beta: 33, gamma: 3 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Mobile : retour d’information entre les étapes', () => {
  it('après l’envoi du PIN : « vérification en cours », puis étape suivante neutre, puis saisie', async () => {
    const user = userEvent.setup();
    const r = render(ui());
    await typePin(user);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Verifying…')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();

    // le serveur passe au niveau suivant : message neutre, sans résultat ni raison
    snapshot = level3();
    act(() => r.rerender(ui()));
    expect(await screen.findByRole('heading', { name: 'Additional verification' })).toBeTruthy();
    expect(r.container.textContent).not.toMatch(/denied|incorrect|fail|score|posture|sensor|angle|tilt/i);

    // puis nouvelle saisie
    expect(await screen.findByRole('button', { name: 'Confirm' }, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Enter your PIN again' })).toBeTruthy();
  });

  it('sans réponse du serveur : retour à la saisie', async () => {
    const user = userEvent.setup();
    render(ui());
    await typePin(user, '12');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Verifying…')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Confirm' }, { timeout: 7000 })).toBeTruthy();
  }, 10000);
});

describe('Mobile : reflet de l’écran pour le PC', () => {
  it('annonce le pavé, le nombre de chiffres et la touche pressée, jamais les chiffres', async () => {
    const user = userEvent.setup();
    render(ui());
    await waitFor(() => expect(views().length).toBeGreaterThan(0));
    expect(views()[0]).toMatchObject({ type: 'phoneView', screen: 'pin', digits: 0, pressed: null, again: false });
    await user.click(screen.getByRole('button', { name: '7' }));
    await user.click(screen.getByRole('button', { name: '3' }));
    await waitFor(() => expect(views().some((v) => v.digits === 2)).toBe(true));
    expect(views().some((v) => v.pressed === '7')).toBe(true);
    // aucun message ne contient le PIN
    expect(JSON.stringify(views())).not.toContain('73');
  });

  it('annonce « vérification en cours » après l’envoi et « done » à la fin', async () => {
    const user = userEvent.setup();
    const r = render(ui());
    await typePin(user, '12');
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(views().some((v) => v.screen === 'checking')).toBe(true));
    snapshot = snap({ state: { status: 'granted', level: 2, verdict } });
    act(() => r.rerender(ui()));
    await waitFor(() => expect(views().at(-1)).toMatchObject({ screen: 'done', digits: 0 }));
  });

  it('au niveau 3 : demande reformulée annoncée (again)', async () => {
    snapshot = level3();
    render(ui());
    await waitFor(() => expect(views().at(-1)).toMatchObject({ screen: 'pin', again: true }));
  });
});
