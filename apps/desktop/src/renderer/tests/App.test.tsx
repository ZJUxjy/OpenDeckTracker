import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import App from '../src/App';
import { routes } from '../src/routes';

describe('App', () => {
  it('renders OpenDeckTracker brand and removes legacy prototype names', () => {
    const legacyBrandPattern = new RegExp(['FIRE', 'STONE|Fire', 'place'].join(''), 'i');
    const router = createMemoryRouter(
      [{ path: '/', element: <App />, children: routes }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText('OpenDeckTracker')).toBeInTheDocument();
    expect(screen.queryByText(legacyBrandPattern)).not.toBeInTheDocument();
  });
});
