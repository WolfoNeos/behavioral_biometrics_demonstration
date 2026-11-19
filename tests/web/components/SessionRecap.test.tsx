import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SessionRecap } from '../../../src/web/components/SessionRecap';

describe('SessionRecap', () => {
  const recap = {
    steps: [
      { level: 1 as const, name: 'Typing', score: 23, outcome: 'doubt' as const, secretLabel: 'Password' as const, secret: true },
      { level: 2 as const, name: 'Device', score: 40, outcome: 'doubt' as const, secretLabel: 'PIN' as const, secret: false },
      { level: 3 as const, name: 'Posture', score: 92, outcome: 'passed' as const, secretLabel: 'PIN' as const, secret: true },
    ],
    trust: 76,
    granted: true,
    deciding: 3 as const,
    accept: 80,
    warn: 50,
  };

  it('affiche la overall trust, le verdict et chaque étape', () => {
    render(<SessionRecap recap={recap} />);
    expect(screen.getByRole('meter', { name: 'overall trust' })).toHaveAttribute('aria-valuenow', '76');
    expect(screen.getByText('✓ Access granted')).toBeInTheDocument();
    expect(screen.getByLabelText('Typing: Doubt: next step')).toHaveTextContent('23');
    expect(screen.getByLabelText('Posture: Passed')).toHaveTextContent('92');
  });

  it('indique si le secret saisi correspond à celui attendu', () => {
    render(<SessionRecap recap={recap} />);
    expect(screen.getByLabelText('Password: correct')).toHaveTextContent('Password ✓');
    expect(screen.getByLabelText('PIN: incorrect')).toHaveTextContent('PIN ✕');
    expect(screen.getByLabelText('PIN: correct')).toBeInTheDocument();
  });

  it('étape non nécessaire : pas de score', () => {
    render(
      <SessionRecap
        recap={{
          ...recap,
          granted: false,
          steps: [
            { level: 1, name: 'Typing', score: 10, outcome: 'failed', secretLabel: 'Password', secret: false },
            { level: 2, name: 'Device', score: null, outcome: 'skipped', secretLabel: 'PIN', secret: null },
            { level: 3, name: 'Posture', score: null, outcome: 'skipped', secretLabel: 'PIN', secret: null },
          ],
        }}
      />,
    );
    expect(screen.getByText('✕ Access denied')).toBeInTheDocument();
    expect(screen.getByLabelText('Device: Not needed')).toHaveTextContent('—');
  });
});
