import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ManaCurveChart } from '../src/components/ManaCurveChart';

describe('ManaCurveChart', () => {
  it('renders 8 rect elements', () => {
    const { container } = render(<ManaCurveChart buckets={[0, 1, 2, 3, 4, 5, 6, 7]} />);
    expect(container.querySelectorAll('rect')).toHaveLength(8);
  });

  it('all-zero buckets render without error', () => {
    expect(() => render(<ManaCurveChart buckets={[0, 0, 0, 0, 0, 0, 0, 0]} />)).not.toThrow();
  });

  it('non-zero bucket renders with height >= 1px', () => {
    const { container } = render(
      <ManaCurveChart buckets={[0, 0, 0, 0, 0, 0, 0, 1]} height={48} />,
    );
    const rects = container.querySelectorAll('rect');
    const lastBar = rects[7]!;
    expect(parseFloat(lastBar.getAttribute('height')!)).toBeGreaterThanOrEqual(1);
  });

  it('SVG root has role="img" and aria-label', () => {
    const { container } = render(
      <ManaCurveChart buckets={[1, 1, 1, 1, 1, 1, 1, 1]} ariaLabel="Mana curve" />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Mana curve');
  });

  it('zero-value bars have height 0 (visually absent)', () => {
    const { container } = render(<ManaCurveChart buckets={[5, 0, 0, 0, 0, 0, 0, 0]} />);
    const rects = container.querySelectorAll('rect');
    expect(parseFloat(rects[1]!.getAttribute('height')!)).toBe(0);
  });
});
