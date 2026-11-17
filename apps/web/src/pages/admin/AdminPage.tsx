import { useState } from 'react';
import { motion } from 'motion/react';
import { LoginForm } from '../../components/LoginForm';
import { useAuth } from '../../lib/auth';
import { PersonsPanel } from './PersonsPanel';
import { ResetPanel } from './ResetPanel';
import { SettingsPanel } from './SettingsPanel';
import { SubmissionsPanel } from './SubmissionsPanel';
import './admin.css';

/** Admin area (P2). Logout lives in the shell's avatar menu. */
export function AdminPage() {
  const { authenticated, login } = useAuth();
  // Bumped after a reset so panels that load once remount with fresh data.
  const [resets, setResets] = useState(0);
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

  return (
    <main className="page admin">
      <h1>Admin</h1>
      <div className="admin-grid">
        <PersonsPanel key={`persons-${resets}`} />
        <div className="admin-column">
          <SettingsPanel />
          <SubmissionsPanel key={`submissions-${resets}`} />
          <ResetPanel onReset={() => setResets((n) => n + 1)} />
        </div>
      </div>
    </main>
  );
}
