import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionRecap } from '../../../src/web/components/SessionRecap';

describe('SessionRecap', () => {
  const recap = {
    steps: [
      { level: 1 as const, name: 'Frappe', score: 23, outcome: 'doubt' as const },
      { level: 2 as const, name: 'Appareil', score: 40, outcome: 'doubt' as const },
      { level: 3 as const, name: 'Posture', score: 92, outcome: 'passed' as const },
    ],
    trust: 76,
    granted: true,
    deciding: 3 as const,
    accept: 80,
    warn: 50,
  };

  it('affiche la confiance globale, le verdict et chaque étape', () => {
    render(<SessionRecap recap={recap} />);
    expect(screen.getByRole('meter', { name: 'confiance globale' })).toHaveAttribute('aria-valuenow', '76');
    expect(screen.getByText('✓ Accès accordé')).toBeInTheDocument();
    expect(screen.getByLabelText('Frappe : Doute : vérification suivante')).toHaveTextContent('23');
    expect(screen.getByLabelText('Posture : Validé')).toHaveTextContent('92');
  });

  it('étape non nécessaire : pas de score', () => {
    render(
      <SessionRecap
        recap={{
          ...recap,
          granted: false,
          steps: [{ level: 1, name: 'Frappe', score: 10, outcome: 'failed' }, { level: 2, name: 'Appareil', score: null, outcome: 'skipped' }, { level: 3, name: 'Posture', score: null, outcome: 'skipped' }],
        }}
      />,
    );
    expect(screen.getByText('✕ Accès refusé')).toBeInTheDocument();
    expect(screen.getByLabelText('Appareil : Non nécessaire')).toHaveTextContent('—');
  });
});
