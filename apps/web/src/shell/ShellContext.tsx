import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/** Who is shown on the right of the header. */
export interface ShellAvatar {
  emoji: string;
  /** Person color (R5); any CSS color. */
  color: string;
  label: string;
}

interface ShellValue {
  hidden: boolean;
  setHidden(hidden: boolean): void;
  avatar: ShellAvatar | null;
  setAvatar(avatar: ShellAvatar | null): void;
}

const ShellContext = createContext<ShellValue | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const [avatar, setAvatar] = useState<ShellAvatar | null>(null);
  const value = useMemo(() => ({ hidden, setHidden, avatar, setAvatar }), [hidden, avatar]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell needs <ShellProvider>');
  return ctx;
}

/**
 * Hides header and navigation while `hidden` is true (e.g. `/host` during the show).
 * The page stays mounted; the shell reappears when the caller unmounts.
 */
export function useShellHidden(hidden: boolean): void {
  const { setHidden } = useShell();
  useEffect(() => {
    setHidden(hidden);
    return () => setHidden(false);
  }, [hidden, setHidden]);
}

/** Shows a person in the header (`/vote`, `/submit`); `null` shows nobody. Cleared on unmount. */
export function useShellAvatar(avatar: ShellAvatar | null): void {
  const { setAvatar } = useShell();
  const key = avatar ? `${avatar.emoji}|${avatar.color}|${avatar.label}` : '';
  useEffect(() => {
    setAvatar(avatar);
    return () => setAvatar(null);
    // Keyed on the content so callers may pass a fresh object every render.
  }, [key, setAvatar]);
}
