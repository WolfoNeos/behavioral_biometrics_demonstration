import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PostureRuns } from '../../../src/web/components/PostureRuns';

const run = (n: number, score: number, beta: number, secret = true) => ({
  n,
  phone: `p${n}`,
  score,
  beta,
  deviation: Math.abs(beta - 45),
  secret,
});

describe('PostureRuns', () => {
  it('attente sans téléphone', () => {
    render(<PostureRuns runs={[]} expectedBeta={45} accept={80} warn={50} />);
    expect(screen.getByTestId('posture-runs-empty')).toBeInTheDocument();
  });

  it('une ligne par téléphone : score, angle face à A, PIN, couleur selon les seuils', () => {
    render(
      <PostureRuns
        runs={[run(1, 97, 46), run(2, 62, 55), run(3, 20, 80, false)]}
        expectedBeta={45}
        accept={80}
        warn={50}
      />,
    );
    const rows = screen.getAllByTestId('posture-run');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveClass('ok');
    expect(rows[1]).toHaveClass('mid');
    expect(rows[2]).toHaveClass('ko');
    expect(within(rows[0]).getByText('Phone 1')).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('97');
    expect(rows[1]).toHaveTextContent('55°');
    expect(rows[1]).toHaveTextContent('vs 45°');
    expect(rows[0]).toHaveTextContent('PIN ✓');
    expect(rows[2]).toHaveTextContent('PIN ✗');
  });
});
