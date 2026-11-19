import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerdictCard } from '../../../src/web/components/VerdictCard';

describe('VerdictCard', () => {
  it('Authentifié si granted', () => {
    render(<VerdictCard verdict={{ level: 1, score: 92, color: 'green', granted: true }} />);
    expect(screen.getByText('Authentifié')).toBeInTheDocument();
    expect(screen.getByText('92')).toBeInTheDocument();
  });
  it('Échec sinon', () => {
    render(<VerdictCard verdict={{ level: 1, score: 20, color: 'red', granted: false }} />);
    expect(screen.getByText('Échec')).toBeInTheDocument();
  });
  it('En attente si null', () => {
    render(<VerdictCard verdict={null} />);
    expect(screen.getByText('En attente')).toBeInTheDocument();
  });
});
