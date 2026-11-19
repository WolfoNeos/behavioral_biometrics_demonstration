import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConsoleHeader, stepStates } from '../../../src/web/components/ConsoleHeader';

const verdict = { level: 3 as const, score: 90, color: 'green' as const, granted: true };

describe('stepStates', () => {
  it('niveau en cours actif, précédents en doute, suivants à venir', () => {
    expect(stepStates({ status: 'pending', level: 2 })).toEqual(['escalated', 'active', 'todo']);
    expect(stepStates({ status: 'pending', level: 1 })).toEqual(['active', 'todo', 'todo']);
  });

  it('accès accordé : le niveau atteint est validé', () => {
    expect(stepStates({ status: 'granted', level: 1, verdict: { ...verdict, level: 1 } })).toEqual(['passed', 'todo', 'todo']);
    expect(stepStates({ status: 'granted', level: 3, verdict })).toEqual(['escalated', 'escalated', 'passed']);
  });

  it('bloqué : la dernière étape est refusée', () => {
    expect(stepStates({ status: 'blocked', verdict: { ...verdict, granted: false, color: 'red' } })).toEqual([
      'escalated',
      'escalated',
      'failed',
    ]);
  });
});

describe('ConsoleHeader', () => {
  it('affiche le titre et les trois étapes', () => {
    render(<ConsoleHeader state={{ status: 'pending', level: 2 }} />);
    expect(screen.getByText('Security console')).toBeInTheDocument();
    expect(screen.getByLabelText('Device: in progress')).toBeInTheDocument();
    expect(screen.getByLabelText('Typing: doubt')).toBeInTheDocument();
    expect(screen.getByLabelText('Posture: upcoming')).toBeInTheDocument();
  });
});
