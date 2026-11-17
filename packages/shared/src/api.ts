import type { EpochMs, GameSettings, Person, SubmissionId, SubmissionKind, SubmissionStatus } from './domain';

export const API_PATHS = {
  health: '/api/health',
  auth: {
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    me: '/api/auth/me',
  },
  /** Everything below `/api/admin` requires the admin session (P2). */
  admin: {
    prefix: '/api/admin',
    persons: '/api/admin/persons',
    person: (id: string) => `/api/admin/persons/${encodeURIComponent(id)}`,
    /** POST: clears the person's password; they set a new one on their next visit (D25). */
    personPasswordReset: (id: string) => `/api/admin/persons/${encodeURIComponent(id)}/password-reset`,
    /** DELETE: removes the person's photo; emoji + color remain. */
    personPhoto: (id: string) => `/api/admin/persons/${encodeURIComponent(id)}/photo`,
    settings: '/api/admin/settings',
    submissions: '/api/admin/submissions',
    /** POST: game reset (R88) — rounds, votes and game state; persons, submissions and topics stay. */
    reset: '/api/admin/reset',
    /** POST: frees all 18 topics (R88). */
    resetTopics: '/api/admin/reset/topics',
    /** POST `ResetAllRequest`: deletes everything except the settings (R88, D30). */
    resetAll: '/api/admin/reset/all',
  },
  /** Open endpoints for phones (P2). */
  persons: '/api/persons',
  submit: {
    prefix: '/api/submit',
    status: '/api/submit/status',
    upload: '/api/submit/upload',
    submission: (id: SubmissionId) => `/api/submit/submissions/${encodeURIComponent(id)}`,
    /** GET: the logged-in person's own submission (`SubmissionStatusDto`), 404 without one. */
    mine: '/api/submit/mine',
    /** GET: `SubmissionPreviewDto` of the own ready submission (R81), 404 otherwise. */
    minePreview: '/api/submit/mine/preview',
    /** GET: the own ready HTML file, sandboxed via CSP (D04); 404 for PPTX. */
    mineFile: '/api/submit/mine/file',
    /** GET: `TopicResponseDto` for the logged-in person. */
    topic: '/api/submit/topic',
    /** POST: assigns a topic once (D26); later calls return the same one. */
    topicSpin: '/api/submit/topic/spin',
  },
  /**
   * Personal login for `/submit` and `/vote` (D25). Sets the `PERSON_COOKIE_NAME` cookie,
   * which the `/vote` socket reads at the handshake.
   */
  person: {
    /** GET: `PersonAuthStatusDto` — has this person set a password yet? */
    status: (id: string) => `/api/person/${encodeURIComponent(id)}/status`,
    /** POST `PersonCredentialsRequest`: first visit only, logs in right away. */
    setPassword: '/api/person/password',
    /** POST `PersonCredentialsRequest` */
    login: '/api/person/login',
    logout: '/api/person/logout',
    /** GET: `PersonMeDto` */
    me: '/api/person/me',
    /** POST `RegisterRequest` with the invite code (D27); logs in right away. */
    register: '/api/person/register',
    /** PUT multipart field `photo` (own photo), DELETE removes it; both return `PersonMeDto`. */
    photo: '/api/person/photo',
  },
  /** Public photo files, referenced by `Person.photoUrl`. */
  avatars: '/api/avatars',
  /** Presentation files (P3). */
  file: (id: SubmissionId) => `/api/files/${encodeURIComponent(id)}`,
  /** Beamer info (P5), admin session required. */
  hostInfo: '/api/host/info',
} as const;

/** Lobby QR target (R40): `PUBLIC_URL/vote?code=…`, or plain `/vote` while registration is closed (D27). */
export interface HostInfoDto {
  voteUrl: string;
  /** `false` when no invite code is set: newcomers cannot register via the QR code. */
  registrationOpen: boolean;
}

/** Client SPA routes served with the index.html fallback. */
export const CLIENT_ROUTES = ['/admin', '/submit', '/host', '/vote', '/remote'] as const;

export const SESSION_COOKIE_NAME = 'pribe_session';
/** Personal session (D25), separate from the admin cookie (D20). */
export const PERSON_COOKIE_NAME = 'pribe_person';

export interface PersonAuthStatusDto {
  hasPassword: boolean;
}

export interface PersonMeDto {
  person: Person | null;
}

/** Admin list row; the password itself never leaves the server. */
export interface AdminPersonDto extends Person {
  hasPassword: boolean;
}

/** `index` into `TOPICS`, or `null` for "Freies Thema" once all are taken (D26). */
export interface TopicDto {
  index: number | null;
  title: string;
}

export interface TopicResponseDto {
  topic: TopicDto | null;
}

export interface HealthResponse {
  status: 'ok';
  uptimeS: number;
}

export interface AuthStatusDto {
  authenticated: boolean;
}

export type SettingsDto = GameSettings;

/** GET `API_PATHS.admin.settings`: settings plus `PUBLIC_URL` for invite links and the lobby QR. */
export interface AdminSettingsDto extends SettingsDto {
  publicUrl: string;
}

/** `PUBLIC_URL/vote?code=…` or `/submit?code=…` (D27). */
export function inviteLink(publicUrl: string, path: '/vote' | '/submit', code: string): string {
  return `${publicUrl}${path}?code=${encodeURIComponent(code)}`;
}

/** Multipart field name of the photo upload. */
export const PHOTO_FIELD = 'photo';

/**
 * Admin overview row — deliberately without any owner information and without upload
 * timestamps, which would let the admin match uploads to people (R13, R22).
 */
export interface SubmissionOverviewItem {
  id: SubmissionId;
  kind: SubmissionKind;
  status: SubmissionStatus;
}

/** Deleted row counts of a reset (R88); fields a reset does not touch are 0. */
export interface ResetResponseDto {
  rounds: number;
  topics: number;
  submissions: number;
  persons: number;
}

/** Multipart field name of the upload; the uploader comes from the person cookie. */
export const UPLOAD_FIELDS = { file: 'file' } as const;

export interface SubmissionOverviewDto {
  total: number;
  byStatus: Record<SubmissionStatus, number>;
  items: SubmissionOverviewItem[];
}

export interface SubmitStatusDto {
  deadline: EpochMs | null;
  uploadsOpen: boolean;
  /** "x Präsentationen im Pool" (R23). */
  submissionCount: number;
  maxUploadMb: number;
  serverTime: EpochMs;
}

/** Own-submission preview on `/submit` (R81); carries nothing that identifies the person. */
export type SubmissionPreviewDto =
  | { kind: 'html' }
  | { kind: 'pptx'; slideCount: number; firstSlideTitle: string | null };

/** Returned by the upload; the phone keeps `submissionId` to poll its status (R24). */
export interface SubmissionStatusDto {
  submissionId: SubmissionId;
  kind: SubmissionKind;
  status: SubmissionStatus;
  error: string | null;
}
