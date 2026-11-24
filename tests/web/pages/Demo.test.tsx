import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.getByLabelText('User ID')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('niveau 1 : le bouton Sign in envoie la frappe comme Entrée', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(screen.getByLabelText('Password'), 'ab');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ type: 'keystroke', password: 'ab' });
    expect(await screen.findByText(/Verifying/)).toBeInTheDocument();
  });

  it('niveau 1 : envoie la frappe à Entrée', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(screen.getByLabelText('Password'), 'ab{Enter}');
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
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByText('Additional verification')).toBeInTheDocument();
    expect(screen.getByText(/enter your PIN/)).toBeInTheDocument();
  });

  it('niveau 3 : demande neutre, sans parler de posture', async () => {
    snapshot = { ...base, level: 3, state: { status: 'pending', level: 3 } };
    renderDemo();
    const main = screen.getByTestId('main-zone');
    expect(await within(main).findByText('One last verification')).toBeInTheDocument();
    expect(main.textContent).not.toMatch(/posture|angle|tilt|gyroscope|score|level/i);
  });

  it('côté portail : aucune raison de refus après un échec', () => {
    snapshot = {
      ...base,
      level: 3,
      state: { status: 'pending', level: 3 },
      lastVerdict: { level: 2, score: 0, granted: false, reason: 'PIN incorrect' },
    };
    renderDemo();
    const main = screen.getByTestId('main-zone');
    expect(main.textContent).not.toMatch(/incorrect|fail|denied|reject|score|out of range/i);
  });

  it('le panneau Direct ne montre que le signal du niveau courant', () => {
    const { unmount } = renderDemo();
    expect(within(screen.getByTestId('panel-direct')).getAllByTestId('chart')[0]).toBeInTheDocument();
    unmount();

    snapshot = { ...base, level: 2, state: { status: 'pending', level: 2 } };
    renderDemo();
    const direct = screen.getByTestId('panel-direct');
    expect(within(direct).queryByTestId('chart')).toBeNull();
    expect(within(direct).getByTestId('device-summary')).toBeInTheDocument();
    expect(within(screen.getByTestId('panel-score')).queryByTestId('chart')).toBeNull();
  });

  it('B hors champ envoie god B, A envoie god A', () => {
    renderDemo();
    fireEvent.keyDown(document.body, { key: 'B' });
    expect(send).toHaveBeenCalledWith({ type: 'god', who: 'B' });
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(send).toHaveBeenCalledWith({ type: 'god', who: 'A' });
  });

  it('B dans le champ mot de passe n’envoie rien', () => {
    renderDemo();
    fireEvent.keyDown(screen.getByLabelText('Password'), { key: 'B' });
    fireEvent.keyDown(screen.getByLabelText('User ID'), { key: 'b' });
    expect(send).not.toHaveBeenCalled();
  });

  it('accordé : écran de bienvenue, sans score ni bouton', () => {
    snapshot = {
      ...base,
      state: {
        status: 'granted',
        level: 1,
        verdict: { level: 1, score: 92, color: 'green', granted: true },
      },
    };
    renderDemo();
    const main = screen.getByTestId('main-zone');
    expect(within(main).getByText('Sign-in successful')).toBeInTheDocument();
    expect(main.textContent).not.toMatch(/score|level/i);
    expect(within(main).queryByRole('button')).toBeNull();
  });

  it('bloqué : accès suspendu, sans raison', () => {
    snapshot = {
      ...base,
      level: 2,
      state: { status: 'blocked', verdict: { level: 2, score: 10, color: 'red', granted: false } },
    };
    renderDemo();
    const main = screen.getByTestId('main-zone');
    expect(within(main).getByText('Access suspended')).toBeInTheDocument();
    expect(main.textContent).not.toMatch(/score|level|incorrect|out of range/i);
  });

  it('les seuils de la jauge viennent du snapshot (serveur)', () => {
    snapshot = {
      ...base,
      state: { status: 'granted', level: 1, verdict: { level: 1, score: 75, color: 'green', granted: true } },
      live: { keystroke: { score: 75, perKey } },
      thresholds: { ...DEFAULT_THRESHOLDS, keystroke: { accept: 70, warn: 40 } },
    };
    renderDemo();
    const gauge = within(screen.getByTestId('panel-score')).getByRole('meter');
    expect(gauge).toHaveAttribute('data-color', 'green');
    expect(screen.getByLabelText('acceptance threshold 70')).toBeInTheDocument();
  });

  it('echec du niveau 1 : le panneau garde la frappe de B avec le bandeau, la zone principale passe au QR', async () => {
    snapshot = {
      ...base,
      level: 2,
      state: { status: 'pending', level: 2 },
      live: { keystroke: { score: 23, perKey } },
      lastVerdict: { level: 1, score: 23, granted: false, reason: 'signal out of range' },
    };
    renderDemo();
    const direct = screen.getByTestId('panel-direct');
    expect(within(direct).getByText(/Live — Keystroke dynamics/)).toBeInTheDocument();
    expect(within(direct).getAllByTestId('chart')[0]).toBeInTheDocument();
    const banner = within(direct).getByTestId('fail-banner');
    expect(banner).toHaveTextContent('Level 1 failed — moving to the next level');
    expect(banner).toHaveTextContent('Signal out of range (score 23 / 100)');
    const gauge = within(screen.getByTestId('panel-score')).getByRole('meter');
    expect(gauge).toHaveAttribute('data-color', 'red');
    expect(within(gauge).getByText('23')).toBeInTheDocument();
    // le profil de A montre aussi la frappe pour comparer
    expect(within(screen.getByTestId('panel-direct')).getByText(/A’s profile learned from 10/)).toBeInTheDocument();
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
    expect(within(direct).getByText(/Live — Device fingerprint/)).toBeInTheDocument();
    expect(within(direct).getByText('Autre')).toBeInTheDocument();
    expect(within(direct).getByTestId('fail-banner')).toHaveTextContent('Level 2 failed');
    expect(within(direct).getByTestId('fail-banner')).toHaveTextContent('Wrong PIN');
  });

  it('mauvais mot de passe : raison affichee sur le bandeau', () => {
    snapshot = {
      ...base,
      level: 2,
      state: { status: 'pending', level: 2 },
      lastVerdict: { level: 1, score: 0, granted: false, reason: 'password incorrect' },
    };
    renderDemo();
    expect(screen.getByTestId('fail-banner')).toHaveTextContent('Wrong password');
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
    expect(within(screen.getByTestId('main-zone')).getByText(/Waiting for your confirmation/)).toBeInTheDocument();
    expect(screen.getAllByText('Phone waiting')).toHaveLength(1);
    unmount();
    snapshot = { ...base, level: 3, state: { status: 'pending', level: 3 }, phoneConnected: true };
    renderDemo();
    expect(within(screen.getByTestId('main-zone')).getByText(/Device connected/)).toBeInTheDocument();

  });

  it('niveau 1 : indicateur seulement dans la zone de controle', () => {
    renderDemo();
    expect(within(screen.getByTestId('main-zone')).queryByText(/Phone/)).toBeNull();
    expect(screen.getByText('Phone waiting')).toBeInTheDocument();
  });

  it('niveau 3 : l aiguille suit liveOrientation en direct', () => {
    snapshot = {
      ...base,
      level: 3,
      state: { status: 'pending', level: 3 },
      live: { device: { score: 25, lines: deviceLines } },
      lastVerdict: { level: 2, score: 25, granted: false, reason: 'signal out of range' },
      liveOrientation: { alpha: 0, beta: 12.4, gamma: 0 },
    };
    renderDemo();
    const direct = screen.getByTestId('panel-direct');
    // une mesure en direct existe : le panneau passe au niveau 3
    expect(within(direct).getByText(/Live — Phone posture/)).toBeInTheDocument();
    expect(within(direct).getByTestId('needle')).toBeInTheDocument();
    expect(within(direct).getByLabelText('measured angle')).toHaveTextContent('12°');
    // la jauge suit l'angle en direct : 12° est loin de la posture de A -> rouge, pas neutre
    const meter = within(screen.getByTestId('panel-score')).getByRole('meter');
    expect(meter).toHaveAttribute('data-color', 'red');
    expect(screen.getByTestId('gauge-caption')).toHaveTextContent('Live score');
  });

  it('niveau 2 : profil de A en libelles francais dans le tableau comparatif', () => {
    snapshot = { ...base, level: 2, state: { status: 'pending', level: 2 } };
    renderDemo();
    const profil = screen.getByTestId('panel-direct');
    expect(screen.queryByTestId('panel-profil')).toBeNull();
    for (const label of ['Browser', 'System', 'Language', 'Screen', 'Time zone', 'Canvas fingerprint']) {
      expect(within(profil).getByText(label)).toBeInTheDocument();
    }
    expect(within(profil).queryByText('userAgent')).toBeNull();
  });
});

