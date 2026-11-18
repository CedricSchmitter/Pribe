import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ShellLayout } from './shell';

// One chunk per area (R89); ShellLayout shows the loading state while a chunk arrives.
const AdminPage = lazy(() => import('./pages/admin/AdminPage').then((m) => ({ default: m.AdminPage })));
const SubmitPage = lazy(() => import('./pages/submit/SubmitPage').then((m) => ({ default: m.SubmitPage })));
const HostPage = lazy(() => import('./pages/host/HostPage').then((m) => ({ default: m.HostPage })));
const VotePage = lazy(() => import('./pages/vote/VotePage').then((m) => ({ default: m.VotePage })));
const RemotePage = lazy(() => import('./pages/remote/RemotePage').then((m) => ({ default: m.RemotePage })));

/** Each area owns its sub-routes inside its page module, so this file rarely changes. */
export function App() {
  return (
    <Routes>
      <Route element={<ShellLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/submit/*" element={<SubmitPage />} />
        <Route path="/host/*" element={<HostPage />} />
        <Route path="/vote/*" element={<VotePage />} />
        <Route path="/remote/*" element={<RemotePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
