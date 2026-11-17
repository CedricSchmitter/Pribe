import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'pribe-theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

function readOverride(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Light/dark switch; without a stored choice the system setting applies. */
export function useTheme() {
  const [override, setOverride] = useState<Theme | null>(readOverride);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const m = media();
    const onChange = () => setSystemDark(m.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (override) document.documentElement.dataset.theme = override;
    else delete document.documentElement.dataset.theme;
  }, [override]);

  const theme: Theme = override ?? (systemDark ? 'dark' : 'light');

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setOverride(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }, [theme]);

  return { theme, toggle };
}
