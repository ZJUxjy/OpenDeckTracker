import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdvisorConfig } from '@hdt/advisor';
import { I18nProvider } from '../src/i18n';
import { Settings } from '../src/components/Settings';

const baseConfig: AdvisorConfig = {
  enabled: true,
  autoSuggest: false,
  provider: 'openai',
  model: 'gpt-4o-mini',
  apiKeyRef: 'keyref:openai',
  language: 'zh',
  maxToolRounds: 4,
};

function renderSettings() {
  return render(
    <I18nProvider preference="en-US">
      <Settings />
    </I18nProvider>,
  );
}

beforeEach(() => {
  const setConfig = vi.fn(async (config: AdvisorConfig) => config);
  (window as unknown as { hdt: typeof window.hdt }).hdt = {
    ...window.hdt,
    advisor: {
      ...window.hdt.advisor,
      getConfig: vi.fn().mockResolvedValue(baseConfig),
      setConfig,
      setApiKey: vi.fn().mockResolvedValue('keyref:new'),
    },
  };
});

describe('Settings — AI Advice category', () => {
  it('loads advisor config and saves switch changes', async () => {
    renderSettings();
    fireEvent.click(screen.getByTestId('settings-category-advisor'));

    await waitFor(() => {
      expect(window.hdt.advisor.getConfig).toHaveBeenCalled();
    });

    const enabled = await screen.findByTestId('settings-advisor-enabled');
    const autoSuggest = screen.getByTestId('settings-advisor-autosuggest');
    expect(enabled).toHaveAttribute('aria-checked', 'true');
    expect(autoSuggest).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('settings-advisor-model')).toHaveValue('gpt-4o-mini');

    fireEvent.click(autoSuggest);
    await waitFor(() => {
      expect(window.hdt.advisor.setConfig).toHaveBeenCalledWith(
        expect.objectContaining({ autoSuggest: true }),
      );
    });
  });

  it('shows base URL only for OpenAI-compatible providers', async () => {
    renderSettings();
    fireEvent.click(screen.getByTestId('settings-category-advisor'));

    await screen.findByTestId('settings-advisor-model');
    expect(screen.queryByTestId('settings-advisor-base-url')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'OpenAI Compatible' }));
    expect(await screen.findByTestId('settings-advisor-base-url')).toBeInTheDocument();
    await waitFor(() => {
      expect(window.hdt.advisor.setConfig).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'openai-compatible' }),
      );
    });
  });

  it('stores API keys through setApiKey and never renders the saved key', async () => {
    renderSettings();
    fireEvent.click(screen.getByTestId('settings-category-advisor'));

    const apiKey = await screen.findByTestId('settings-advisor-api-key');
    expect(apiKey).toHaveAttribute('placeholder', 'Already set');

    fireEvent.change(apiKey, { target: { value: 'sk-test-secret' } });
    fireEvent.click(screen.getByTestId('settings-advisor-api-key-save'));

    await waitFor(() => {
      expect(window.hdt.advisor.setApiKey).toHaveBeenCalledWith('openai', 'sk-test-secret');
      expect(window.hdt.advisor.setConfig).toHaveBeenCalledWith(
        expect.objectContaining({ apiKeyRef: 'keyref:new' }),
      );
    });
    expect(screen.queryByDisplayValue('sk-test-secret')).not.toBeInTheDocument();
  });
});
