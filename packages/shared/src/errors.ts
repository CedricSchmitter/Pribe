export const ERROR_CODES = [
  'UNAUTHORIZED',
  'INVALID_PAYLOAD',
  'NOT_FOUND',
  'WRONG_PHASE',
  'UNKNOWN_PERSON',
  'NOT_IDENTIFIED',
  /** D17: for the chosen presenter only their own submission is left. */
  'ONLY_OWN_LEFT',
  'NO_SUBMISSIONS_LEFT',
  'ALREADY_PRESENTED',
  'VOTING_CLOSED',
  'INVALID_GUESS',
  'RATE_LIMITED',
  'UPLOADS_CLOSED',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'INTERNAL',
  'WRONG_PASSWORD',
  'PASSWORD_ALREADY_SET',
  'PASSWORD_NOT_SET',
  'INVALID_INVITE_CODE',
  'NAME_TAKEN',
  'UNSUPPORTED_IMAGE',
  'CANNOT_RATE_SELF',
  /** R87: too many wrong admin passwords from this IP; the message names the remaining time. */
  'LOGIN_LOCKED',
  'PROBE_ACTIVE',
  /** R90: guest switched off, without name or without a ready presentation. */
  'GUEST_NOT_READY',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_MESSAGES_DE: Record<ErrorCode, string> = {
  UNAUTHORIZED: 'Bitte zuerst anmelden.',
  INVALID_PAYLOAD: 'Ungültige Eingabe.',
  NOT_FOUND: 'Nicht gefunden.',
  WRONG_PHASE: 'Das geht gerade nicht.',
  UNKNOWN_PERSON: 'Diese Person gibt es nicht.',
  NOT_IDENTIFIED: 'Bitte zuerst deinen Namen wählen.',
  ONLY_OWN_LEFT: 'Jemand anderes muss ziehen.',
  NO_SUBMISSIONS_LEFT: 'Keine Präsentationen mehr im Pool.',
  ALREADY_PRESENTED: 'Diese Person hat schon präsentiert.',
  VOTING_CLOSED: 'Die Abstimmung ist geschlossen.',
  INVALID_GUESS: 'Ungültiger Tipp.',
  RATE_LIMITED: 'Nicht so schnell!',
  UPLOADS_CLOSED: 'Einsendeschluss ist vorbei.',
  FILE_TOO_LARGE: 'Die Datei ist zu groß.',
  UNSUPPORTED_FILE_TYPE: 'Nur .html, .htm oder .pptx.',
  INTERNAL: 'Da ist etwas schiefgelaufen.',
  WRONG_PASSWORD: 'Falsches Passwort.',
  PASSWORD_ALREADY_SET: 'Für diesen Namen gibt es schon ein Passwort.',
  PASSWORD_NOT_SET: 'Für diesen Namen gibt es noch kein Passwort.',
  INVALID_INVITE_CODE: 'Der Einladungscode stimmt nicht.',
  NAME_TAKEN: 'Diesen Namen gibt es schon.',
  UNSUPPORTED_IMAGE: 'Bitte ein Foto (JPEG, PNG oder WebP) bis 512 KB.',
  CANNOT_RATE_SELF: 'Den eigenen Vortrag bewertest du nicht 😉',
  LOGIN_LOCKED: 'Zu viele Fehlversuche. Bitte später erneut versuchen.',
  PROBE_ACTIVE: 'Gerade läuft ein Probelauf. Erst den Probelauf beenden.',
  GUEST_NOT_READY: 'Kein Überraschungsgast bereit (Admin → Überraschungsgast).',
};

/** Body of every non-2xx REST response and payload of failed socket acks. */
export interface ApiError {
  error: ErrorCode;
  message: string;
}

export type Ack<T = void> = ([T] extends [void] ? { ok: true } : { ok: true; data: T }) | ({ ok: false } & ApiError);

export function apiError(code: ErrorCode, message: string = ERROR_MESSAGES_DE[code]): ApiError {
  return { error: code, message };
}
