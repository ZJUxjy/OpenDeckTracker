import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CollectionSyncButton } from '../src/components/CollectionSyncButton';
import { I18nProvider } from '../src/i18n';

function renderBtn(props: Partial<React.ComponentProps<typeof CollectionSyncButton>> = {}) {
  return render(
    <I18nProvider preference="en-US">
      <CollectionSyncButton
        state={props.state ?? 'idle'}
        onClick={props.onClick ?? (() => undefined)}
      />
    </I18nProvider>,
  );
}

describe('CollectionSyncButton', () => {
  it('renders idle label and is enabled by default', () => {
    renderBtn({ state: 'idle' });
    const btn = screen.getByTestId('collection-sync-button');
    expect(btn.textContent).toContain('Sync');
    expect(btn).not.toBeDisabled();
  });

  it('shows syncing label and is disabled when state is syncing', () => {
    renderBtn({ state: 'syncing' });
    const btn = screen.getByTestId('collection-sync-button');
    expect(btn.textContent).toContain('Syncing');
    expect(btn).toBeDisabled();
  });

  it('shows success label when state is success', () => {
    renderBtn({ state: 'success' });
    const btn = screen.getByTestId('collection-sync-button');
    expect(btn.textContent).toContain('Synced');
    expect(btn).not.toBeDisabled();
  });

  it('shows error label when state is error', () => {
    renderBtn({ state: 'error' });
    const btn = screen.getByTestId('collection-sync-button');
    expect(btn.textContent).toContain('Sync failed');
    expect(btn).not.toBeDisabled();
  });

  it('clicking idle button invokes onClick handler', () => {
    const onClick = vi.fn();
    renderBtn({ state: 'idle', onClick });
    fireEvent.click(screen.getByTestId('collection-sync-button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('clicking syncing button is a no-op', () => {
    const onClick = vi.fn();
    renderBtn({ state: 'syncing', onClick });
    fireEvent.click(screen.getByTestId('collection-sync-button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
