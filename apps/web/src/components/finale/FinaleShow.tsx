import { useEffect, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AWARD_KINDS, AWARD_LABELS_DE, type AwardKind, type FinaleResult, type LeaderboardEntry, type Person, type PersonId } from '@pribe/shared';
import { AWARD_EMOJI, AWARD_NOBODY, FinaleAvatar, awardDetail, fireworks, statsOf } from './common';
import { emojiBurst, emojiRain, flash, shake, Spotlights, Sunburst } from '../../fx';
import { GuessNetwork } from './GuessNetwork';
import { PhotoWall } from './PhotoWall';
import './finale.css';

type Station =
  | { kind: 'intro' }
  | { kind: 'board' }
  | { kind: 'podium'; reveal: number }
  | { kind: 'award'; award: AwardKind }
  | { kind: 'network' }
  | { kind: 'best' }
  | { kind: 'wall' };

const STEP_KEY = 'pribe-finale-step';

function podiumGroups(board: LeaderboardEntry[]): LeaderboardEntry[][] {
  // Ranks are competition ranks, so ties put several people on one step.
  return [3, 2, 1].map((rank) => board.filter((e) => e.rank === rank)).filter((g) => g.length > 0);
}

function stationsFor(f: FinaleResult): Station[] {
  const groups = podiumGroups(f.leaderboard);
  return [
    { kind: 'intro' },
    ...(f.leaderboard.some((e) => e.rank > 3) ? [{ kind: 'board' } as const] : []),
    ...Array.from({ length: groups.length + 1 }, (_, reveal) => ({ kind: 'podium', reveal }) as const),
    ...AWARD_KINDS.map((award) => ({ kind: 'award', award }) as const),
    { kind: 'network' },
    { kind: 'best' },
    // Thank-you page with the photo wall (R86).
    { kind: 'wall' },
  ];
}

