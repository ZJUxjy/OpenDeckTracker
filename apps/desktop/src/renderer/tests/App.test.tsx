import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import App from '../src/App';
import { routes } from '../src/routes';

describe('App', () => {
  it('renders FIRESTONE brand and default Tracker view', () => {
    const router = createMemoryRouter(
      [{ path: '/', element: <App />, children: routes }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText(/FIRESTONE/i)).toBeInTheDocument();
  });
});
