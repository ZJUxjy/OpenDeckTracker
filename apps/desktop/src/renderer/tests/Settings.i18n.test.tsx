import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/i18n';
import {
  LANGUAGE_PREFERENCE_CHANGED_EVENT,
  LANGUAGE_PREFERENCE_STORAGE_KEY,
  useI18nStore,
} from '../src/i18n/i18n-store';
import { Settings } from '../src/components/Settings';

describe('Settings i18n', () => {
  beforeEach(() => {
    localStorage.removeItem(LANGUAGE_PREFERENCE_STORAGE_KEY);
    useI18nStore.setState({ languagePreference: 'system' });
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

  it('applies same-window language preference notifications', async () => {
    render(
      <I18nProvider systemLanguage="en-US">
        <Settings />
      </I18nProvider>,
    );

    expect(screen.getByText('Settings')).toBeInTheDocument();

    act(() => {
      localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'zh-CN');
      window.dispatchEvent(
        new CustomEvent(LANGUAGE_PREFERENCE_CHANGED_EVENT, {
          detail: { languagePreference: 'zh-CN' },
        }),
      );
    });

    expect(await screen.findByText('设置')).toBeInTheDocument();
  });

  it('hydrates from the saved language preference when memory state is stale', async () => {
    localStorage.setItem(LANGUAGE_PREFERENCE_STORAGE_KEY, 'zh-CN');
    useI18nStore.setState({ languagePreference: 'en-US' });

    render(
      <I18nProvider systemLanguage="en-US">
        <Settings />
      </I18nProvider>,
    );

    expect(await screen.findByText('设置')).toBeInTheDocument();
  });
});
