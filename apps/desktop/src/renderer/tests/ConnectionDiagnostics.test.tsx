import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConnectionDiagnostics } from '../src/components/ConnectionDiagnostics';
import { useHearthWatcherStore } from '../src/stores/hearthwatcher-store';

describe('connection diagnostics', () => {
  it('requests rediscovery and exposes the known log folder', async () => {
    const status = { kind: 'ready' as const, path: 'C:\\Games\\Logs\\Power.log', message: 'Listening', timestamp: 100 };
    useHearthWatcherStore.setState({ status });
    window.hdt.hearthwatcher = {
      rediscover: vi.fn().mockResolvedValue(true), getStatus: vi.fn().mockResolvedValue(status),
      openLogDirectory: vi.fn().mockResolvedValue(true), onStatus: vi.fn(), onEvent: vi.fn(),
    };
    render(<ConnectionDiagnostics />);
    fireEvent.click(screen.getByRole('button', { name: 'Check again / reconnect' }));
    await waitFor(() => expect(window.hdt.hearthwatcher.rediscover).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open game log folder' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Open game log folder' }));
    await waitFor(() => expect(window.hdt.hearthwatcher.openLogDirectory).toHaveBeenCalledTimes(1));
    expect(screen.getByText(status.path)).toBeInTheDocument();
  });
});
