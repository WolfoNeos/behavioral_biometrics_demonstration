import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../../../src/shared/types';
import type { Snapshot } from '../../../src/shared/types';

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="chart" />,
}));
vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QR') },
}));

const send = vi.fn();
let snapshot: Snapshot | null = null;
vi.mock('../../../src/web/ws', () => ({
  useSession: () => ({ snapshot, send }),
}));

import { Demo } from '../../../src/web/pages/Demo';
import { ControlBar } from '../../../src/web/components/ControlBar';

const base: Snapshot = {
  state: { status: 'pending', level: 1 },
  level: 1,
  live: {},
  expected: {
    keystroke: {
      mean: { a: { dwell: 90, flight: 40 } },
      std: { a: { dwell: 10, flight: 8 } },
      samples: 10,
    },
    fingerprint: {
      userAgent: 'UA',
      platform: 'P',
      language: 'fr',
      screen: '1x1',
      timezone: 'Z',
      canvasHash: 'h',
    },
    beta: 45,
  },
  phoneConnected: false,
  sessionUrl: 'http://pc:5173/m/abc',
};

function renderDemo() {
  return render(
    <MemoryRouter>
      <Demo />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  send.mockClear();
  snapshot = base;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => DEFAULT_THRESHOLDS }),
  );
});

describe('Demo', () => {
  it('niveau 1 : affiche les champs de connexion', () => {
    renderDemo();
    expect(screen.getByLabelText('Identifiant')).toBeInTheDocument();
    expect(screen.getByLabelText('Mot de passe')).toBeInTheDocument();
  });

  it('niveau 1 : envoie la frappe à Entrée', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(screen.getByLabelText('Mot de passe'), 'ab{Enter}');
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][0];
    expect(msg.type).toBe('keystroke');
    expect(msg.password).toBe('ab');
    expect(msg.events.map((e: { key: string }) => e.key)).toEqual(['a', 'b']);
  });

  it('niveau 2 : QR code et plus de champ mot de passe', async () => {
    snapshot = { ...base, level: 2, state: { status: 'pending', level: 2 } };
    renderDemo();
    const img = await screen.findByAltText(/QR code/);
    expect(img).toHaveAttribute('src', 'data:image/png;base64,QR');
    expect(screen.queryByLabelText('Mot de passe')).toBeNull();
    expect(screen.getByText(/saisissez le code PIN/)).toBeInTheDocument();
  });

  it('niveau 3 : consigne de posture', async () => {
    snapshot = { ...base, level: 3, state: { status: 'pending', level: 3 } };
    renderDemo();
    expect(await screen.findByText(/validez la posture/)).toBeInTheDocument();
  });

  it('le panneau Direct ne montre que le signal du niveau courant', () => {
    const { unmount } = renderDemo();
    expect(within(screen.getByTestId('panel-direct')).getByTestId('chart')).toBeInTheDocument();
    unmount();

    snapshot = { ...base, level: 2, state: { status: 'pending', level: 2 } };
    renderDemo();
    const direct = screen.getByTestId('panel-direct');
    expect(within(direct).queryByTestId('chart')).toBeNull();
    expect(within(direct).getByText('Caractéristique')).toBeInTheDocument();
    expect(within(screen.getByTestId('panel-profil')).queryByTestId('chart')).toBeNull();
  });

  it('B hors champ envoie god B', () => {
    renderDemo();
    fireEvent.keyDown(document.body, { key: 'B' });
    expect(send).toHaveBeenCalledWith({ type: 'god', who: 'B' });
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(send).toHaveBeenCalledWith({ type: 'god', who: 'A' });
  });

  it('B dans le champ mot de passe n’envoie rien', () => {
    renderDemo();
    fireEvent.keyDown(screen.getByLabelText('Mot de passe'), { key: 'B' });
    fireEvent.keyDown(screen.getByLabelText('Identifiant'), { key: 'b' });
    expect(send).not.toHaveBeenCalled();
  });

  it('accordé : verdict et bouton Recommencer', async () => {
    snapshot = {
      ...base,
      state: {
        status: 'granted',
        level: 1,
        verdict: { level: 1, score: 92, color: 'green', granted: true },
      },
    };
    renderDemo();
    expect(screen.getByRole('status', { name: 'verdict' })).toBeInTheDocument();
    const main = screen.getByTestId('main-zone');
    await userEvent.click(within(main).getByRole('button', { name: 'Recommencer' }));
    expect(send).toHaveBeenCalledWith({ type: 'reset' });
  });

  it('bloqué : verdict d’échec', () => {
    snapshot = {
      ...base,
      level: 2,
      state: { status: 'blocked', verdict: { level: 2, score: 10, color: 'red', granted: false } },
    };
    renderDemo();
    expect(screen.getByText('Échec')).toBeInTheDocument();
  });

  it('charge les seuils', async () => {
    renderDemo();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/thresholds'));
  });
});

describe('ControlBar', () => {
  it('les boutons envoient jump et reset', async () => {
    const onJump = vi.fn();
    const onReset = vi.fn();
    render(
      <MemoryRouter>
        <ControlBar onJump={onJump} onReset={onReset} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Niveau 2' }));
    expect(onJump).toHaveBeenCalledWith(2);
    await userEvent.click(screen.getByRole('button', { name: 'Recommencer' }));
    expect(onReset).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /config/i })).toHaveAttribute('href', '/config');
  });
});
