import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CardDataPanel } from '../src/components/CardDataPanel';
import type { CardDataStatus } from '../../main/card-data-store';

const active = { build: '1', version: '1.0.0.1', commit: 'a'.repeat(40), totalCards: 10, collectibleCards: 5, generatedAt: '2026-09-08T00:00:00Z' };
const pending = { ...active, build: '2', version: '1.0.0.2', commit: 'b'.repeat(40) };
const initial: CardDataStatus = { active, pending: null, latest: null, canRollback: false, busy: false };
describe('card data settings', () => {
  it('refreshes a download that was started before the panel mounted', async () => {
    vi.mocked(window.hdt.cardData.getStatus).mockResolvedValueOnce({ ...initial, busy: true })
      .mockResolvedValue({ ...initial, pending, canRollback: true });
    render(<CardDataPanel />);
    await screen.findByText('1.0.0.1');
    expect(screen.getByRole('button', { name: 'Check card updates' })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check card updates' })).toBeEnabled(), { timeout: 2500 });
    expect(screen.getByText('1.0.0.2')).toBeInTheDocument();
  });
  beforeEach(() => {
    window.hdt.cardData = { getStatus: vi.fn().mockResolvedValue(initial),
      check: vi.fn().mockResolvedValue({ ...initial, latest: pending }),
      install: vi.fn().mockResolvedValue({ ...initial, pending, latest: pending, canRollback: true }),
      rollback: vi.fn().mockResolvedValue({ ...initial, latest: pending, canRollback: true }) };
  });
  it('shows active and pending versions separately and supports rollback', async () => {
    render(<CardDataPanel />);
    expect(await screen.findByText('1.0.0.1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download update' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Check card updates' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download update' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Download update' }));
    expect(await screen.findByText('1.0.0.2')).toBeInTheDocument();
    expect(screen.getByText('1.0.0.1')).toBeInTheDocument();
    expect(screen.getByText(/Restart the tracker after your match/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore previous version' }));
    await waitFor(() => expect(screen.queryByText('1.0.0.2')).not.toBeInTheDocument());
    expect(window.hdt.cardData.rollback).toHaveBeenCalledTimes(1);
  });
  it('keeps the current version after failure and lets the user retry', async () => {
    vi.mocked(window.hdt.cardData.check).mockRejectedValueOnce(new Error('offline'));
    render(<CardDataPanel />);
    await screen.findByText('1.0.0.1');
    fireEvent.click(screen.getByRole('button', { name: 'Check card updates' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('operation failed');
    expect(screen.getByText('1.0.0.1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check card updates' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download update' })).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
