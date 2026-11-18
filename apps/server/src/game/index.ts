import { randomUUID } from 'node:crypto';
import type { ZodType } from 'zod';
import {
  apiError,
  CastVotePayloadSchema,
  DrawPayloadSchema,
  FinaleStepPayloadSchema,
  IdentifyPayloadSchema,
  ReactionPayloadSchema,
  type Ack,
  type ErrorCode,
  type HostSnapshot,
  type PersonId,
  type ReactionEmoji,
  type VoteSnapshot,
} from '@pribe/shared';
import type { BotGame } from '../probe/bots';
import { createPersonSessions } from '../auth/person';
import type { AppContext } from '../context';
import { isOwner } from '../security/hmac';
import type { HostNamespace, VoteNamespace } from '../sockets';
import { GameEngine, type Result } from './engine';
import { createComboDetector } from './combo';
import { createThrottle } from './throttle';

export { GameEngine } from './engine';

/** Reactions per phone: burst of 5, then 2 per second. */
export const REACTION_THROTTLE = { capacity: 5, refillPerSecond: 2 };

function toAck<T>(res: Result<T>): Ack<T> {
  return (res.ok ? (res.data === undefined ? { ok: true } : { ok: true, data: res.data }) : { ok: false, ...apiError(res.error) }) as Ack<T>;
}

/** Socket handlers; acks are optional on the wire, so every handler tolerates a missing one. */
function safeAck<T = void>(ack: unknown): (res: Ack<T>) => void {
  return typeof ack === 'function' ? (ack as (res: Ack<T>) => void) : () => {};
}

function reject(ack: unknown, code: ErrorCode): void {
  safeAck(ack)({ ok: false, ...apiError(code) });
}

function parse<T>(schema: ZodType<T>, payload: unknown): T | null {
  const r = schema.safeParse(payload);
  return r.success ? r.data : null;
}

/**
 * Game state machine and socket handlers (P4). `host` only admits authenticated
 * sockets. Returns a cleanup function for timers.
 */
