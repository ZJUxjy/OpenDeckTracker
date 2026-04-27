import './styles/index.css';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router';
import App from './App';
import { routes } from './routes';
import { I18nProvider } from './i18n';

const router = createHashRouter([{ path: '/', element: <App />, children: routes }]);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');
createRoot(rootEl).render(
  <I18nProvider>
    <RouterProvider router={router} />
  </I18nProvider>,
);
