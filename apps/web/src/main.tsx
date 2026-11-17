import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { ShellProvider, ToastProvider } from './shell';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ShellProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ShellProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