describe('Demo — frappe en direct (niveau 1)', () => {
  const direct = () => screen.getByTestId('panel-direct');
  const gauge = () => within(screen.getByTestId('panel-score')).getByRole('meter');
  const liveBars = () =>
    within(direct()).getByLabelText('live signature').querySelectorAll('rect:not(.barcode-ghost):not(.barcode-pause)');
  const pwd = () => screen.getByLabelText('Password');

  it('avant la frappe : reference de A affichee, jauge neutre', () => {
    renderDemo();
    expect(within(direct()).getByTestId('keystroke-view')).toHaveAttribute('data-mode', 'reference');
    expect(within(direct()).getByLabelText('reference signature').querySelectorAll('rect')).toHaveLength(3);
    expect(liveBars()).toHaveLength(0);
    expect(gauge()).toHaveAttribute('data-color', 'neutral');
    expect(within(screen.getByTestId('panel-direct')).getByLabelText('reference signature').querySelectorAll('rect')).toHaveLength(3);
  });

  it('chaque touche relachee ajoute une barre et fait bouger la jauge avant Entree', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(pwd(), 'a');
    expect(within(direct()).getByTestId('keystroke-view')).toHaveAttribute('data-mode', 'live');
    expect(liveBars()).toHaveLength(1);
    expect(gauge()).not.toHaveAttribute('data-color', 'neutral');
    expect(screen.getByTestId('gauge-caption')).toHaveTextContent('Provisional score');
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
    lastVerdict: { level: 1, score: 23, granted: false, reason: 'signal out of range' },
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
    expect(screen.getByTestId('gauge-caption')).toHaveTextContent('Waiting for the server');
    // un snapshot sans nouveau resultat de frappe (ex. telephone connecte) ne les efface pas
    snapshot = { ...base, phoneConnected: true };
    rerenderWith(r);
    expect(liveBars()).toHaveLength(2);
    // le resultat officiel remplace la vue
    snapshot = serverAnswer;
    rerenderWith(r);
    expect(within(direct()).getByTestId('keystroke-view')).toHaveAttribute('data-mode', 'server');
    expect(gauge()).toHaveAttribute('aria-valuenow', '23');
    expect(screen.getByTestId('gauge-caption')).toHaveTextContent('Official score');
    expect(liveBars()).toHaveLength(1);
  });

  it('apres Entree, une nouvelle touche reprend la main sur la frappe envoyee', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(pwd(), 'ab{Enter}');
    expect(liveBars()).toHaveLength(2);
    await user.type(pwd(), 'a');
    expect(liveBars()).toHaveLength(1);
    expect(screen.getByTestId('gauge-caption')).toHaveTextContent('Provisional score');
  });

  it('apres Entree, Restart ou un saut de niveau efface l attente', async () => {
    const user = userEvent.setup();
    renderDemo();
    await user.type(pwd(), 'ab{Enter}');
    expect(liveBars()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: /reset|restart/i }));
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
    // mot de passe fait de symboles absents de tout le texte affiche dans ce panneau
    const before = (direct().textContent ?? '').toLowerCase();
    const secret = [...'#$&@~^|'].filter((c) => !before.includes(c)).join('');
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
    await userEvent.click(screen.getByRole('button', { name: 'Level 2' }));
    expect(onJump).toHaveBeenCalledWith(2);
    await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(onReset).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /config/i })).toHaveAttribute('href', '/config');
  });
});

