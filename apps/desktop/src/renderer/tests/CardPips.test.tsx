import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardPips } from '../src/components/CardPips';

describe('CardPips', () => {
  it('renders 2 filled dots when remaining === max === 2', () => {
    render(<CardPips remaining={2} max={2} />);
    expect(screen.getAllByTestId('pip-filled')).toHaveLength(2);
    expect(screen.queryAllByTestId('pip-hollow')).toHaveLength(0);
  });

  it('renders 1 filled + 1 hollow when remaining=1, max=2', () => {
    render(<CardPips remaining={1} max={2} />);
    expect(screen.getAllByTestId('pip-filled')).toHaveLength(1);
    expect(screen.getAllByTestId('pip-hollow')).toHaveLength(1);
  });

  it('renders 2 hollow dots when remaining=0, max=2', () => {
    render(<CardPips remaining={0} max={2} />);
    expect(screen.queryAllByTestId('pip-filled')).toHaveLength(0);
    expect(screen.getAllByTestId('pip-hollow')).toHaveLength(2);
  });

  it('renders exactly 1 filled dot for legendary (max=1)', () => {
    render(<CardPips remaining={1} max={1} />);
    expect(screen.getAllByTestId('pip-filled')).toHaveLength(1);
    expect(screen.queryAllByTestId('pip-hollow')).toHaveLength(0);
  });

  it('clamps to max when remaining > max (defensive)', () => {
    render(<CardPips remaining={5} max={2} />);
    expect(screen.getAllByTestId('pip-filled')).toHaveLength(2);
    expect(screen.queryAllByTestId('pip-hollow')).toHaveLength(0);
  });
});
