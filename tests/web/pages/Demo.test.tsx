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
  lastVerdict: null,
  liveOrientation: null,
  thresholds: DEFAULT_THRESHOLDS,
  // reference de A pour un mot de passe de 3 positions (aucun caractere)
  expectedBars: [
    { dwell: 90, flight: 0, stdDwell: 10, stdFlight: 5, known: true },
    { dwell: 90, flight: 40, stdDwell: 10, stdFlight: 8, known: true },
    { dwell: 90, flight: 40, stdDwell: 10, stdFlight: 8, known: true },
  ],
};

const perKey = [{ key: 'a', dwell: 220, flight: 300, expectedDwell: 90, expectedFlight: 40, bandDwell: 20, bandFlight: 16 }];
const deviceLines = [
  { field: 'userAgent' as const, expected: 'UA', actual: 'Autre', match: false },
  { field: 'canvasHash' as const, expected: 'h', actual: 'x', match: false },
];

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
    expect(within(direct).getByText('Critère')).toBeInTheDocument();
    expect(within(screen.getByTestId('panel-score')).queryByTestId('chart')).toBeNull();
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

  it('les seuils de la jauge viennent du snapshot (serveur)', () => {
    snapshot = {
      ...base,
      state: { status: 'granted', level: 1, verdict: { level: 1, score: 75, color: 'green', granted: true } },
      live: { keystroke: { score: 75, perKey } },
      thresholds: { ...DEFAULT_THRESHOLDS, keystroke: { accept: 70, warn: 40 } },
    };
    renderDemo();
    const gauge = within(screen.getByTestId('panel-direct')).getByRole('meter');
    expect(gauge).toHaveAttribute('data-color', 'green');
    expect(screen.getByLabelText('seuil acceptation 70')).toBeInTheDocument();
  });

  it('echec du niveau 1 : le panneau garde la frappe de B avec le bandeau, la zone principale passe au QR', async () => {
    snapshot = {
      ...base,
      level: 2,
      state: { status: 'pending', level: 2 },
      live: { keystroke: { score: 23, perKey } },
      lastVerdict: { level: 1, score: 23, granted: false, reason: 'signal hors seuil' },
    };
    renderDemo();
    const direct = screen.getByTestId('panel-direct');
    expect(within(direct).getByText(/Direct — Dynamique de frappe/)).toBeInTheDocument();
    expect(within(direct).getByTestId('chart')).toBeInTheDocument();
    const banner = within(direct).getByTestId('fail-banner');
    expect(banner).toHaveTextContent('Échec niveau 1 — passage au niveau suivant');
    expect(banner).toHaveTextContent('Signal hors seuil (score 23 / 100)');
    const gauge = within(direct).getByRole('meter');
    expect(gauge).toHaveAttribute('data-color', 'red');
    expect(within(gauge).getByText('23')).toBeInTheDocument();
    // le profil de A montre aussi la frappe pour comparer
    expect(within(screen.getByTestId('panel-profil')).getByText(/Profil appris sur 10/)).toBeInTheDocument();
    expect(await screen.findByAltText(/QR code/)).toBeInTheDocument();
  });

  it('echec du niveau 2 (PIN) : tableau appareil conserve et raison affichee', () => {
    snapshot = {
      ...base,
      level: 3,
      state: { status: 'pending', level: 3 },
      live: { device: { score: 25, lines: deviceLines } },
      lastVerdict: { level: 2, score: 0, granted: false, reason: 'PIN incorrect' },
    };
    renderDemo();
    const direct = screen.getByTestId('panel-direct');
    expect(within(direct).getByText(/Direct — Empreinte de l'appareil/)).toBeInTheDocument();
    expect(within(direct).getByText('Autre')).toBeInTheDocument();
    expect(within(direct).getByTestId('fail-banner')).toHaveTextContent('Échec niveau 2');
    expect(within(direct).getByTestId('fail-banner')).toHaveTextContent('PIN incorrect');
  });

  it('mauvais mot de passe : raison affichee sur le bandeau', () => {
    snapshot = {
      ...base,
      level: 2,
      state: { status: 'pending', level: 2 },
      lastVerdict: { level: 1, score: 0, granted: false, reason: 'password incorrect' },
    };
    renderDemo();
    expect(screen.getByTestId('fail-banner')).toHaveTextContent('Mot de passe incorrect');
  });

  it('niveau sans mesure : jauge neutre, pas de 0 rouge', () => {
    snapshot = { ...base, level: 2, state: { status: 'pending', level: 2 } };
    renderDemo();
    const gauge = within(screen.getByTestId('panel-score')).getByRole('meter');
    expect(gauge).toHaveAttribute('data-color', 'neutral');
    expect(within(gauge).getByText('—')).toBeInTheDocument();
    expect(screen.queryByTestId('fail-banner')).toBeNull();
  });

  it('indicateur de telephone : zone principale (niveaux 2-3) et zone de controle', () => {
    snapshot = { ...base, level: 2, state: { status: 'pending', level: 2 } };
    const { unmount } = renderDemo();
    expect(within(screen.getByTestId('main-zone')).getByText('Téléphone en attente')).toBeInTheDocument();
    expect(screen.getAllByText('Téléphone en attente')).toHaveLength(2);
    unmount();
    snapshot = { ...base, level: 3, state: { status: 'pending', level: 3 }, phoneConnected: true };
    renderDemo();
    expect(within(screen.getByTestId('main-zone')).getByText('Téléphone connecté')).toBeInTheDocument();

  });

  it('niveau 1 : indicateur seulement dans la zone de controle', () => {
    renderDemo();
    expect(within(screen.getByTestId('main-zone')).queryByText(/Téléphone/)).toBeNull();
    expect(screen.getByText('Téléphone en attente')).toBeInTheDocument();
  });

  it('niveau 3 : l aiguille suit liveOrientation en direct', () => {
    snapshot = {
      ...base,
      level: 3,
      state: { status: 'pending', level: 3 },
      live: { device: { score: 25, lines: deviceLines } },
      lastVerdict: { level: 2, score: 25, granted: false, reason: 'signal hors seuil' },
      liveOrientation: { alpha: 0, beta: 12.4, gamma: 0 },
    };
    renderDemo();
    const direct = screen.getByTestId('panel-direct');
    // une mesure en direct existe : le panneau passe au niveau 3
    expect(within(direct).getByText(/Direct — Posture du téléphone/)).toBeInTheDocument();
    expect(within(direct).getByTestId('needle')).toBeInTheDocument();
    expect(within(direct).getByLabelText('angle mesuré')).toHaveTextContent('12°');
    expect(within(screen.getByTestId('panel-score')).getByRole('meter')).toHaveAttribute('data-color', 'neutral');
  });

  it('niveau 2 : profil de A en libelles francais dans le tableau comparatif', () => {
    snapshot = { ...base, level: 2, state: { status: 'pending', level: 2 } };
    renderDemo();
    const profil = screen.getByTestId('panel-direct');
    expect(screen.queryByTestId('panel-profil')).toBeNull();
    for (const label of ['Navigateur', 'Système', 'Langue', 'Écran', 'Fuseau horaire', 'Empreinte canvas']) {
      expect(within(profil).getByText(label)).toBeInTheDocument();
    }
    expect(within(profil).queryByText('userAgent')).toBeNull();
  });
});

