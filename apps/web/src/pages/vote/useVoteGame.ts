import { useCallback, useEffect, useState } from 'react';
import type { Ack, CastVotePayload, MyVote, ReactionEmoji, VoteSnapshot } from '@pribe/shared';
import { createVoteSocket } from '../../lib/socket';
import { useSocket } from '../../lib/useSocket';

export type CastResult = { ok: true } | { ok: false; message: string };

/** Live game state for one phone. The server takes the identity from the person cookie (D25). */
export function useVoteGame() {
  const { socket, status } = useSocket(createVoteSocket);
  const [snapshot, setSnapshot] = useState<VoteSnapshot | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  useEffect(() => {
    if (!socket) return;
    const onState = (s: VoteSnapshot) => {
      setSnapshot(s);
      setClockOffset(s.serverTime - Date.now());
    };
    socket.on('state', onState);
    return () => {
      socket.off('state', onState);
    };
  }, [socket]);

  /** The cookie is only read in the handshake, so a login or logout needs a fresh connection. */
  const reconnect = useCallback(() => {
    socket?.disconnect().connect();
  }, [socket]);

  const cast = useCallback(
    (payload: CastVotePayload) =>
      new Promise<CastResult>((resolve) => {
        if (!socket?.connected) return resolve({ ok: false, message: 'Keine Verbindung.' });
        socket.timeout(5000).emit('vote:cast', payload, (err: Error | null, res: Ack<MyVote>) => {
          if (err) return resolve({ ok: false, message: 'Keine Antwort vom Server.' });
          resolve(res.ok ? { ok: true } : { ok: false, message: res.message });
        });
      }),
    [socket],
  );

  const react = useCallback(
    (emoji: ReactionEmoji) =>
      new Promise<CastResult & { rateLimited?: boolean }>((resolve) => {
        if (!socket?.connected) return resolve({ ok: false, message: 'Keine Verbindung.' });
        socket.emit('reaction:send', { emoji }, (res) =>
          resolve(res.ok ? { ok: true } : { ok: false, message: res.message, rateLimited: res.error === 'RATE_LIMITED' }),
        );
      }),
    [socket],
  );

  return { status, snapshot, cast, react, reconnect, clockOffset };
}
