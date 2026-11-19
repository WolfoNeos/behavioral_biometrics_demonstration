import { describe, expect, it } from 'vitest';
import { DEFAULT_WELCOME, MAX_TRANSACTIONS, sanitizeWelcome } from '../../src/shared/welcome';

describe('sanitizeWelcome', () => {
  it('invalid content -> valeurs par défaut', () => {
    expect(sanitizeWelcome(null)).toEqual(DEFAULT_WELCOME);
    expect(sanitizeWelcome('x')).toEqual(DEFAULT_WELCOME);
  });

  it('garde les textes valides, tronque et rogne', () => {
    const w = sanitizeWelcome({ name: '  Prof  ', notice: 'x'.repeat(500), balance: '1 000', currency: 42 });
    expect(w.name).toBe('Prof');
    expect(w.notice).toHaveLength(200);
    expect(w.balance).toBe('1 000');
    expect(w.currency).toBe(DEFAULT_WELCOME.currency);
  });

  it('limite et nettoie les opérations ; une liste vide est permise', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ icon: '•', label: `op ${i}`, amount: '+ 1' }));
    expect(sanitizeWelcome({ transactions: many }).transactions).toHaveLength(MAX_TRANSACTIONS);
    expect(sanitizeWelcome({ transactions: [] }).transactions).toEqual([]);
    expect(sanitizeWelcome({ transactions: [{ label: '', amount: '' }, 3, { label: 'a' }] }).transactions).toEqual([
      { icon: '', label: 'a', amount: '' },
    ]);
  });
});