describe('Demo — frappe en direct (niveau 1)', () => {
  const direct = () => screen.getByTestId('panel-direct');
  const gauge = () => within(direct()).getByRole('meter');
  const liveBars = () =>
    within(direct()).getByLabelText('signature en direct').querySelectorAll('rect:not(.barcode-ghost):not(.barcode-pause)');
  const pwd = () => screen.getByLabelText('Mot de passe');

  it('avant la frappe : reference de A affichee, jauge neutre', () => {
    renderDemo();
    expect(within(direct()).getByTestId('keystroke-view')).toHaveAttribute('data-mode', 'reference');
    expect(within(direct()).getByLabelText('signature de référence').querySelectorAll('rect')).toHaveLength(3);
    expect(liveBars()).toHaveLength(0);
    expect(gauge()).toHaveAttribute('data-color', 'neutral');
    expect(within(screen.getByTestId('panel-profil')).getByLabelText('signature de référence').querySelectorAll('rect')).toHaveLength(3);
  });

  it('chaque touche relachee ajoute une barre et fait bouger la jauge avant Entree', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(pwd(), 'a');
    expect(within(direct()).getByTestId('keystroke-view')).toHaveAttribute('data-mode', 'live');
    expect(liveBars()).toHaveLength(1);
    expect(gauge()).not.toHaveAttribute('data-color', 'neutral');
    expect(screen.getByTestId('gauge-caption')).toHaveTextContent('Score provisoire');
    await user.type(pwd(), 'b');
    expect(liveBars()).toHaveLength(2);
    expect(within(direct()).getByText('2 / 3')).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();
  });

  it('Backspace retire la derniere barre', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(pwd(), 'ab');
    expect(liveBars()).toHaveLength(2);
    await user.type(pwd(), '{Backspace}');
    expect(liveBars()).toHaveLength(1);
  });

  it('couleur des barres selon la zone : touche en trop en rouge', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(pwd(), 'abcd');
    const statuses = [...liveBars()].map((r) => r.getAttribute('data-status'));
    expect(statuses).toHaveLength(4);
    expect(statuses[3]).toBe('bad');
  });

  const rerenderWith = (r: ReturnType<typeof renderDemo>) =>
    r.rerender(
      <MemoryRouter>
        <Demo />
      </MemoryRouter>,
    );
  const serverAnswer: Snapshot = {
    ...base,
    level: 2,
    state: { status: 'pending', level: 2 },
    live: { keystroke: { score: 23, perKey } },
    lastVerdict: { level: 1, score: 23, granted: false, reason: 'signal hors seuil' },
  };

  it('Entree : les barres restent « en attente du serveur » puis le serveur les remplace', async () => {
    const user = userEvent.setup();
    const r = renderDemo();
    await user.type(pwd(), 'ab');
    expect(within(direct()).getByTestId('keystroke-view')).toHaveAttribute('data-mode', 'live');
    await user.type(pwd(), '{Enter}');
    expect(send).toHaveBeenCalledTimes(1);
    // le serveur n'a pas encore repondu : les barres tapees restent
    expect(within(direct()).getByTestId('keystroke-view')).toHaveAttribute('data-mode', 'live');
    expect(liveBars()).toHaveLength(2);
    expect(screen.getByTestId('gauge-caption')).toHaveTextContent('En attente du serveur');
    // un snapshot sans nouveau resultat de frappe (ex. telephone connecte) ne les efface pas
    snapshot = { ...base, phoneConnected: true };
    rerenderWith(r);
    expect(liveBars()).toHaveLength(2);
    // le resultat officiel remplace la vue
    snapshot = serverAnswer;
    rerenderWith(r);
    expect(within(direct()).getByTestId('keystroke-view')).toHaveAttribute('data-mode', 'server');
    expect(within(gauge()).getByText('23')).toBeInTheDocument();
    expect(screen.getByTestId('gauge-caption')).toHaveTextContent('Score officiel');
    expect(liveBars()).toHaveLength(1);
  });

  it('apres Entree, une nouvelle touche reprend la main sur la frappe envoyee', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(pwd(), 'ab{Enter}');
    expect(liveBars()).toHaveLength(2);
    await user.type(pwd(), 'a');
    expect(liveBars()).toHaveLength(1);
    expect(screen.getByTestId('gauge-caption')).toHaveTextContent('Score provisoire');
  });

  it('apres Entree, Recommencer ou un saut de niveau efface l attente', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(pwd(), 'ab{Enter}');
    expect(liveBars()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /réinitialiser|recommencer|reset/i }));
    expect(liveBars()).toHaveLength(0);
    expect(within(direct()).getByTestId('keystroke-view')).toHaveAttribute('data-mode', 'reference');
  });

  it('nouvelle tentative : repart de zero', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(pwd(), 'ab{Enter}');
    await user.type(pwd(), 'a');
    expect(liveBars()).toHaveLength(1);
  });

  it('mode God sans frappe locale : les donnees du serveur sont affichees', () => {
    snapshot = {
      ...base,
      state: { status: 'granted', level: 1, verdict: { level: 1, score: 92, color: 'green', granted: true } },
      live: { keystroke: { score: 92, perKey } },
    };
    renderDemo();
    expect(within(direct()).getByTestId('keystroke-view')).toHaveAttribute('data-mode', 'server');
    expect(within(gauge()).getByText('92')).toBeInTheDocument();
  });

  it('aucun caractere du mot de passe dans le panneau Direct', async () => {
    const user = userEvent.setup();
    snapshot = { ...base, live: { keystroke: { score: 50, perKey } } };
    renderDemo();
    // mot de passe fait de lettres absentes de tout le texte affiche dans ce panneau
    const before = (direct().textContent ?? '').toLowerCase();
    const secret = [...'qzxwkjvy'].filter((c) => !before.includes(c)).join('');
    expect(secret.length).toBeGreaterThanOrEqual(4);
    // controle : le detecteur voit bien un caractere tape s'il etait affiche
    const leaks = (text: string, chars: string) => [...chars].some((c) => text.toLowerCase().includes(c));
    expect(leaks(`${before}${secret[0]}`, secret)).toBe(true);
    await user.type(pwd(), secret);
    expect(liveBars()).toHaveLength(secret.length);
    const text = direct().textContent ?? '';
    expect(leaks(text, secret)).toBe(false);
    // l'axe x et le tableau cache n'affichent que des positions numeriques
    const positions = [...direct().querySelectorAll('td.key')].map((td) => td.textContent);
    expect(positions).toHaveLength(secret.length);
    positions.forEach((p) => expect(p).toMatch(/^\d+$/));
    // et aussi apres Entree (barres gardees en attente)
    await user.type(pwd(), '{Enter}');
    expect(leaks(direct().textContent ?? '', secret)).toBe(false);
  });

  it('sans reference (expectedBars null) : pas de legende de score', async () => {
    const user = userEvent.setup();
    snapshot = { ...base, expectedBars: null };
    renderDemo();
    await user.type(pwd(), 'a');
    expect(liveBars()).toHaveLength(1);
    expect(gauge()).toHaveAttribute('data-color', 'neutral');
    expect(screen.getByTestId('gauge-caption')).toBeEmptyDOMElement();
  });

  it('niveaux 2 et 3 : pas de vue frappe', () => {
    snapshot = { ...base, level: 2, state: { status: 'pending', level: 2 } };
    const { unmount } = renderDemo();
    expect(screen.queryByTestId('keystroke-view')).toBeNull();
    unmount();
    snapshot = { ...base, level: 3, state: { status: 'pending', level: 3 } };
    renderDemo();
    expect(screen.queryByTestId('keystroke-view')).toBeNull();
    expect(screen.getByTestId('gauge-caption')).toHaveTextContent('');
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