export function registerGame(
  ns: { host: HostNamespace; vote: VoteNamespace },
  ctx: AppContext,
): { dispose(): void; bots: BotGame } {
  const { host, vote } = ns;
  const reactions = createThrottle(REACTION_THROTTLE);
  const combos = createComboDetector({ newId: randomUUID });
  const personSessions = createPersonSessions(ctx.config.secret, ctx.repos.persons);
  const cookiePersonId = (socket: { handshake: { headers: { cookie?: string } } }) =>
    personSessions.fromCookieHeader(socket.handshake.headers.cookie)?.id ?? null;

  let botIds: PersonId[] = [];
  const changeListeners = new Set<() => void>();
  const notifyChange = () => {
    for (const l of changeListeners) l();
  };

  const connectedPersonIds = (): PersonId[] => {
    const ids = new Set<PersonId>(botIds);
    for (const s of vote.sockets.values()) if (s.data.personId) ids.add(s.data.personId);
    return [...ids];
  };

  // In memory on purpose: a server restart mid-finale just restarts the show at the intro.
  let finaleStep = 0;
  const hostSnapshot = (): HostSnapshot => {
    const snap = engine.hostSnapshot(connectedPersonIds());
    // The guest (R90) follows the last station, so going back from it lands there again.
    if (snap.phase !== 'finale' && snap.phase !== 'guest') finaleStep = 0;
    return { ...snap, finaleStep };
  };

  const broadcastHost = () => host.emit('state', hostSnapshot());
  const broadcastVote = () => {
    for (const s of vote.sockets.values()) s.emit('state', engine.voteSnapshot(s.data.personId));
  };
  const broadcast = () => {
    broadcastHost();
    broadcastVote();
  };

  const engine = new GameEngine({
    db: ctx.db,
    repos: ctx.repos,
    isOwner: (personId, hash) => isOwner(personId, hash, ctx.config.secret),
    probe: () => ctx.probe.active,
    onChange: (change) => {
      if (change.kind === 'phase') {
        broadcast();
        return notifyChange();
      }
      broadcastHost();
      for (const s of vote.sockets.values()) {
        if (s.data.personId === change.voterId) s.emit('state', engine.voteSnapshot(s.data.personId));
      }
    },
  });
  engine.resume();

  // A reset may have removed the round a countdown timer still points at.
  const onExternalChange = () => {
    engine.dispose();
    engine.resume();
    broadcast();
    notifyChange();
  };
  ctx.stateEvents.on('changed', onExternalChange);

  // Real phones are unknown to the test-run database and known again after it (R83).
  const onWorldSwitch = () => {
    for (const s of vote.sockets.values()) s.data.personId = cookiePersonId(s);
  };
  ctx.stateEvents.on('world', onWorldSwitch);

  // A guest PPTX turning ready changes `guestReady` on the host (R90).
  const offConversion = ctx.conversion.onStatusChange(() => broadcastHost());

  /** Shared by phones and test-run bots; `null` when the reaction went out. */
  const sendReaction = (throttleKey: string, personId: PersonId | null, emoji: ReactionEmoji): ErrorCode | null => {
    const phase = engine.phase();
    if (phase !== 'presenting' && phase !== 'countdown') return 'WRONG_PHASE';
    if (!reactions.take(throttleKey)) return 'RATE_LIMITED';
    const at = Date.now();
    host.emit('reaction', { id: randomUUID(), emoji, personId, at });
    const combo = combos.add(emoji, at);
    if (combo) host.emit('reaction:combo', combo);
    return null;
  };

  host.on('connection', (socket) => {
    const run = (fn: () => Result) => (ack: unknown) => safeAck(ack)(toAck(fn()));

    socket.on('state:request', (ack) => safeAck<HostSnapshot>(ack)({ ok: true, data: hostSnapshot() }));
    socket.on('game:start', run(() => engine.start()));
    socket.on('presenter:spin', (ack) => {
      const res = engine.spin();
      if (res.ok) host.emit('wheel:spun', res.data);
      safeAck(ack)(toAck(res));
    });
    socket.on('round:draw', (payload, ack) => {
      const p = parse(DrawPayloadSchema, payload);
      if (!p) return reject(ack, 'INVALID_PAYLOAD');
      const res = engine.draw(p.presenterId);
      safeAck(ack)(toAck(res.ok ? { ok: true, data: undefined } : res));
    });
    socket.on('round:start', run(() => engine.startRound()));
    socket.on('round:close', run(() => engine.closeRound()));
    socket.on('round:next', run(() => engine.next()));
    socket.on('finale:start', run(() => engine.startFinale()));
    socket.on('guest:start', run(() => engine.startGuest()));
    socket.on('guest:present', run(() => engine.presentGuest()));
    socket.on('guest:back', run(() => engine.leaveGuest()));
    socket.on('finale:step', (payload, ack) => {
      const p = parse(FinaleStepPayloadSchema, payload);
      if (!p) return reject(ack, 'INVALID_PAYLOAD');
      if (engine.phase() !== 'finale') return reject(ack, 'WRONG_PHASE');
      finaleStep = p.step;
      broadcastHost();
      safeAck(ack)({ ok: true });
    });

    socket.emit('state', hostSnapshot());
  });

  vote.on('connection', (socket) => {
    // D25: the identity comes from the personal login cookie, never from a picked name.
    socket.data.personId = cookiePersonId(socket);
    if (socket.data.personId) broadcastHost();

    socket.on('state:request', (ack) => safeAck<VoteSnapshot>(ack)({ ok: true, data: engine.voteSnapshot(socket.data.personId) }));

    socket.on('vote:identify', (payload, ack) => {
      const p = parse(IdentifyPayloadSchema, payload);
      if (!p) return reject(ack, 'INVALID_PAYLOAD');
      if (p.personId && !ctx.repos.persons.get(p.personId)) return reject(ack, 'UNKNOWN_PERSON');
      if (p.personId && p.personId !== cookiePersonId(socket)) return reject(ack, 'NOT_IDENTIFIED');
      socket.data.personId = p.personId;
      safeAck(ack)({ ok: true });
      socket.emit('state', engine.voteSnapshot(socket.data.personId));
      broadcastHost();
    });

    socket.on('vote:cast', (payload, ack) => {
      const p = parse(CastVotePayloadSchema, payload);
      if (!p) return reject(ack, 'INVALID_PAYLOAD');
      safeAck(ack)(toAck(engine.castVote(socket.data.personId, p)));
    });

    socket.on('reaction:send', (payload, ack) => {
      const p = parse(ReactionPayloadSchema, payload);
      if (!p) return reject(ack, 'INVALID_PAYLOAD');
      const error = sendReaction(socket.id, socket.data.personId, p.emoji);
      if (error) return reject(ack, error);
      safeAck(ack)({ ok: true });
    });

    socket.on('disconnect', () => {
      reactions.forget(socket.id);
      if (socket.data.personId) broadcastHost();
    });

    socket.emit('state', engine.voteSnapshot(socket.data.personId));
  });

  const bots: BotGame = {
    setBotIds(ids) {
      botIds = ids;
      broadcastHost();
    },
    snapshot: () => engine.voteSnapshot(null),
    castVote(personId, payload) {
      engine.castVote(personId, payload);
    },
    react(personId, emoji) {
      sendReaction(`bot:${personId}`, personId, emoji);
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
  };

  return {
    bots,
    dispose() {
      ctx.stateEvents.off('changed', onExternalChange);
      ctx.stateEvents.off('world', onWorldSwitch);
      offConversion();
      changeListeners.clear();
      engine.dispose();
    },
  };
}
