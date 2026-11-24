import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AttemptHistory } from '../../../src/web/components/AttemptHistory';
import { ControlBar } from '../../../src/web/components/ControlBar';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

describe('AttemptHistory', () => {
  it('rien sans essai', () => {
    const { container } = render(<AttemptHistory attempts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('liste étape, score et verdict de chaque essai ; les 6 derniers seulement', () => {
    const attempts = Array.from({ length: 10 }, (_, i) => ({
      n: i + 1,
      level: 1 as const,
      score: 90 - i,
      secret: i !== 6,
      granted: i % 2 === 0 && i !== 6,
    }));
    render(<AttemptHistory attempts={attempts} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent('#5');
    expect(items[5]).toHaveTextContent('#10');
    expect(items[0]).toHaveClass('ok'); // essai 5
    expect(items[1]).toHaveClass('warn'); // essai 6 : refusé mais secret bon
    expect(items[2]).toHaveClass('ko'); // essai 7 : secret faux
  });
});

describe('ControlBar : simuler une saisie', () => {
  it('Play A / Play B appellent onSimulate', async () => {
    const onSimulate = vi.fn();
    render(
      <MemoryRouter>
        <ControlBar onJump={() => undefined} onReset={() => undefined} onSimulate={onSimulate} level={1} />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Play A' }));
    await userEvent.click(screen.getByRole('button', { name: 'Play B' }));
    expect(onSimulate.mock.calls).toEqual([['A'], ['B']]);
  });
});
