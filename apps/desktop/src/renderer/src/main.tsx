import './styles/index.css';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router';
import App from './App';
import { routes } from './routes';

const router = createHashRouter([{ path: '/', element: <App />, children: routes }]);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');
createRoot(rootEl).render(<RouterProvider router={router} />);
