import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeviceTable, friendlyUserAgent } from '../../../src/web/components/DeviceTable';

describe('DeviceTable', () => {
  it('une ligne par champ avec coche ou croix', () => {
    render(
      <DeviceTable
        lines={[
          { field: 'platform', expected: 'Win32', actual: 'Win32', match: true },
          { field: 'language', expected: 'fr-FR', actual: 'en-US', match: false },
        ]}
      />,
    );
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(screen.getByLabelText('conforme')).toHaveTextContent('✓');
    expect(screen.getByLabelText('différent')).toHaveTextContent('✗');
    expect(screen.getByText('en-US')).toBeInTheDocument();
    expect(screen.getByText('fr-FR')).toBeInTheDocument();
  });

  it('libelles en francais, jamais les noms de champs bruts', () => {
    const fields = ['userAgent', 'platform', 'language', 'screen', 'timezone', 'canvasHash'];
    render(
      <DeviceTable lines={fields.map((field) => ({ field, expected: 'x', actual: 'x', match: true }))} />,
    );
    for (const label of ['Navigateur', 'Système', 'Langue', 'Écran', 'Fuseau horaire', 'Empreinte canvas']) {
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

  it('colore identique / différent et affiche l impact sur le score', () => {
    render(<DeviceTable lines={lines} />);
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveClass('cmp-same');
    expect(rows[2]).toHaveClass('cmp-diff');
    expect(rows[1]).toHaveTextContent('+25'); // poids 1 sur 4
    expect(rows[2]).toHaveTextContent('−75'); // canvas : poids 3 sur 4
  });

  it('signale le plafonnement quand l identité diffère', () => {
    render(<DeviceTable lines={lines} />);
    expect(screen.getByTestId('device-total')).toHaveTextContent(/Score brut : 25/);
    expect(screen.getByTestId('device-total')).toHaveTextContent(/plafonné à 40/);
  });

  it('sans mesure : montre le profil de A en attente', () => {
    render(
      <DeviceTable
        lines={[]}
        expected={{ userAgent: 'UA-A', platform: 'P', language: 'fr', screen: 's', timezone: 'Z', canvasHash: 'h' }}
      />,
    );
    expect(screen.getByText('UA-A')).toBeInTheDocument();
    expect(screen.queryByTestId('device-total')).toBeNull();
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
