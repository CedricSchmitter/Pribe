import { AnimatePresence, m as motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { STARS_MAX, type MyVote, type Person, type PersonId, type ReactionEmoji, type VoteRoundView } from '@pribe/shared';
import { emojiBurst } from '../../fx';
import { useToast } from '../../shell';
import { Avatar } from './Avatar';
import { Reactions } from './Reactions';
import type { CastResult } from './useVoteGame';

interface Props {
  me: Person;
  persons: Person[];
  round: VoteRoundView;
  inCountdown: boolean;
  myVote: MyVote | null;
  clockOffset: number;
  cast(payload: { roundId: number; guessPersonId?: PersonId | null; stars?: number | null; talkStars?: number | null }): Promise<CastResult>;
  react(emoji: ReactionEmoji): Promise<CastResult & { rateLimited?: boolean }>;
}

function useServerNow(clockOffset: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(t);
  }, []);
  return Date.now() + clockOffset;
}

/**
 * R51/R52: guess + stars, changeable until the countdown ends. Identical for everyone,
 * the owner included — nothing here may depend on who submitted the presentation.
 */
export function VotingPanel({ me, persons, round, inCountdown, myVote, clockOffset, cast, react }: Props) {
  const toast = useToast();
  const remote = myVote?.roundId === round.id ? myVote : null;
  const [guess, setGuess] = useState<PersonId | null>(remote?.guessPersonId ?? null);
  const [stars, setStars] = useState<number | null>(remote?.stars ?? null);
  const [talkStars, setTalkStars] = useState<number | null>(remote?.talkStars ?? null);
  // Who presents is public anyway, so locking their own talk stars reveals nothing (R84).
  const presenting = me.id === round.presenterId;

  // Server state wins after reconnects or a vote from a second tab.
  useEffect(() => {
    setGuess(remote?.guessPersonId ?? null);
    setStars(remote?.stars ?? null);
    setTalkStars(remote?.talkStars ?? null);
  }, [round.id, remote?.guessPersonId, remote?.stars, remote?.talkStars]);

  const now = useServerNow(clockOffset);
  const total = round.countdownEndsAt && round.closedAt ? round.countdownEndsAt - round.closedAt : 1;
  const remainingMs = inCountdown && round.countdownEndsAt ? Math.max(0, round.countdownEndsAt - now) : null;
  const closed = remainingMs === 0;

  const candidates = persons.filter((p) => p.id !== me.id && p.id !== round.presenterId);

  const pickGuess = async (id: PersonId) => {
    if (closed) return;
    const prev = guess;
    const next = id === guess ? null : id;
    setGuess(next);
    const picked = persons.find((p) => p.id === next);
    if (picked) emojiBurst([picked.emoji], { x: 0.5, y: 0.35 }, 12);
    const res = await cast({ roundId: round.id, guessPersonId: next });
    if (!res.ok) {
      setGuess(prev);
      toast(res.message, 'error');
    }
  };

  const pickStars = async (n: number) => {
    if (closed) return;
    const prev = stars;
    setStars(n);
    if (n === STARS_MAX) emojiBurst(['⭐', '🌟'], { x: 0.5, y: 0.25 }, 20);
    else if (n === 1) emojiBurst(['💩'], { x: 0.5, y: 0.25 }, 8);
    const res = await cast({ roundId: round.id, stars: n });
    if (!res.ok) {
      setStars(prev);
      toast(res.message, 'error');
    }
  };

  const pickTalkStars = async (n: number) => {
    if (closed || presenting) return;
    const prev = talkStars;
    setTalkStars(n);
    if (n === STARS_MAX) emojiBurst(['🎤', '🔥'], { x: 0.5, y: 0.35 }, 20);
    else if (n === 1) emojiBurst(['😴'], { x: 0.5, y: 0.35 }, 8);
    const res = await cast({ roundId: round.id, talkStars: n });
    if (!res.ok) {
      setTalkStars(prev);
      toast(res.message, 'error');
    }
  };

  const guessed = persons.find((p) => p.id === guess);

  return (
    <div className="vote-page vote-voting stack">
      <Timer remainingMs={remainingMs} total={total} roundNumber={round.number} />

      <StarsSection title="WIE SIND DIE FOLIEN?" label="Folien bewerten" stars={stars} closed={closed} onPick={(n) => void pickStars(n)} />

      {presenting ? (
        <section className="stack-tight vote-talk-self" aria-label="Vortrag bewerten">
          <h2 className="label vote-section-title">WIE WAR DER VORTRAG?</h2>
          <p className="muted">🎤 Das ist dein Vortrag – den bewerten die anderen.</p>
        </section>
      ) : (
        <StarsSection title="WIE WAR DER VORTRAG?" label="Vortrag bewerten" stars={talkStars} closed={closed} onPick={(n) => void pickTalkStars(n)} />
      )}

      <section className="stack-tight" aria-label="Dein Tipp">
        <h2 className="label vote-section-title">WER HAT DIE EINGEREICHT?</h2>
        <AnimatePresence mode="wait">
          <motion.p
            key={guess ?? 'none'}
            className="vote-guess-line"
            initial={{ scale: 0.4, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.7 }}
          >
            {guessed ? (
              <>
                Dein Tipp: <strong>{guessed.name}</strong> {guessed.emoji}
              </>
            ) : (
              <span className="muted">Noch kein Tipp</span>
            )}
          </motion.p>
        </AnimatePresence>
        <ul className="vote-list" role="list">
          {candidates.map((p) => (
            <li key={p.id}>
              <motion.button
                type="button"
                className={`vote-person${p.id === guess ? ' selected' : ''}`}
                onClick={() => void pickGuess(p.id)}
                disabled={closed}
                aria-pressed={p.id === guess}
                whileTap={{ scale: 0.9 }}
                animate={p.id === guess ? { scale: [1, 1.06, 1] } : { scale: 1 }}
              >
                <Avatar person={p} />
                <span className="vote-person-name">{p.name}</span>
                {p.id === guess && (
                  <motion.span className="vote-check" initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', bounce: 0.6 }}>
                    ✓
                  </motion.span>
                )}
              </motion.button>
            </li>
          ))}
        </ul>
      </section>

      {closed ? (
        <motion.p className="vote-closed" initial={{ scale: 3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
          🔒 Abstimmung geschlossen – gleich kommt die Auflösung!
        </motion.p>
      ) : (
        <Reactions onSend={react} />
      )}
    </div>
  );
}

function StarsSection({ title, label, stars, closed, onPick }: { title: string; label: string; stars: number | null; closed: boolean; onPick(n: number): void }) {
  return (
    <section className="stack-tight" aria-label={label}>
      <h2 className="label vote-section-title">{title}</h2>
      <div className="vote-stars" role="radiogroup" aria-label={`Sterne: ${label}`}>
        {Array.from({ length: STARS_MAX }, (_, i) => i + 1).map((n) => (
          <motion.button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`}
            className={`vote-star${stars !== null && n <= stars ? ' on' : ''}`}
            onClick={() => onPick(n)}
            disabled={closed}
            whileTap={{ scale: 1.6, rotate: 72 }}
            animate={stars !== null && n <= stars ? { scale: [1, 1.35, 1], rotate: [0, 20, 0] } : { scale: 1 }}
            transition={{ delay: (n - 1) * 0.05 }}
          >
            ★
          </motion.button>
        ))}
      </div>
    </section>
  );
}

function Timer({ remainingMs, total, roundNumber }: { remainingMs: number | null; total: number; roundNumber: number }) {
  if (remainingMs === null) {
    return (
      <div className="vote-timer">
        <span className="label">RUNDE {roundNumber}</span>
        <motion.span className="vote-live" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
          ● Abstimmung offen
        </motion.span>
      </div>
    );
  }
  const s = Math.ceil(remainingMs / 1000);
  const urgent = s <= 5;
  return (
    <div className={`vote-timer countdown${urgent ? ' urgent' : ''}`} role="timer" aria-live="off">
      <span className="label">NOCH</span>
      <motion.span key={s} className="vote-seconds" initial={{ scale: urgent ? 2.2 : 1.5, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.6 }}>
        {s}
      </motion.span>
      <span className="label">SEK</span>
      <div className="vote-timer-bar">
        <div className="vote-timer-fill" style={{ width: `${Math.min(100, (remainingMs / total) * 100)}%` }} />
      </div>
    </div>
  );
}
