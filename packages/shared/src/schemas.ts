import { z } from 'zod';
import { REACTION_EMOJIS, STARS_MAX, STARS_MIN } from './domain';

export const PersonIdSchema = z.string().min(1).max(64);

export const PersonInputSchema = z.object({
  name: z.string().trim().min(1).max(40),
  emoji: z.string().trim().min(1).max(16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Farbe als #rrggbb'),
});
export type PersonInput = z.infer<typeof PersonInputSchema>;

export const INVITE_CODE_MIN = 4;

export const SettingsInputSchema = z
  .object({
    submissionDeadline: z.number().int().nonnegative().nullable(),
    talkTimeLimitS: z.number().int().min(0).max(3600),
    voteCountdownS: z.number().int().min(1).max(600),
    inviteCode: z.string().trim().min(INVITE_CODE_MIN).max(64).regex(/^[A-Za-z0-9_-]+$/, 'Nur Buchstaben, Ziffern, - und _').nullable(),
  })
  .partial();
export type SettingsInput = z.infer<typeof SettingsInputSchema>;

export const LoginRequestSchema = z.object({
  password: z.string().min(1).max(256),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const PERSON_PASSWORD_MIN = 4;

export const PersonCredentialsSchema = z.object({
  personId: PersonIdSchema,
  password: z.string().min(PERSON_PASSWORD_MIN).max(128),
});
export type PersonCredentialsRequest = z.infer<typeof PersonCredentialsSchema>;

/** Self-registration (D27); the photo follows as a separate upload once logged in. */
export const RegisterRequestSchema = PersonInputSchema.extend({
  inviteCode: z.string().trim().min(1).max(64),
  password: PersonCredentialsSchema.shape.password,
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const ResetRequestSchema = z.object({
  deleteSubmissions: z.boolean().default(false),
});
export type ResetRequest = z.infer<typeof ResetRequestSchema>;

// Socket payloads (validated server-side)

export const DrawPayloadSchema = z.object({ presenterId: PersonIdSchema });
export type DrawPayload = z.infer<typeof DrawPayloadSchema>;

export const IdentifyPayloadSchema = z.object({ personId: PersonIdSchema.nullable() });
export type IdentifyPayload = z.infer<typeof IdentifyPayloadSchema>;

/** Partial update: omitted fields keep their value, `null` clears. */
export const CastVotePayloadSchema = z.object({
  roundId: z.number().int().positive(),
  guessPersonId: PersonIdSchema.nullable().optional(),
  stars: z.number().int().min(STARS_MIN).max(STARS_MAX).nullable().optional(),
});
export type CastVotePayload = z.infer<typeof CastVotePayloadSchema>;

export const ReactionPayloadSchema = z.object({ emoji: z.enum(REACTION_EMOJIS) });
export type ReactionPayload = z.infer<typeof ReactionPayloadSchema>;
