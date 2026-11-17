import type { FastifyInstance } from 'fastify';
import { API_PATHS, inviteLink, type HostInfoDto } from '@pribe/shared';
import type { AppContext } from '../context';

/** Beamer routes (P5); registered inside the admin-guarded scope. */
export async function hostRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  app.get(API_PATHS.hostInfo, async (): Promise<HostInfoDto> => {
    const code = ctx.repos.settings.get().inviteCode;
    return code
      ? { voteUrl: inviteLink(ctx.config.publicUrl, '/vote', code), registrationOpen: true }
      : { voteUrl: `${ctx.config.publicUrl}/vote`, registrationOpen: false };
  });
}
