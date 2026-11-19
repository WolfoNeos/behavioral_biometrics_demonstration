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
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const msg = send.mock.calls[0][0];
    expect(msg.type).toBe('pin');
    expect(msg.pin).toBe('1234');
    expect(msg.fingerprint).toEqual(fp);
    expect(msg.taps).toHaveLength(4);
  });

  it('le pavé PIN est le seul écran, à tous les niveaux en attente', () => {
    for (const lvl of [1, 2, 3] as const) {
      snapshot = snap({ level: lvl, state: { status: 'pending', level: lvl } });
      const { unmount } = render(ui());
      expect(screen.getByRole('heading', { name: 'Code PIN' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Valider' })).toBeTruthy();
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
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({
        type: 'orientation',
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
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: 'orientationLive', alpha: 0, beta: 30, gamma: 3 });
  });

  it('capteur muet : message neutre, rien n’est envoyé', async () => {
    requestOrientation.mockResolvedValue('denied');
    snapshot = level3();
    const user = userEvent.setup();
    render(ui());
    await typePin(user, '12');
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText('Réessayez')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('accès accordé ou bloqué : aucun verdict ni score sur le téléphone', () => {
    snapshot = snap({ state: { status: 'granted', level: 3, verdict } });
    const { container, unmount } = render(ui());
    expect(container.textContent).toBe('Regardez l’écran');
    unmount();
    snapshot = snap({ state: { status: 'blocked', verdict: { ...verdict, granted: false, color: 'red' } } });
    const second = render(ui());
    expect(second.container.textContent).toBe('Regardez l’écran');
    expect(screen.queryByText(/accord|refus|score|✓|✗/i)).toBeNull();
  });

  it('échec du niveau précédent : aucune information sur le téléphone', () => {
    snapshot = snap({
      level: 3,
      state: { status: 'pending', level: 3 },
      lastVerdict: { level: 2, score: 0, granted: false, reason: 'PIN incorrect' },
    });
    const { container } = render(ui());
    expect(container.textContent).not.toMatch(/refus|incorrect|échec|écran/i);
  });

  it('Valider désactivé hors connexion', () => {
    connected = false;
    render(ui());
    expect(screen.getByRole('button', { name: 'Valider' })).toBeDisabled();
  });

  it('envoi échoué : chiffres conservés et message, puis renvoi possible', async () => {
    send.mockImplementation(() => false);
    const user = userEvent.setup();
    render(ui());
    await typePin(user);
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText('Réessayez')).toBeTruthy();
    expect(screen.getByLabelText('4 chiffres saisis')).toBeTruthy();
    send.mockImplementation(() => true);
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(screen.getByLabelText('0 chiffres saisis')).toBeTruthy());
    expect(send.mock.calls[1][0]).toMatchObject({ type: 'pin', pin: '1234' });
    expect(screen.queryByText('Réessayez')).toBeNull();
  });

  it('session inconnue (1008) : demande de rescanner', () => {
    lost = true;
    render(ui());
    expect(screen.getByText(/Rescannez le QR code/)).toBeTruthy();
  });
});
