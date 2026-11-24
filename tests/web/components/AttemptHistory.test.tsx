import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ControlBar } from '../../../src/web/components/ControlBar';
import { AttemptHistory } from '../../../src/web/components/AttemptHistory';

describe('AttemptHistory', () => {
  it('rien sans essai', () => {
    const { container } = render(<AttemptHistory attempts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('liste étape, score et verdict de chaque essai ; les 8 derniers seulement', () => {
    const attempts = Array.from({ length: 10 }, (_, i) => ({
      n: i + 1,
      level: 1 as const,
      score: 90 - i,
      secret: i !== 6,
      granted: i % 2 === 0 && i !== 6,
    }));
    render(<AttemptHistory attempts={attempts} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(8);
    expect(items[0]).toHaveTextContent('#3');
    expect(items[7]).toHaveTextContent('#10');
    expect(items[2]).toHaveClass('ok'); // essai 5
    expect(items[3]).toHaveClass('warn'); // essai 6 : refusé mais secret bon
    expect(items[4]).toHaveClass('ko'); // essai 7 : secret faux
  });
});

describe('ControlBar : rester sur l’étape', () => {
  it('la bascule indique son état et appelle onStay', async () => {
    const onStay = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <ControlBar onJump={() => undefined} onReset={() => undefined} onStay={onStay} stay={false} level={1} />
      </MemoryRouter>,
    );
    const btn = screen.getByRole('button', { name: 'Stay on step' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn);
    expect(onStay).toHaveBeenCalledWith(true);
    rerender(
      <MemoryRouter>
        <ControlBar onJump={() => undefined} onReset={() => undefined} onStay={onStay} stay level={1} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Stay on step' })).toHaveAttribute('aria-pressed', 'true');
  });
});
