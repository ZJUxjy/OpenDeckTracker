import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';
import { LANGUAGE_PREFERENCE_STORAGE_KEY } from '../src/i18n/i18n-store';
import { Settings } from '../src/components/Settings';

describe('Settings i18n', () => {
  beforeEach(() => {
    localStorage.removeItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
    vi.resetModules();
  });

  it('persists and applies Simplified Chinese language selection', async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider systemLanguage="en-US">
        <Settings />
      </I18nProvider>,
    );

    // Appearance is the default active category and hosts the language
    // picker — no sidebar click needed.
    await user.click(screen.getByRole('button', { name: 'Simplified Chinese' }));

    expect(localStorage.getItem(LANGUAGE_PREFERENCE_STORAGE_KEY)).toBe('zh-CN');
    expect(screen.getByText('设置')).toBeInTheDocument();
    // Sidebar entry for Appearance now reads in Chinese as "外观"; appears
    // both in the sidebar button and the panel heading, so just confirm
    // it's present (multiple matches are expected).
    expect(screen.getAllByText('外观').length).toBeGreaterThanOrEqual(1);
  });
});
