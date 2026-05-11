import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SetProgress } from '@hdt/core';

import { CollectionSetDetail } from '../src/components/CollectionSetDetail';
import { I18nProvider } from '../src/i18n';

function row(overrides: Partial<SetProgress> & { setCode: string }): SetProgress {
  return {
    setCode: overrides.setCode,
    format: overrides.format ?? 'standard',
    totalCards: overrides.totalCards ?? 72,
    totalCopies: overrides.totalCopies ?? 144,
    ownedCopies: overrides.ownedCopies ?? 0,
    ownedUniqueCards: overrides.ownedUniqueCards ?? 0,
  };
}

function renderDetail(props: Partial<React.ComponentProps<typeof CollectionSetDetail>> = {}) {
  const defaults: React.ComponentProps<typeof CollectionSetDetail> = {
    setCode: 'SET_1897',
    row: row({ setCode: 'SET_1897' }),
    ownedByDbfId: new Map(),
    onBack: () => undefined,
  };
  return render(
    <I18nProvider preference="en-US">
      <CollectionSetDetail {...defaults} {...props} />
    </I18nProvider>,
  );
}

describe('CollectionSetDetail — header', () => {
  it('renders set name and English subtitle in en-US', () => {
    renderDetail({ setCode: 'SET_1897', row: row({ setCode: 'SET_1897', totalCards: 263 }) });
    expect(screen.getByText("Whizbang's Workshop")).toBeInTheDocument();
    expect(screen.getByTestId('detail-subtitle').textContent).toContain('263 cards');
  });

  it('renders MINI-SET badge when the set label contains Mini-Set', () => {
    // 'TITANS' label is plain in en-US, so we fake a known mini set entry.
    // The mini detection runs on the label; use a code whose en-US label contains "Mini-Set".
    renderDetail({ setCode: 'SET_1898', row: row({ setCode: 'SET_1898', totalCards: 35 }) });
    expect(screen.getByTestId('detail-mini-badge')).toBeInTheDocument();
  });

  it('renders the complete pill only when ownedCopies === totalCopies', () => {
    const { rerender } = renderDetail({
      setCode: 'SET_1897',
      row: row({ setCode: 'SET_1897', ownedCopies: 144, totalCopies: 144, ownedUniqueCards: 72, totalCards: 72 }),
    });
    expect(screen.getByTestId('detail-complete-pill')).toBeInTheDocument();

    rerender(
      <I18nProvider preference="en-US">
        <CollectionSetDetail
          setCode="SET_1897"
          row={row({ setCode: 'SET_1897', ownedCopies: 50, totalCopies: 144 })}
          ownedByDbfId={new Map()}
          onBack={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.queryByTestId('detail-complete-pill')).not.toBeInTheDocument();
  });

  it('back button click invokes onBack', () => {
    const onBack = vi.fn();
    renderDetail({ onBack });
    fireEvent.click(screen.getByTestId('detail-back'));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders ownedUniqueCards / totalCards stat in the header', () => {
    renderDetail({
      setCode: 'SET_1897',
      row: row({ setCode: 'SET_1897', ownedUniqueCards: 50, totalCards: 263 }),
    });
    expect(screen.getByTestId('detail-unique-value').textContent).toBe('50');
    expect(screen.getByTestId('detail-unique-total').textContent).toContain('263');
  });
});
