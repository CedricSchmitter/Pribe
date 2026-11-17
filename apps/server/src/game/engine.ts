import {
  API_PATHS,
  type CastVotePayload,
  type ErrorCode,
  type FinaleResult,
  type GamePhase,
  type HostRoundView,
  type HostSnapshot,
  type MyVote,
  type PersonId,
  type RevealResult,
  type SnapshotBase,
  type SubmissionId,
  type VoteRoundView,
  type VoteSnapshot,
  type WheelSpunEvent,
} from '@pribe/shared';
import { transaction, type Db, type Repositories, type RoundRecord, type SubmissionRecord } from '../db';
import { chooseForPresenter, chooseWheel, eligiblePresenters, isValidChoice, type DrawInput, type PoolItem, type Rng } from './draw';
import { computeFinale } from './finale';
import { computeLeaderboard, computeReveal, outcomeFor } from './scoring';

export type Result<T = void> = { ok: true; data: T } | { ok: false; error: ErrorCode };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (error: ErrorCode): { ok: false; error: ErrorCode } => ({ ok: false, error });

/** Persisted in `game.state_json`; everything else is derived from rounds and votes. */
export interface GameState {
  /** Wheel result (R42): presenter and a submission reserved for them. Never sent to clients. */
  wheel?: { presenterId: PersonId; submissionId: SubmissionId } | null;
}

const ROUND_PHASES: readonly GamePhase[] = ['drawing', 'presenting', 'countdown', 'reveal'];

export interface GameEngineDeps {
  db: Db;
  repos: Repositories;
  /** HMAC comparison (D05); see security/hmac.ts. */
  isOwner(personId: PersonId, ownerHash: string): boolean;
  rng?: Rng;
  /**
   * Called after every state change, including the countdown timer firing. `vote` changes
   * only touch the host's `votedPersonIds` and the voter's own `myVote`.
   */
  onChange?: (change: { kind: 'phase' } | { kind: 'vote'; voterId: PersonId }) => void;
}

/**
 * Game state machine (L5). All state lives in SQLite and is re-read on every call, so a
 * restart (or an admin reset) never leaves stale memory behind; only the countdown timer
 * is in memory and `resume()` re-arms it.
 */
export class GameEngine {
  private countdownTimer: NodeJS.Timeout | null = null;
  private readonly rng: Rng;

  constructor(private readonly deps: GameEngineDeps) {
    this.rng = deps.rng ?? Math.random;
  }

  private get repos() {
    return this.deps.repos;
  }

  phase(): GamePhase {
    return this.repos.game.get().phase;
  }

  private state(): GameState {
    return this.repos.game.get<GameState>().state;
  }

  private save(phase: GamePhase, state: GameState = this.state()): void {
    this.repos.game.save(phase, state);
  }

  private changed(): void {
    this.deps.onChange?.({ kind: 'phase' });
  }

  currentRound(): RoundRecord | null {
    return ROUND_PHASES.includes(this.phase()) ? this.repos.rounds.latest() : null;
  }

  private ownerOf(submission: SubmissionRecord): PersonId | null {
    return this.repos.persons.list().find((p) => this.deps.isOwner(p.id, submission.ownerHash))?.id ?? null;
  }

  private drawInput(): DrawInput {
    const personIds = this.repos.persons.list().map((p) => p.id);
    const presentCounts = new Map<PersonId, number>();
    for (const r of this.repos.rounds.list()) {
      if (r.presenterId) presentCounts.set(r.presenterId, (presentCounts.get(r.presenterId) ?? 0) + 1);
    }
    const pool: PoolItem[] = this.repos.submissions.listPool().map((s) => ({ id: s.id, ownerId: this.ownerOf(s) }));
    return { personIds, presentCounts, pool };
  }

  // ---- Host commands ----

  start(): Result {
    if (this.phase() !== 'lobby') return fail('WRONG_PHASE');
    this.save('choosePresenter', { wheel: null });
    this.changed();
    return ok(undefined);
  }

