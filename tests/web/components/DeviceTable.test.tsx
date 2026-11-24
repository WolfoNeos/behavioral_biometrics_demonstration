import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeviceTable, friendlyUserAgent } from '../../../src/web/components/DeviceTable';

describe('DeviceTable', () => {
  it('affiche toutes les lignes en tableau, les écarts d’abord', () => {
    render(
      <DeviceTable
        lines={[
          { field: 'platform', expected: 'Win32', actual: 'Win32', match: true },
          { field: 'language', expected: 'fr-FR', actual: 'en-US', match: false },
        ]}
      />,
    );
    // toutes les lignes en tableau (en-tête + 2), les écarts d'abord
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getAllByRole('row')[1]).toHaveClass('cmp-diff');
    expect(screen.getByLabelText('match')).toHaveTextContent('✓');
    expect(screen.getByLabelText('different')).toHaveTextContent('✗');
    expect(screen.getByTestId('device-summary')).toHaveTextContent('1 of 2 criteria identical');
    expect(screen.getByText('en-US')).toBeInTheDocument();
    expect(screen.getByText('fr-FR')).toBeInTheDocument();
  });

  it('libelles en francais, jamais les noms de champs bruts', () => {
    const fields = ['userAgent', 'platform', 'language', 'screen', 'timezone', 'canvasHash'];
    render(
      <DeviceTable lines={fields.map((field) => ({ field, expected: 'x', actual: 'x', match: true }))} />,
    );
    for (const label of ['Browser', 'System', 'Language', 'Screen', 'Time zone', 'Canvas fingerprint']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    for (const raw of fields) expect(screen.queryByText(raw)).toBeNull();
  });
});

describe('DeviceTable : comparaison A / mesuré', () => {
  const lines = [
    { field: 'platform', expected: 'Win32', actual: 'Win32', match: true },
    { field: 'canvasHash', expected: 'h1', actual: 'h2', match: false },
  ];

  it('colore les écarts en rouge (en tête) et les identiques en vert, avec l impact sur le score', () => {
    render(<DeviceTable lines={lines} />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveClass('cmp-diff');
    expect(rows[1]).toHaveTextContent('−75'); // canvas : poids 3 sur 4
    expect(rows[2]).toHaveClass('cmp-same');
    expect(rows[2]).toHaveTextContent('+25');
  });

  it('signale le plafonnement quand l identité diffère', () => {
    render(<DeviceTable lines={lines} />);
    expect(screen.getByTestId('device-total')).toHaveTextContent(/Raw score: 25/);
    expect(screen.getByTestId('device-total')).toHaveTextContent(/capped at 40/);
  });

  it('sans mesure : annonce les critères qui seront comparés', () => {
    render(
      <DeviceTable
        lines={[]}
        expected={{ userAgent: 'UA-A', platform: 'P', language: 'fr', screen: 's', timezone: 'Z', canvasHash: 'h', fonts: '3:abc' }}
      />,
    );
    expect(screen.getByTestId('device-summary')).toHaveTextContent('Waiting for the phone… 7 criteria will be compared');
    expect(screen.getByText('Installed fonts')).toBeInTheDocument();
    expect(screen.queryByTestId('device-total')).toBeNull();
  });

  it('tous les critères identiques : résumé vert et toutes les lignes vertes', () => {
    render(
      <DeviceTable
        lines={[
          { field: 'platform', expected: 'P', actual: 'P', match: true },
          { field: 'languages', expected: 'fr', actual: 'fr', match: true },
        ]}
      />,
    );
    expect(screen.getByTestId('device-summary')).toHaveTextContent('All 2 criteria identical');
    expect(screen.getAllByRole('row').slice(1).every((r) => r.classList.contains('cmp-same'))).toBe(true);
  });

  it('IP et identifiant stocké libellés, toutes les lignes présentes', () => {
    const fields = ['ip', 'installId', 'voices', 'media', 'permissions', 'storage'];
    render(<DeviceTable lines={fields.map((field) => ({ field, expected: 'a', actual: 'b', match: false }))} />);
    expect(screen.getAllByRole('row')).toHaveLength(7);
    for (const label of ['IP address', 'Browser-stored ID', 'Installed voices', 'Media devices', 'Granted permissions', 'Storage quota']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe('DeviceTable : critères ignorés', () => {
  const lines = [
    { field: 'cores', expected: '6', actual: '8', match: false, enabled: false, weight: 1 },
    { field: 'platform', expected: 'P', actual: 'P', match: true, enabled: true, weight: 1 },
    { field: 'languages', expected: 'fr', actual: 'en', match: false, enabled: true, weight: 2 },
  ];

  it('un critère désactivé reste dans le tableau, en dernier, sans points ni effet sur le score', () => {
    render(<DeviceTable lines={lines} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => r.className)).toEqual(['cmp-diff', 'cmp-same', 'cmp-off']);
    expect(rows[2]).toHaveTextContent('Ignored');
    expect(rows[2]).toHaveTextContent('–');
    // score sur les deux critères actifs : 1 sur 3 de poids -> 33,3
    expect(screen.getByTestId('device-total')).toHaveTextContent('33.3');
    expect(screen.getByTestId('device-summary')).toHaveTextContent('1 ignored');
  });

  it('un écart sur un critère d’identité actif plafonne ; désactivé, plus', () => {
    const base = { field: 'installId', expected: 'a', actual: 'b', match: false, weight: 3, identity: true };
    const { rerender } = render(<DeviceTable lines={[{ ...base, enabled: true }, { field: 'platform', expected: 'P', actual: 'P', match: true }]} />);
    expect(screen.getByTestId('device-total')).toHaveTextContent('capped at 40');
    rerender(<DeviceTable lines={[{ ...base, enabled: false }, { field: 'platform', expected: 'P', actual: 'P', match: true }]} />);
    expect(screen.getByTestId('device-total').textContent).not.toMatch(/capped/);
  });
});

describe('friendlyUserAgent', () => {
  it('résume le navigateur et le système', () => {
    expect(
      friendlyUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 27_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/157.0.8103.37 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Chrome 157 · iOS 27.2');
    expect(
      friendlyUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari 18 · iOS 18.0');
  });

  it('valeur brute si non reconnue', () => {
    expect(friendlyUserAgent('UA')).toBe('UA');
  });
});
