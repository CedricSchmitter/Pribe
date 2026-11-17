import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'unauthorized';

/** Creates the socket on mount, closes it on unmount and tracks its connection status. */
export function useSocket<S extends Socket>(factory: () => S, enabled = true) {
  const [socket, setSocket] = useState<S | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    if (!enabled) return;
    const s = factory();
    setSocket(s);
    setStatus('connecting');
    s.on('connect', () => setStatus('connected'));
    s.on('disconnect', () => setStatus('disconnected'));
    s.on('connect_error', (err) => setStatus(err.message === 'UNAUTHORIZED' ? 'unauthorized' : 'disconnected'));
    return () => {
      s.close();
      setSocket(null);
    };
    // The factory is expected to be a stable module-level function, so it is not a dependency.
  }, [enabled]);

  return { socket, status };
}
