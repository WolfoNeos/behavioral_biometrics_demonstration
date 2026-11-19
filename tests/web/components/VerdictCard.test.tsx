import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VerdictCard } from '../../../src/web/components/VerdictCard';

describe('VerdictCard', () => {
  it('Authenticated si granted', () => {
    render(<VerdictCard verdict={{ level: 1, score: 92, color: 'green', granted: true }} />);
    expect(screen.getByText('Authenticated')).toBeInTheDocument();
    expect(screen.getByText('92')).toBeInTheDocument();
  });
  it('Failed sinon', () => {
    render(<VerdictCard verdict={{ level: 1, score: 20, color: 'red', granted: false }} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
  it('Pending if null', () => {
    render(<VerdictCard verdict={null} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });
});
