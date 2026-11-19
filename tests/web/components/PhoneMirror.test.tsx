import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhoneMirror } from '../../../src/web/components/PhoneMirror';

const view = (over = {}) => ({ screen: 'pin' as const, digits: 0, pressed: null, again: false, ...over });

describe('PhoneMirror', () => {
  it('sans téléphone : écran éteint en attente', () => {
    render(<PhoneMirror view={null} connected={false} />);
    expect(screen.getByText('Waiting for the phone')).toBeInTheDocument();
    expect(screen.queryByText('Enter your PIN')).toBeNull();
  });

  it('reflète le pavé PIN : points remplis et touche allumée', () => {
    const { container } = render(<PhoneMirror view={view({ digits: 3, pressed: '5' })} connected />);
    expect(screen.getByText('Enter your PIN')).toBeInTheDocument();
    expect(container.querySelectorAll('.dot.filled')).toHaveLength(3);
    expect(container.querySelector('.key.pressed')).toHaveTextContent('5');
  });

  it('étape suivante : demande reformulée', () => {
    render(<PhoneMirror view={view({ again: true })} connected />);
    expect(screen.getByText('Enter your PIN again')).toBeInTheDocument();
  });

  it('écrans intermédiaires neutres, sans résultat ni posture', () => {
    const { container, rerender } = render(<PhoneMirror view={view({ screen: 'checking' })} connected />);
    expect(screen.getByText('Verifying…')).toBeInTheDocument();
    rerender(<PhoneMirror view={view({ screen: 'step' })} connected />);
    expect(screen.getByText('Additional verification')).toBeInTheDocument();
    rerender(<PhoneMirror view={view({ screen: 'done' })} connected />);
    expect(screen.getByText('Look at the screen')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/granted|denied|score|posture|sensor|angle/i);
  });
});
