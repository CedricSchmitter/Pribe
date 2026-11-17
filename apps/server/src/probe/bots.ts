import { REACTION_EMOJIS, STARS_MAX, type CastVotePayload, type PersonId, type ReactionEmoji, type VoteSnapshot } from '@pribe/shared';

/** What the bots may do; the game module implements it with the same checks a phone gets. */
export interface BotGame {
  /** Bots count as connected phones (lobby, vote progress). */
  setBotIds(ids: PersonId[]): void;
  snapshot(): VoteSnapshot;
  castVote(personId: PersonId, payload: CastVotePayload): void;
  react(personId: PersonId, emoji: ReactionEmoji): void;
  /** Called after every phase change and external state change. */
  onChange(listener: () => void): () => void;
}

export const BOT_PROFILES = [
  { name: 'Robo-Rita', emoji: '🤖', color: '#ff5a5f' },
  { name: 'Byte-Bernd', emoji: '👾', color: '#3da9fc' },
  { name: 'Pixel-Paula', emoji: '🦄', color: '#d946ef' },
  { name: 'Klick-Klaus', emoji: '🐙', color: '#2fd18b' },
  { name: 'Chip-Charlotte', emoji: '🦊', color: '#ff8a3d' },
] as const;

export interface BotOptions {
  rng?: () => number;
  /** Multiplies every delay; tests pass a small value. */
  timeScale?: number;
}

/** Joins the lobby one by one, then votes, rates and reacts in every round. */
export function startBots(game: BotGame, botIds: PersonId[], opts: BotOptions = {}): { stop(): void } {
  const rng = opts.rng ?? Math.random;
  const scale = opts.timeScale ?? 1;
  const timers = new Set<NodeJS.Timeout>();
  let stopped = false;

  const between = (min: number, max: number) => min + rng() * (max - min);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)]!;
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (stopped) return;
      // Timer callbacks run outside any request: a throw here would end the process.
      try {
        fn();
      } catch (err) {
        console.warn('[probe] bot action failed', err);
      }
    }, ms * scale);
    timers.add(t);
  };

  const joined: PersonId[] = [];
  botIds.forEach((id, i) => {
    later(600 + i * 900 + between(0, 400), () => {
      joined.push(id);
      game.setBotIds([...joined]);
    });
  });

  const vote = (bot: PersonId, roundId: number) => {
    const s = game.snapshot();
    const round = s.round;
    if (!round || round.id !== roundId) return;
    const others = s.persons.filter((p) => p.id !== bot);
    game.castVote(bot, {
      roundId,
      guessPersonId: others.length ? pick(others).id : null,
      stars: Math.round(between(2, STARS_MAX)),
      talkStars: bot === round.presenterId ? null : Math.round(between(2, STARS_MAX)),
    });
  };

  const planRound = (roundId: number) => {
    for (const bot of botIds) {
      later(between(1500, 7000), () => vote(bot, roundId));
      if (rng() < 0.3) later(between(8000, 14000), () => vote(bot, roundId));
    }
    for (let i = 0; i < 8; i++) later(between(1000, 20000), () => game.react(pick(botIds), pick(REACTION_EMOJIS)));
    // All bots send the same emoji within a second: enough for the combo effect (R85).
    later(between(3000, 6000), () => {
      const emoji = pick(REACTION_EMOJIS);
      botIds.forEach((bot, i) => later(i * 150, () => game.react(bot, emoji)));
    });
  };

  let plannedRound: number | null = null;
  const unsubscribe = game.onChange(() => {
    const s = game.snapshot();
    if (s.phase === 'presenting' && s.round && s.round.id !== plannedRound) {
      plannedRound = s.round.id;
      planRound(s.round.id);
    }
  });

  return {
    stop() {
      stopped = true;
      unsubscribe();
      for (const t of timers) clearTimeout(t);
      timers.clear();
      game.setBotIds([]);
    },
  };
}
