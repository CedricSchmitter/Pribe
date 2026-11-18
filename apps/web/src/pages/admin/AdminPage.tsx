import { useEffect, useState } from 'react';
import { LazyMotion, m as motion } from 'motion/react';
import { API_PATHS, type ProbeStatusDto } from '@pribe/shared';
import { LoginForm } from '../../components/LoginForm';
import { ProbeBanner } from '../../components/ProbeBanner';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { GuestPanel } from './GuestPanel';
import { PersonsPanel } from './PersonsPanel';
import { ProbePanel } from './ProbePanel';
import { ResetPanel } from './ResetPanel';
import { SettingsPanel } from './SettingsPanel';
import { SubmissionsPanel } from './SubmissionsPanel';
import './admin.css';

// The person and submission lists animate with `layout`, which the app-wide feature set leaves out.
const motionMax = () => import('../../motionMax').then((mod) => mod.default);

/** Admin area (P2). Logout lives in the shell's avatar menu. */
export function AdminPage() {
  const { authenticated, login } = useAuth();
  // Bumped after a reset so panels that load once remount with fresh data.
  const [resets, setResets] = useState(0);
  const [probe, setProbe] = useState<boolean | null>(null);
  useEffect(() => {
    if (!authenticated) return;
    api<ProbeStatusDto>(API_PATHS.admin.probe)
      .then((r) => setProbe(r.active))
      .catch(() => setProbe(false));
  }, [authenticated]);
  if (authenticated === null) return null;

  if (!authenticated) {
    return (
      <main className="page center stack">
        <motion.div
          className="hero-emoji"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 12 }}
        >
          🛠️
        </motion.div>
        <h1>Admin</h1>
        <LoginForm onLogin={login} />
      </main>
    );
  }

  // The test run swaps every data source, so all panels reload with it.
  const world = `${resets}-${probe ? 'probe' : 'real'}`;
  return (
    <LazyMotion features={motionMax} strict>
      <main className="page admin">
        {probe && <ProbeBanner />}
        <h1>Admin</h1>
        <div className="admin-grid">
          <PersonsPanel key={`persons-${world}`} />
          <div className="admin-column">
            {probe !== null && <ProbePanel active={probe} onChange={setProbe} />}
            <SettingsPanel key={`settings-${world}`} />
            <SubmissionsPanel key={`submissions-${world}`} />
            <GuestPanel key={`guest-${world}`} />
            <ResetPanel onReset={() => setResets((n) => n + 1)} />
          </div>
        </div>
      </main>
    </LazyMotion>
  );
}