  spin(): Result<WheelSpunEvent> {
    if (this.phase() !== 'choosePresenter') return fail('WRONG_PHASE');
    const input = this.drawInput();
    const choice = chooseWheel(input, this.rng);
    if ('error' in choice) return fail(choice.error);
    this.save('choosePresenter', { wheel: choice });
    this.changed();
    return ok({ candidateIds: eligiblePresenters(input), presenterId: choice.presenterId });
  }

  draw(presenterId: PersonId): Result<{ roundId: number }> {
    if (this.phase() !== 'choosePresenter') return fail('WRONG_PHASE');
    const input = this.drawInput();
    const reserved = this.state().wheel;
    let choice =
      reserved && reserved.presenterId === presenterId && isValidChoice(input, reserved) ? reserved : null;
    if (!choice) {
      const picked = chooseForPresenter(input, presenterId, this.rng);
      if ('error' in picked) return fail(picked.error);
      choice = picked;
    }
    const round = transaction(this.deps.db, () => {
      const r = this.repos.rounds.create(choice);
      this.save('drawing', { wheel: null });
      return r;
    });
    this.changed();
    return ok({ roundId: round.id });
  }

  startRound(now = Date.now()): Result {
    const round = this.currentRound();
    if (this.phase() !== 'drawing' || !round) return fail('WRONG_PHASE');
    transaction(this.deps.db, () => {
      this.repos.rounds.update(round.id, { startedAt: now });
      this.save('presenting');
    });
    this.changed();
    return ok(undefined);
  }

  closeRound(now = Date.now()): Result {
    const round = this.currentRound();
    if (this.phase() !== 'presenting' || !round) return fail('WRONG_PHASE');
    const countdownEndsAt = now + this.repos.settings.get().voteCountdownS * 1000;
    transaction(this.deps.db, () => {
      this.repos.rounds.update(round.id, { closedAt: now, countdownEndsAt });
      this.save('countdown');
    });
    this.armCountdown(countdownEndsAt);
    this.changed();
    return ok(undefined);
  }

  /** Countdown over: write the owner in plain text (D15) and show the reveal. */
  reveal(now = Date.now()): Result {
    const round = this.currentRound();
    if (this.phase() !== 'countdown' || !round) return fail('WRONG_PHASE');
    const submission = this.repos.submissions.get(round.submissionId);
    const ownerId = submission ? this.ownerOf(submission) : null;
    transaction(this.deps.db, () => {
      this.repos.rounds.update(round.id, { revealedAt: now, revealedOwnerId: ownerId });
      this.save('reveal');
    });
    this.clearCountdown();
    this.changed();
    return ok(undefined);
  }

  next(): Result {
    if (this.phase() !== 'reveal') return fail('WRONG_PHASE');
    this.save('choosePresenter', { wheel: null });
    this.changed();
    return ok(undefined);
  }

  startFinale(): Result {
    const phase = this.phase();
    if (phase !== 'choosePresenter' && phase !== 'reveal') return fail('WRONG_PHASE');
    this.save('finale', { wheel: null });
    this.changed();
    return ok(undefined);
  }

  // ---- Phones ----

  /** The owner's vote is stored like any other; scoring ignores it (R52). */
  castVote(voterId: PersonId | null, payload: CastVotePayload, now = Date.now()): Result<MyVote> {
    if (!voterId) return fail('NOT_IDENTIFIED');
    if (!this.repos.persons.get(voterId)) return fail('UNKNOWN_PERSON');
    const phase = this.phase();
    const round = this.currentRound();
    if ((phase !== 'presenting' && phase !== 'countdown') || !round || round.id !== payload.roundId) {
      return fail('VOTING_CLOSED');
    }
    if (round.countdownEndsAt !== null && now >= round.countdownEndsAt) return fail('VOTING_CLOSED');
    if (payload.guessPersonId && !this.repos.persons.get(payload.guessPersonId)) return fail('INVALID_GUESS');
    const v = this.repos.votes.upsert({
      roundId: round.id,
      voterId,
      guessPersonId: payload.guessPersonId,
      stars: payload.stars,
    });
    this.deps.onChange?.({ kind: 'vote', voterId });
    return ok({ roundId: v.roundId, guessPersonId: v.guessPersonId, stars: v.stars });
  }

