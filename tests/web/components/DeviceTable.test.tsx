import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeviceTable } from '../../../src/web/components/DeviceTable';

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
