import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionRecap } from '../../../src/web/components/SessionRecap';

describe('SessionRecap', () => {
  const recap = {
    steps: [
      { level: 1 as const, name: 'Frappe', score: 23, outcome: 'doubt' as const, secretLabel: 'Mot de passe' as const, secret: true },
      { level: 2 as const, name: 'Appareil', score: 40, outcome: 'doubt' as const, secretLabel: 'PIN' as const, secret: false },
      { level: 3 as const, name: 'Posture', score: 92, outcome: 'passed' as const, secretLabel: 'PIN' as const, secret: true },
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
    expect(screen.getByLabelText('Frappe : Doute : étape suivante')).toHaveTextContent('23');
    expect(screen.getByLabelText('Posture : Validé')).toHaveTextContent('92');
  });

  it('indique si le secret saisi correspond à celui attendu', () => {
    render(<SessionRecap recap={recap} />);
    expect(screen.getByLabelText('Mot de passe : correct')).toHaveTextContent('Mot de passe ✓');
    expect(screen.getByLabelText('PIN : incorrect')).toHaveTextContent('PIN ✕');
    expect(screen.getByLabelText('PIN : correct')).toBeInTheDocument();
  });

  it('étape non nécessaire : pas de score', () => {
    render(
      <SessionRecap
        recap={{
          ...recap,
          granted: false,
          steps: [
            { level: 1, name: 'Frappe', score: 10, outcome: 'failed', secretLabel: 'Mot de passe', secret: false },
            { level: 2, name: 'Appareil', score: null, outcome: 'skipped', secretLabel: 'PIN', secret: null },
            { level: 3, name: 'Posture', score: null, outcome: 'skipped', secretLabel: 'PIN', secret: null },
          ],
        }}
      />,
    );
    expect(screen.getByText('✕ Accès refusé')).toBeInTheDocument();
    expect(screen.getByLabelText('Appareil : Non nécessaire')).toHaveTextContent('—');
  });
});