describe('Demo : score de posture en direct', () => {
  const at = (beta: number) => {
    snapshot = {
      ...base,
      level: 3,
      state: { status: 'pending', level: 3 },
      expected: { ...base.expected, beta: 42 },
      liveOrientation: { alpha: 0, beta, gamma: 0 },
    };
    return renderDemo();
  };
  const scoreText = () => within(screen.getByTestId('panel-score')).getByRole('meter').textContent;

  it('le score dépend de l’angle : 100 seulement pour le même angle', () => {
    const { unmount } = at(42);
    expect(scoreText()).toContain('100');
    unmount();
    at(45);
    expect(scoreText()).not.toContain('100');
  });
});

describe('Demo : écran de réussite personnalisable', () => {
  it('affiche le contenu configuré (salutation, opérations, message)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            name: 'Professor',
            accountLabel: 'Secret account',
            balance: '1,000,000',
            currency: 'EUR',
            notice: 'A test joke',
            transactions: [{ icon: '🍕', label: 'Success pizza', amount: '− 12.00' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    try {
      snapshot = {
        ...base,
        state: { status: 'granted', level: 1, verdict: { level: 1, score: 92, color: 'green', granted: true } },
      };
      renderDemo();
      const main = screen.getByTestId('main-zone');
      expect(await within(main).findByText(/Hello Professor/)).toBeInTheDocument();
      expect(within(main).getByText('Success pizza')).toBeInTheDocument();
      expect(within(main).getByText('A test joke')).toBeInTheDocument();
      expect(main.textContent).not.toMatch(/score|level/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('Demo : bilan de fin de session', () => {
  it('accordé : overall trust et récapitulatif à droite, rien de tel à gauche', () => {
    snapshot = {
      ...base,
      level: 3,
      state: { status: 'granted', level: 3, verdict: { level: 3, score: 92, color: 'green', granted: true } },
      live: { keystroke: { score: 23, perKey }, device: { score: 40, lines: deviceLines } },
    };
    renderDemo();
    const bilan = screen.getByTestId('panel-score');
    expect(within(bilan).getByText('Session summary')).toBeInTheDocument();
    expect(within(bilan).getByRole('meter', { name: 'overall trust' })).toHaveAttribute('aria-valuenow', '76');
    expect(within(bilan).getByLabelText('Typing: Doubt: next step')).toBeInTheDocument();
    expect(within(bilan).getByLabelText('Posture: Passed')).toBeInTheDocument();
    expect(screen.getByTestId('main-zone').textContent).not.toMatch(/confiance|score|bilan/i);
  });

  it('en cours : pas de bilan', () => {
    renderDemo();
    expect(screen.queryByTestId('session-recap')).toBeNull();
  });
});

describe('Demo : le résultat du niveau 2 reste affiché après la soumission', () => {
  const rerender = (r: ReturnType<typeof render>) =>
    r.rerender(
      <MemoryRouter>
        <Demo />
      </MemoryRouter>,
    );

  it('un échec qui vient de tomber reste à l’écran 8 s, même si le niveau 3 mesure déjà', () => {
    vi.useFakeTimers();
    try {
      snapshot = { ...base, level: 2, state: { status: 'pending', level: 2 } };
      const r = renderDemo();
      // le téléphone soumet le PIN : niveau 3, orientation en direct, échec du niveau 2
      snapshot = {
        ...base,
        level: 3,
        state: { status: 'pending', level: 3 },
        live: { device: { score: 25, lines: deviceLines } },
        lastVerdict: { level: 2, score: 25, granted: false, reason: 'signal out of range' },
        liveOrientation: { alpha: 0, beta: 12, gamma: 0 },
      };
      act(() => rerender(r));
      const direct = () => screen.getByTestId('panel-direct');
      expect(within(direct()).getByText(/Live — Device fingerprint/)).toBeInTheDocument();
      expect(within(direct()).getByTestId('fail-banner')).toBeInTheDocument();
      // le temps de le commenter écoulé, on passe à la posture
      act(() => {
        vi.advanceTimersByTime(8100);
      });
      expect(within(direct()).getByText(/Live — Phone posture/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('le présentateur qui saute de niveau reprend la main tout de suite', () => {
    vi.useFakeTimers();
    try {
      snapshot = { ...base, level: 2, state: { status: 'pending', level: 2 } };
      const r = renderDemo();
      snapshot = {
        ...base,
        level: 3,
        state: { status: 'pending', level: 3 },
        lastVerdict: { level: 2, score: 25, granted: false, reason: 'signal out of range' },
        liveOrientation: { alpha: 0, beta: 12, gamma: 0 },
      };
      act(() => rerender(r));
      snapshot = { ...snapshot, lastVerdict: null }; // jump : lastVerdict effacé
      act(() => rerender(r));
      expect(within(screen.getByTestId('panel-direct')).getByText(/Live — Phone posture/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Demo : essais et appareils par étape', () => {
  const attempts = [
    { n: 1, level: 1 as const, score: 92, secret: true, granted: true },
    { n: 2, level: 2 as const, score: 40, secret: true, granted: false },
  ];

  it('seuls les essais de l’étape affichée sont visibles', () => {
    snapshot = { ...base, attempts, state: { status: 'pending', level: 2 }, level: 2 };
    renderDemo();
    const items = within(screen.getByTestId('attempts')).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('#2');
  });

  it('plusieurs appareils à l’étape 2 : tableau de comparaison entre eux', () => {
    const lines = (cores: string) => [{ field: 'cores', expected: '6', actual: cores, match: cores === '6' }];
    snapshot = {
      ...base,
      state: { status: 'pending', level: 2 },
      level: 2,
      live: { device: { score: 40, lines: lines('8') } },
      deviceRuns: [
        { n: 1, phone: 'p1', score: 100, lines: lines('6'), submitted: true },
        { n: 2, phone: 'p2', score: 40, lines: lines('8'), submitted: true },
      ],
    };
    renderDemo();
    expect(screen.getByTestId('device-runs')).toBeInTheDocument();
  });
});

describe('Demo : Stay on step à l’étape 2', () => {
  const lines = [{ field: 'cores', expected: '6', actual: '8', match: false }];
  const stay2 = () => ({
    ...base,
    state: { status: 'pending' as const, level: 2 as const },
    level: 2 as const,
    stay: true,
    live: { device: { score: 40, lines } },
  });

  it('ni jauge de score ni score dans le tableau', () => {
    snapshot = stay2();
    renderDemo();
    const panel = screen.getByTestId('panel-score');
    expect(panel).toHaveAttribute('aria-label', 'Attempts');
    expect(within(panel).queryByRole('img')).toBeNull();
    expect(screen.queryByTestId('device-total')).toBeNull();
    expect(screen.queryByText('Points')).toBeNull();
  });

  it('sans le mode, le score reste affiché', () => {
    snapshot = { ...stay2(), stay: false };
    renderDemo();
    expect(screen.getByTestId('panel-score')).toHaveAttribute('aria-label', 'Score');
    expect(screen.getByTestId('device-total')).toBeInTheDocument();
  });
});

describe('Demo : Stay on step à l’étape 3', () => {
  it('score de chaque téléphone, pas de jauge unique', () => {
    snapshot = {
      ...base,
      state: { status: 'pending', level: 3 },
      level: 3,
      stay: true,
      postureRuns: [
        { n: 1, phone: 'p1', score: 95, beta: 46, deviation: 1, secret: true },
        { n: 2, phone: 'p2', score: 30, beta: 80, deviation: 35, secret: true },
      ],
    };
    renderDemo();
    expect(screen.getAllByTestId('posture-run')).toHaveLength(2);
    expect(screen.getByTestId('panel-score')).toHaveAttribute('aria-label', 'Attempts');
  });

  it('sans le mode : le cadran seul et la jauge', () => {
    snapshot = { ...base, state: { status: 'pending', level: 3 }, level: 3, stay: false };
    renderDemo();
    expect(screen.queryByTestId('posture-runs')).toBeNull();
    expect(screen.getByTestId('panel-score')).toHaveAttribute('aria-label', 'Score');
  });
});
