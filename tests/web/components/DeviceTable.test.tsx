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
});
