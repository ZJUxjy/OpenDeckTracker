import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { FormatFilterPills } from '../src/components/FormatFilterPills';
import { I18nProvider } from '../src/i18n';

describe('FormatFilterPills', () => {
  it('renders five localized pills', () => {
    render(
      <I18nProvider preference="en-US">
        <FormatFilterPills value="all" onChange={() => undefined} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('format-pill-all').textContent).toContain('All');
    expect(screen.getByTestId('format-pill-standard').textContent).toContain('Standard');
    expect(screen.getByTestId('format-pill-wild').textContent).toContain('Wild');
    expect(screen.getByTestId('format-pill-classic').textContent).toContain('Classic');
    expect(screen.getByTestId('format-pill-twist').textContent).toContain('Twist');
  });

  it('calls onChange with the clicked filter value', () => {
    const onChange = vi.fn();
    render(
      <I18nProvider preference="en-US">
        <FormatFilterPills value="all" onChange={onChange} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTestId('format-pill-standard'));
    expect(onChange).toHaveBeenCalledWith('standard');
  });

  it('reflects the active pill via aria-pressed', () => {
    render(
      <I18nProvider preference="en-US">
        <FormatFilterPills value="wild" onChange={() => undefined} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('format-pill-wild').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('format-pill-all').getAttribute('aria-pressed')).toBe('false');
  });

  it('renders zh-CN labels', () => {
    render(
      <I18nProvider preference="zh-CN">
        <FormatFilterPills value="all" onChange={() => undefined} />
      </I18nProvider>,
    );
    expect(screen.getByTestId('format-pill-standard').textContent).toContain('标准');
  });
});
