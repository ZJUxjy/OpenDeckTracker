import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ResourceGroupsPanel } from '../src/components/ResourceGroupsPanel';
import { I18nProvider } from '../src/i18n';

vi.mock('../src/hooks/use-card-def', () => ({ useCardDef: (id: string) => ({ name: id }) }));
beforeEach(() => localStorage.clear());
const props = { storageKey: 'test', deck: [{ cardId: 'A', count: 2 }], choices: ['A', 'B'],
  observed: [{ entityId: 1, cardId: 'A', created: false }, { entityId: 2, cardId: 'A', created: true }], predicted: true };
const mount = () => render(<I18nProvider preference="en-US"><ResourceGroupsPanel {...props} /></I18nProvider>);

it('saves, restores, edits and deletes named resource groups with distinct observed/predicted counts', () => {
  const view = mount();
  fireEvent.click(screen.getByText('Create or edit a resource group'));
  fireEvent.change(screen.getByLabelText('Group name (e.g. removal, healing, combo)'), { target: { value: 'Removal' } });
  const list = screen.getByRole('listbox');
  (within(list).getByRole('option', { name: 'A' }) as HTMLOptionElement).selected = true;
  fireEvent.change(list);
  fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
  expect(screen.getByText('Removal')).toBeInTheDocument();
  expect(screen.getByText('Predicted copies not yet seen played: 1')).toBeInTheDocument();
  expect(screen.getByText('Observed original copies played: 1; generated copies: 1.')).toBeInTheDocument();
  view.unmount(); mount();
  expect(screen.getByText('Removal')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByLabelText('Group name (e.g. removal, healing, combo)'), { target: { value: 'Answers' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save group' }));
  expect(screen.getByText('Answers')).toBeInTheDocument();
  expect(screen.queryByText('Removal')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.queryByText('Answers')).not.toBeInTheDocument();
});