  // ---- Timers ----

  /** Re-arms a running countdown after a restart (R4). */
  resume(): void {
    const round = this.currentRound();
    if (this.phase() === 'countdown' && round?.countdownEndsAt != null) this.armCountdown(round.countdownEndsAt);
  }

  private armCountdown(endsAt: number): void {
    this.clearCountdown();
    this.countdownTimer = setTimeout(() => {
      // Runs outside any socket handler: an exception here would take the whole process down.
      try {
        this.reveal();
      } catch (err) {
        console.error('Auflösung nach dem Countdown fehlgeschlagen', err);
      }
    }, Math.max(0, endsAt - Date.now()));
  }

  private clearCountdown(): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
  }

  dispose(): void {
    this.clearCountdown();
  }

  // ---- Snapshots ----

  private revealResult(round: RoundRecord | null): RevealResult | null {
    if (this.phase() !== 'reveal' || !round || round.revealedAt === null) return null;
    return computeReveal(round, this.repos.votes.listForRound(round.id), round.revealedOwnerId ?? '');
  }

  finale(): FinaleResult | null {
    if (this.phase() !== 'finale') return null;
    const leaderboard = computeLeaderboard(
      this.repos.persons.list(),
      this.repos.rounds.list(),
      this.repos.votes.listAll(),
    );
    return { ...computeFinale(this.repos), leaderboard };
  }

  private base(now: number): SnapshotBase & { round: RoundRecord | null } {
    const settings = this.repos.settings.get();
    const rounds = this.repos.rounds.list();
    const round = this.currentRound();
    return {
      phase: this.phase(),
      serverTime: now,
      persons: this.repos.persons.list(),
      settings: { talkTimeLimitS: settings.talkTimeLimitS, voteCountdownS: settings.voteCountdownS },
      presentedPersonIds: rounds.map((r) => r.presenterId).filter((p): p is PersonId => p !== null),
      poolSize: this.repos.submissions.listPool().length,
      roundCount: rounds.length,
      reveal: this.revealResult(round),
      finale: this.finale(),
      round,
    };
  }

  private roundView(round: RoundRecord): VoteRoundView {
    const limit = this.repos.settings.get().talkTimeLimitS;
    return {
      id: round.id,
      number: round.number,
      presenterId: round.presenterId ?? '',
      startedAt: round.startedAt,
      timeLimitEndsAt: round.startedAt !== null && limit > 0 ? round.startedAt + limit * 1000 : null,
      closedAt: round.closedAt,
      countdownEndsAt: round.countdownEndsAt,
    };
  }

  hostSnapshot(connectedPersonIds: PersonId[], now = Date.now()): HostSnapshot {
    const { round, ...base } = this.base(now);
    let view: HostRoundView | null = null;
    if (round) {
      const submission = this.repos.submissions.get(round.submissionId);
      view = {
        ...this.roundView(round),
        submission: {
          id: round.submissionId,
          kind: submission?.kind ?? 'html',
          url: API_PATHS.file(round.submissionId),
        },
        votedPersonIds: this.repos.votes.listForRound(round.id).map((v) => v.voterId),
      };
    }
    return { ...base, role: 'host', connectedPersonIds, round: view };
  }

  voteSnapshot(me: PersonId | null, now = Date.now()): VoteSnapshot {
    const { round, ...base } = this.base(now);
    const vote = round && me ? this.repos.votes.get(round.id, me) : null;
    const myVote: MyVote | null = vote
      ? { roundId: vote.roundId, guessPersonId: vote.guessPersonId, stars: vote.stars }
      : null;
    return {
      ...base,
      role: 'vote',
      me,
      round: round ? this.roundView(round) : null,
      myVote,
      myOutcome: base.reveal && me ? outcomeFor(me, base.reveal.ownerId, myVote) : null,
    };
  }
}
