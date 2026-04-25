// Must be first — Sentry must init before ReactDOM mounts.
// eslint-disable-next-line import/first
import './sentry';
import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

try {
  if (localStorage.getItem('admin_theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
} catch {
  /* ignore — known Phase-2 anti-pattern site */
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ eventId }) => (
        <div style={{ padding: 24 }}>
          <h2>Произошла ошибка</h2>
          <p>Код для поддержки: {eventId}</p>
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);
