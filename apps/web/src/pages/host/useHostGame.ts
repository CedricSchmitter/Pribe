import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ack, ComboEvent, HostSnapshot, Person, PersonId, ReactionEvent, WheelSpunEvent } from '@pribe/shared';
import { createHostSocket } from '../../lib/socket';
import { useSocket } from '../../lib/useSocket';

export type HostCommand = 'game:start' | 'presenter:spin' | 'round:start' | 'round:close' | 'round:next' | 'finale:start';

export interface HostGame {
  snapshot: HostSnapshot | null;
  status: ReturnType<typeof useSocket>['status'];
  /** Server clock estimate, for countdowns. */
  now(): number;
  person(id: PersonId | null | undefined): Person | undefined;
  reactions: ReactionEvent[];
  /** Running emoji combo (R85); cleared a moment after its last update. */
  combo: ComboEvent | null;
  wheel: WheelSpunEvent | null;
  clearWheel(): void;
  command(name: HostCommand): Promise<Ack<unknown>>;
  draw(presenterId: PersonId): Promise<Ack<unknown>>;
}

const REACTION_TTL_MS = 4500;
const COMBO_HOLD_MS = 2500;

export function useHostGame(enabled: boolean): HostGame {
  const { socket, status } = useSocket(createHostSocket, enabled);
  const [snapshot, setSnapshot] = useState<HostSnapshot | null>(null);
  const [reactions, setReactions] = useState<ReactionEvent[]>([]);
  const [wheel, setWheel] = useState<WheelSpunEvent | null>(null);
  const [combo, setCombo] = useState<ComboEvent | null>(null);
  const comboTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const offset = useRef(0);

  useEffect(() => {
    if (!socket) return;
    const onState = (s: HostSnapshot) => {
      offset.current = s.serverTime - Date.now();
      setSnapshot(s);
    };
    const onReaction = (r: ReactionEvent) => {
      setReactions((list) => [...list.slice(-60), r]);
      setTimeout(() => setReactions((list) => list.filter((x) => x.id !== r.id)), REACTION_TTL_MS);
    };
    const onCombo = (e: ComboEvent) => {
      setCombo(e);
      clearTimeout(comboTimer.current);
      comboTimer.current = setTimeout(() => setCombo(null), COMBO_HOLD_MS);
    };
    socket.on('state', onState);
    socket.on('reaction', onReaction);
    socket.on('reaction:combo', onCombo);
    socket.on('wheel:spun', setWheel);
    return () => {
      socket.off('state', onState);
      socket.off('reaction', onReaction);
      socket.off('reaction:combo', onCombo);
      clearTimeout(comboTimer.current);
      socket.off('wheel:spun', setWheel);
    };
  }, [socket]);

  const now = useCallback(() => Date.now() + offset.current, []);
  const person = useCallback((id: PersonId | null | undefined) => snapshot?.persons.find((p) => p.id === id), [snapshot]);

  const command = useCallback(
    (name: HostCommand) =>
      new Promise<Ack<unknown>>((resolve) => {
        if (!socket) return resolve({ ok: false, error: 'INTERNAL', message: 'Keine Verbindung.' });
        (socket.emit as (ev: string, ack: (res: Ack<unknown>) => void) => void)(name, resolve);
      }),
    [socket],
  );

  const draw = useCallback(
    (presenterId: PersonId) =>
      new Promise<Ack<unknown>>((resolve) => {
        if (!socket) return resolve({ ok: false, error: 'INTERNAL', message: 'Keine Verbindung.' });
        socket.emit('round:draw', { presenterId }, resolve as (res: Ack) => void);
      }),
    [socket],
  );

  return { snapshot, status, now, person, reactions, combo, wheel, clearWheel: () => setWheel(null), command, draw };
}

/** Re-renders at `fps` while mounted; for countdowns and the time bar. */
export function useTicker(fps = 10): void {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);
}