function readStep(): number {
  try {
    return Number(sessionStorage.getItem(STEP_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Host finale (R62–R65): the host clicks (or uses →/Space/clicker) through the stations. */
export function FinaleShow({ finale, persons }: { finale: FinaleResult; persons: Person[] }) {
  const stations = stationsFor(finale);
  const [step, setStep] = useState(() => Math.min(readStep(), stations.length - 1));
  const station = stations[Math.min(step, stations.length - 1)]!;
  const person = (id: PersonId | null | undefined) => persons.find((p) => p.id === id);

  useEffect(() => {
    try {
      sessionStorage.setItem(STEP_KEY, String(step));
    } catch {
      /* private mode: the finale just restarts on reload */
    }
  }, [step]);

  const next = () => setStep((s) => Math.min(s + 1, stations.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // A focused button already handles Space/Enter as a click.
      if ((e.key === ' ' || e.key === 'Enter') && (e.target as HTMLElement | null)?.closest?.('button')) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        next();
      } else if (['ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const key = station.kind === 'award' ? `award-${station.award}` : station.kind === 'podium' ? 'podium' : station.kind;

  return (
    <div className="host finale">
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          className="finale-station"
          initial={{ opacity: 0, scale: 0.6, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          // No blur: a full-screen filter on top of confetti stutters on the beamer laptop.
          exit={{ opacity: 0, scale: 1.4, rotate: 6 }}
          transition={{ type: 'spring', bounce: 0.4, duration: 0.7 }}
        >
          {station.kind === 'intro' && <Intro />}
          {station.kind === 'board' && <Board board={finale.leaderboard} person={person} />}
          {station.kind === 'podium' && <Podium board={finale.leaderboard} reveal={station.reveal} person={person} />}
          {station.kind === 'award' && <AwardReveal finale={finale} kind={station.award} person={person} />}
          {station.kind === 'network' && (
            <div className="finale-network-wrap">
              <h1 className="finale-title">🕸️ Das Tipp-Netz</h1>
              <p className="muted finale-sub">Wer hat wen wie oft getippt · grün leuchtet, was richtig war</p>
              {finale.guessNetwork.length === 0 ? <p className="finale-empty">Keine Tipps abgegeben 🙈</p> : <GuessNetwork persons={persons} edges={finale.guessNetwork} />}
            </div>
          )}
          {station.kind === 'best' && <Best finale={finale} person={person} />}
          {station.kind === 'wall' && <PhotoWall persons={persons} onRestart={() => setStep(0)} />}
        </motion.div>
      </AnimatePresence>
      <div className="finale-controls">
        <button type="button" onClick={back} disabled={step === 0} aria-label="Zurück">
          ⬅️
        </button>
        <span className="finale-progress">
          {step + 1} / {stations.length}
        </span>
        <button type="button" className="primary host-big-button" onClick={next} disabled={step >= stations.length - 1}>
          Weiter ➡️
        </button>
      </div>
    </div>
  );
}

function Intro() {
  return (
    <div className="finale-center">
      <motion.div
        className="finale-trophy"
        initial={{ y: -600, rotate: -540 }}
        animate={{ y: 0, rotate: 0, scale: [1, 1.15, 1] }}
        transition={{ type: 'spring', stiffness: 60, damping: 9, scale: { repeat: Infinity, duration: 1.4, delay: 1.5 } }}
      >
        🏆
      </motion.div>
      <motion.h1
        className="finale-hero"
        initial={{ letterSpacing: '2em', opacity: 0 }}
        animate={{ letterSpacing: '0.05em', opacity: 1 }}
        transition={{ delay: 0.6, duration: 1.2, ease: 'easeOut' }}
      >
        FINALE
      </motion.h1>
      <motion.p className="finale-sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}>
        Wer hat am besten geraten?
      </motion.p>
    </div>
  );
}

function Board({ board, person }: { board: LeaderboardEntry[]; person(id: PersonId): Person | undefined }) {
  const rest = board.filter((e) => e.rank > 3);
  const max = Math.max(1, ...board.map((e) => e.points));
  return (
    <div className="finale-board-wrap">
      <h1 className="finale-title">📋 Die Plätze ab {rest[0]?.rank}</h1>
      <ol className={`finale-board${rest.length > 8 ? ' two-cols' : ''}`} style={{ '--rows': Math.ceil(rest.length / 2) } as CSSProperties}>
        {rest.map((e, i) => {
          const p = person(e.personId);
          const delay = 0.4 + (rest.length - 1 - i) * 0.55;
          return (
            <motion.li
              key={e.personId}
              className="finale-board-row card"
              initial={{ opacity: 0, x: i % 2 ? 900 : -900, rotate: i % 2 ? 12 : -12 }}
              animate={{ opacity: 1, x: 0, rotate: 0 }}
              transition={{ delay, type: 'spring', bounce: 0.45 }}
            >
              <span className="finale-board-rank">{e.rank}.</span>
              <FinaleAvatar person={p} size={56} />
              <span className="finale-board-name">{p?.name ?? '?'}</span>
              <span className="finale-board-bar">
                <motion.span
                  style={{ background: p?.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${(e.points / max) * 100}%` }}
                  transition={{ delay: delay + 0.3, duration: 0.6 }}
                />
              </span>
              <span className="finale-board-points">{e.points}</span>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

const STEP_HEIGHT: Record<number, string> = { 1: '34vh', 2: '24vh', 3: '16vh' };
const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function Podium({ board, reveal, person }: { board: LeaderboardEntry[]; reveal: number; person(id: PersonId): Person | undefined }) {
  const groups = podiumGroups(board);
  const shown = groups.slice(0, reveal);
  const top = groups[groups.length - 1];
  const allShown = reveal >= groups.length && top !== undefined;

  useEffect(() => {
    if (reveal === 0) return;
    const group = groups[reveal - 1]!;
    const colors = group.map((e) => person(e.personId)?.color ?? '#ffd000');
    const emojis = group.map((e) => person(e.personId)?.emoji).filter((x): x is string => !!x);
    const isTop = group[0]!.rank === top?.[0]?.rank;
    if (isTop) fireworks([...colors, '#ffd000', '#ffffff'], 6000);
    else fireworks([...colors, '#ffffff'], 1200);
    // Land the avatars first, then hit.
    const timers = [
      setTimeout(() => {
        shake(isTop ? 30 : 14, isTop ? 800 : 450);
        if (isTop) flash('#ffd000', 500);
        emojiBurst(isTop ? [...emojis, '👑', '🏆'] : emojis, { x: 0.5, y: 0.45 }, isTop ? 60 : 25);
      }, 900),
    ];
    if (isTop) timers.push(setTimeout(() => emojiRain([...emojis, '👑'], 3500), 1500));
    return () => timers.forEach(clearTimeout);
    // One burst per newly revealed step.
  }, [reveal]);

  const slots = [2, 1, 3].map((rank) => ({ rank, group: shown.find((g) => g[0]!.rank === rank) }));

  return (
    <div className="finale-podium-wrap">
      {reveal === 0 && <Spotlights />}
      {allShown && <Sunburst color={person(top[0]!.personId)?.color ?? '#ffd000'} speedS={12} />}
      <h1 className="finale-title">{allShown ? '👑 Das Siegertreppchen' : reveal === 0 ? '🥁 Und auf dem Podest …' : '🥁 …'}</h1>
      <div className="finale-podium">
        {slots.map(({ rank, group }) => (
          <div key={rank} className={`finale-podium-slot rank-${rank}`}>
            <div className={`finale-podium-people${(group?.length ?? 0) > 2 ? ' dense' : ''}`}>
              <AnimatePresence>
                {group?.map((e, i) => {
                  const p = person(e.personId);
                  return (
                    <motion.div
                      key={e.personId}
                      className="finale-podium-person"
                      initial={{ y: -900, rotate: 720, scale: 0.2 }}
                      animate={{ y: 0, rotate: 0, scale: 1 }}
                      transition={{ delay: 0.3 + i * 0.25, type: 'spring', stiffness: 70, damping: 9 }}
                    >
                      {rank === 1 && (
                        <motion.span className="finale-crown" animate={{ y: [0, -14, 0], rotate: [-10, 10, -10] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                          👑
                        </motion.span>
                      )}
                      <FinaleAvatar person={p} size={group.length > 2 ? (rank === 1 ? 84 : 64) : rank === 1 ? 150 : 110} />
                      <span className="finale-podium-name">{p?.name}</span>
                      <span className="finale-podium-points">
                        {e.points} {e.points === 1 ? 'Punkt' : 'Punkte'}
                      </span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            <motion.div
              className="finale-podium-step"
              initial={{ height: 0 }}
              animate={{ height: STEP_HEIGHT[rank] }}
              transition={{ type: 'spring', stiffness: 60, damping: 12, delay: rank * 0.1 }}
            >
              <span>{MEDAL[rank]}</span>
              <span className="finale-podium-rank">{rank}</span>
            </motion.div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AwardReveal({ finale, kind, person }: { finale: FinaleResult; kind: AwardKind; person(id: PersonId): Person | undefined }) {
  const award = finale.awards.find((a) => a.kind === kind);
  const winners = award?.winners ?? [];
  const label = AWARD_LABELS_DE[kind];
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(true);
      if (winners.length) fireworks([...winners.map((id) => person(id)?.color ?? '#ffd000'), '#ffd000'], 1800);
    }, 2200);
    return () => clearTimeout(t);
  }, [kind]);

  return (
    <div className="finale-center finale-award">
      <motion.div
        className="finale-award-emoji"
        initial={{ scale: 0, rotate: -360 }}
        animate={open ? { scale: 1, rotate: 0, y: 0 } : { scale: [0, 1.4, 1.1, 1.3, 1.2], rotate: [0, 20, -20, 15, -15], y: 0 }}
        transition={open ? { type: 'spring' } : { duration: 2.1 }}
      >
        {AWARD_EMOJI[kind]}
      </motion.div>
      <motion.h1 className="finale-hero" initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
        {label.title}
      </motion.h1>
      <p className="finale-sub">{label.description}</p>
      <div className="finale-award-winners">
        {!open ? (
          <motion.span className="finale-drum" animate={{ x: [-10, 10, -10] }} transition={{ repeat: Infinity, duration: 0.15 }}>
            🥁
          </motion.span>
        ) : winners.length === 0 ? (
          <motion.p className="finale-empty" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.6 }}>
            {AWARD_NOBODY[kind]}
          </motion.p>
        ) : (
          winners.map((id, i) => {
            const p = person(id);
            return (
              <motion.div
                key={id}
                className="finale-award-winner"
                initial={{ scale: 0, y: 300, rotate: i % 2 ? 30 : -30 }}
                animate={{ scale: 1, y: 0, rotate: 0 }}
                transition={{ delay: i * 0.2, type: 'spring', bounce: 0.55 }}
              >
                <FinaleAvatar person={p} size={winners.length > 3 ? 100 : 160} />
                <span className="finale-podium-name">{p?.name}</span>
                <span className="muted">{awardDetail(kind, statsOf(finale, id))}</span>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stars({ avg }: { avg: number }) {
  return (
    <span className="finale-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.span
          key={i}
          initial={{ scale: 0, rotate: -180, y: -200 }}
          animate={{ scale: 1, rotate: 0, y: 0 }}
          transition={{ delay: 1 + i * 0.18, type: 'spring', stiffness: 220 }}
          style={{ opacity: avg >= i - 0.5 ? 1 : 0.2 }}
        >
          ⭐
        </motion.span>
      ))}
    </span>
  );
}

function Best({ finale, person }: { finale: FinaleResult; person(id: PersonId | null): Person | undefined }) {
  const best = finale.bestPresentations;
  useEffect(() => {
    if (best.length) fireworks(['#ffd000', '#ffffff', ...best.map((b) => person(b.ownerId)?.color ?? '#ffd000')], 3000);
  }, []);
  return (
    <div className="finale-center">
      <motion.div className="finale-award-emoji" animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1.6 }}>
        🌟
      </motion.div>
      <h1 className="finale-hero">Beste Präsentation</h1>
      {best.length === 0 ? (
        <p className="finale-empty">Es wurden keine Sterne vergeben 🤷</p>
      ) : (
        <div className="finale-best-list">
          {best.map((b, i) => {
            const owner = person(b.ownerId);
            const presenter = person(b.presenterId);
            const round = finale.rounds.find((r) => r.roundId === b.roundId);
            return (
              <motion.div
                key={b.roundId}
                className="finale-best card"
                initial={{ scale: 0, rotateY: 180 }}
                animate={{ scale: 1, rotateY: 0 }}
                transition={{ delay: 0.3 + i * 0.3, type: 'spring', bounce: 0.4 }}
              >
                <span className="label">Runde {round?.number ?? '?'}</span>
                <div className="finale-best-people">
                  <div className="finale-best-person">
                    <FinaleAvatar person={owner} size={130} />
                    <span className="finale-podium-name">{owner?.name ?? '?'}</span>
                    <span className="muted">hat eingereicht</span>
                  </div>
                  {presenter && presenter.id !== owner?.id && (
                    <div className="finale-best-person">
                      <FinaleAvatar person={presenter} size={90} />
                      <span className="finale-best-name">{presenter.name}</span>
                      <span className="muted">hat präsentiert</span>
                    </div>
                  )}
                </div>
                <Stars avg={b.avgStars} />
                <span className="finale-best-avg">
                  Ø {b.avgStars.toFixed(1)} <span className="muted">({b.ratingCount} Bewertungen)</span>
                </span>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
