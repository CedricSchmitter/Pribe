import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { LazyMotion } from 'motion/react';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { AuthProvider } from './lib/auth';
import { ShellProvider, ToastProvider } from './shell';
import './theme.css';

// Components import `m` (aliased as `motion`); the animation features load as their own chunk (R89).
const motionFeatures = () => import('./motionFeatures').then((mod) => mod.default);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LazyMotion features={motionFeatures} strict>
      <BrowserRouter>
        <AuthProvider>
          <ShellProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ShellProvider>
        </AuthProvider>
      </BrowserRouter>
    </LazyMotion>
  </StrictMode>,
);
