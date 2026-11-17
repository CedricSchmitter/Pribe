import { Route, Routes } from 'react-router';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { AdminPage } from './pages/admin/AdminPage';
import { HostPage } from './pages/host/HostPage';
import { SubmitPage } from './pages/submit/SubmitPage';
import { VotePage } from './pages/vote/VotePage';
import { ShellLayout } from './shell';

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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
