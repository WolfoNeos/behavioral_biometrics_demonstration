import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../../../src/shared/types';

const send = vi.fn();
let snapshot: Snapshot | null = null;
let connected = true;
vi.mock('../../../src/web/ws', () => ({
  usePhoneSession: () => ({ snapshot, connected, send }),
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
const collectOrientation = vi.fn();
vi.mock('../../../src/web/capture/fingerprint', () => ({
  collectFingerprint: () => Promise.resolve(fp),
}));
vi.mock('../../../src/web/capture/orientation', () => ({
  requestOrientation: () => requestOrientation(),
  collectOrientation: (ms: number) => collectOrientation(ms),
}));

import { Mobile } from '../../../src/web/pages/Mobile';

const snap = (over: Partial<Snapshot>): Snapshot => ({
  state: { status: 'pending', level: 2 },
  level: 2,
  live: {},
  expected: { keystroke: null, fingerprint: null, beta: null },
  phoneConnected: true,
  sessionUrl: 'http://pc/m/abc',
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

beforeEach(() => {
  send.mockClear();
  requestOrientation.mockReset();
  collectOrientation.mockReset();
  snapshot = snap({});
  connected = true;
});

describe('Mobile', () => {
  it('envoie le PIN avec empreinte et frappes', async () => {
    const user = userEvent.setup();
    render(ui());
    for (const d of ['1', '2', '3', '4']) await user.click(screen.getByRole('button', { name: d }));
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const msg = send.mock.calls[0][0];
    expect(msg.type).toBe('pin');
    expect(msg.pin).toBe('1234');
    expect(msg.fingerprint).toEqual(fp);
    expect(msg.taps).toHaveLength(4);
    for (const t of msg.taps) {
      expect(typeof t.down).toBe('number');
      expect(typeof t.up).toBe('number');
    }
  });

  it('niveau 1 : invite a saisir le mot de passe sur l ordinateur', () => {
    snapshot = snap({ level: 1, state: { status: 'pending', level: 1 } });
    render(ui());
    expect(screen.getByText(/Saisissez le mot de passe sur l.ordinateur/)).toBeTruthy();
  });

  it('niveau 3 : autorisation puis bouton Valider', async () => {
    requestOrientation.mockResolvedValue('granted');
    snapshot = level3();
    const user = userEvent.setup();
    render(ui());
    await user.click(screen.getByRole('button', { name: 'Autoriser le capteur' }));
    expect(await screen.findByRole('button', { name: 'Valider' })).toBeTruthy();
  });

  it.each(['denied', 'unavailable'] as const)('permission %s : message clair et Reessayer', async (r) => {
    requestOrientation.mockResolvedValue(r);
    snapshot = level3();
    const user = userEvent.setup();
    render(ui());
    await user.click(screen.getByRole('button', { name: 'Autoriser le capteur' }));
    expect(await screen.findByText(/Capteur d.orientation indisponible/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });

  it('reprise au niveau 3 apres reconnexion : affiche directement la posture', () => {
    snapshot = snap({});
    const { rerender } = render(ui());
    expect(screen.getByRole('button', { name: '1' })).toBeTruthy();
    snapshot = level3();
    act(() => rerender(ui()));
    expect(screen.getByRole('button', { name: 'Autoriser le capteur' })).toBeTruthy();
  });

  it('mesures vides : rien n est envoye', async () => {
    requestOrientation.mockResolvedValue('granted');
    collectOrientation.mockResolvedValue([]);
    snapshot = level3();
    const user = userEvent.setup();
    render(ui());
    await user.click(screen.getByRole('button', { name: 'Autoriser le capteur' }));
    await user.click(await screen.findByRole('button', { name: 'Valider' }));
    expect(await screen.findByText('Aucune mesure reçue, réessayez')).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
  });

  it('envoie les mesures d orientation', async () => {
    requestOrientation.mockResolvedValue('granted');
    const readings = [{ alpha: 0, beta: 45, gamma: 1 }];
    collectOrientation.mockResolvedValue(readings);
    snapshot = level3();
    const user = userEvent.setup();
    render(ui());
    await user.click(screen.getByRole('button', { name: 'Autoriser le capteur' }));
    await user.click(await screen.findByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'orientation', readings }));
    expect(collectOrientation).toHaveBeenCalledWith(2000);
  });

  it('verdicts accorde et bloque', () => {
    snapshot = snap({ state: { status: 'granted', level: 3, verdict } });
    const { unmount } = render(ui());
    expect(screen.getByText('✓')).toBeTruthy();
    expect(screen.getByText(/Accès accordé/)).toBeTruthy();
    unmount();
    snapshot = snap({ state: { status: 'blocked', verdict: { ...verdict, granted: false, color: 'red' } } });
    render(ui());
    expect(screen.getByText('✗')).toBeTruthy();
    expect(screen.getByText(/Accès refusé/)).toBeTruthy();
  });

  it('indique l etat de connexion', () => {
    connected = false;
    render(ui());
    expect(screen.getByText('Reconnexion…')).toBeTruthy();
  });
});
