import type { GameSettings, SettingsInput } from '@pribe/shared';
import type { Db } from '../database';

export function createSettingsRepo(db: Db) {
  const get = (): GameSettings => {
    const row = db
      .prepare('SELECT submission_deadline, talk_time_limit_s, vote_countdown_s, invite_code FROM settings WHERE id = 1')
      .get() as {
      submission_deadline: number | null;
      talk_time_limit_s: number;
      vote_countdown_s: number;
      invite_code: string | null;
    };
    return {
      submissionDeadline: row.submission_deadline,
      talkTimeLimitS: row.talk_time_limit_s,
      voteCountdownS: row.vote_countdown_s,
      inviteCode: row.invite_code,
    };
  };

  return {
    get,
    update(patch: SettingsInput): GameSettings {
      const next = { ...get(), ...patch };
      db.prepare(
        'UPDATE settings SET submission_deadline = ?, talk_time_limit_s = ?, vote_countdown_s = ?, invite_code = ? WHERE id = 1',
      ).run(next.submissionDeadline, next.talkTimeLimitS, next.voteCountdownS, next.inviteCode);
      return next;
    },
  };
}
export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
