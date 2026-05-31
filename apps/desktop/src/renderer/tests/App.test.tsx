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

  it('keeps the reference background at the app shell level', () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <App />, children: routes }],
      { initialEntries: ['/tracker'] },
    );
    const { container } = render(<RouterProvider router={router} />);

    expect(container.querySelectorAll('.reference-global-hero')).toHaveLength(1);
    expect(container.querySelector('.reference-route-surface .reference-hero-art')).toBeNull();
  });

  it('bounds routed pages so their own vertical scroll areas can work', () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <App />, children: routes }],
      { initialEntries: ['/tracker'] },
    );
    const { container } = render(<RouterProvider router={router} />);

    const routeSurface = container.querySelector('.reference-route-surface');
    expect(routeSurface).toHaveClass('flex', 'flex-col', 'min-h-0');
  });
});
