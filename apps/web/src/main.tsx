import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthShell from './features/auth/AuthShell';
import './style.css';
import { PublicWaitingBoard } from './features/queue/PublicWaitingBoard';
import { ErrorBoundary } from './components/ErrorBoundary';
const waitingPath=/^\/waiting\/([a-z0-9][a-z0-9-]{0,62})\/?$/.exec(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {waitingPath ? <PublicWaitingBoard slug={waitingPath[1]} /> : <AuthShell />}
    </ErrorBoundary>
  </React.StrictMode>
);
