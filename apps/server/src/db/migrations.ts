/**
 * Append-only: never edit a released migration, add a new one. `PRAGMA user_version`
 * stores how many have been applied. All timestamps are epoch milliseconds.
 */
export const MIGRATIONS: readonly string[] = [
  /* sql */ `
  CREATE TABLE persons (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    emoji       TEXT NOT NULL,
    color       TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  -- Only the HMAC of the owner and no original file name (R22, D15).
  CREATE TABLE submissions (
    id          TEXT PRIMARY KEY,
    owner_hash  TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL CHECK (kind IN ('html', 'pptx')),
    status      TEXT NOT NULL CHECK (status IN ('converting', 'ready', 'failed')),
    file_path   TEXT,
    error       TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );

  CREATE TABLE game (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    phase       TEXT NOT NULL,
    state_json  TEXT NOT NULL DEFAULT '{}',
    updated_at  INTEGER NOT NULL
  );
  INSERT INTO game (id, phase, state_json, updated_at) VALUES (1, 'lobby', '{}', 0);

  CREATE TABLE rounds (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    number             INTEGER NOT NULL UNIQUE,
    presenter_id       TEXT REFERENCES persons(id) ON DELETE SET NULL,
    submission_id      TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
    drawn_at           INTEGER NOT NULL,
    started_at         INTEGER,
    closed_at          INTEGER,
    countdown_ends_at  INTEGER,
    revealed_at        INTEGER,
    -- Plain-text owner, written only at reveal (D15).
    revealed_owner_id  TEXT REFERENCES persons(id) ON DELETE SET NULL
  );
  CREATE UNIQUE INDEX rounds_submission ON rounds(submission_id);

  CREATE TABLE votes (
    round_id         INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    voter_id         TEXT NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    guess_person_id  TEXT REFERENCES persons(id) ON DELETE SET NULL,
    stars            INTEGER CHECK (stars BETWEEN 1 AND 5),
    updated_at       INTEGER NOT NULL,
    PRIMARY KEY (round_id, voter_id)
  );

  CREATE TABLE settings (
    id                   INTEGER PRIMARY KEY CHECK (id = 1),
    submission_deadline  INTEGER,
    talk_time_limit_s    INTEGER NOT NULL DEFAULT 0,
    vote_countdown_s     INTEGER NOT NULL DEFAULT 20
  );
  INSERT INTO settings (id) VALUES (1);
  `,
  /* sql */ `
  -- Personal password (D25): scrypt hash, NULL until the person sets one.
  ALTER TABLE persons ADD COLUMN password_hash TEXT;

  -- Topic roulette (D26), keyed by the owner hash like submissions so a topic never
  -- names a person (R22). topic_index NULL = "Freies Thema" once all topics are taken.
  CREATE TABLE topic_assignments (
    owner_hash   TEXT PRIMARY KEY,
    topic_index  INTEGER,
    assigned_at  INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX topic_assignments_topic ON topic_assignments(topic_index) WHERE topic_index IS NOT NULL;
  `,
  /* sql */ `
  -- Self-registration (D27): names are unique regardless of case.
  CREATE UNIQUE INDEX persons_name_nocase ON persons(name COLLATE NOCASE);
  -- Photo file name inside DATA_DIR/avatars; NULL = emoji + color.
  ALTER TABLE persons ADD COLUMN photo_file TEXT;
  -- NULL = registration closed.
  ALTER TABLE settings ADD COLUMN invite_code TEXT;
  `,
  /* sql */ `
  -- Talk rating (R84), next to the slide stars.
  ALTER TABLE votes ADD COLUMN talk_stars INTEGER CHECK (talk_stars BETWEEN 1 AND 5);
  `,
];
