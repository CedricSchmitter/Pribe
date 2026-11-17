import type { Server as HttpServer } from 'node:http';
import { Server, type Namespace } from 'socket.io';
import {
  SOCKET_NAMESPACES,
  type HostClientToServerEvents,
  type HostServerToClientEvents,
  type HostSocketData,
  type InterServerEvents,
  type VoteClientToServerEvents,
  type VoteServerToClientEvents,
  type VoteSocketData,
} from '@pribe/shared';
import { socketAdminGuard } from './auth/guards';
import type { AppContext } from './context';
import { registerGame } from './game';

export type HostNamespace = Namespace<
  HostClientToServerEvents,
  HostServerToClientEvents,
  InterServerEvents,
  HostSocketData
>;
export type VoteNamespace = Namespace<
  VoteClientToServerEvents,
  VoteServerToClientEvents,
  InterServerEvents,
  VoteSocketData
>;

export function createSocketServer(httpServer: HttpServer, ctx: AppContext) {
  const io = new Server(httpServer, { serveClient: false });

  // Socket.IO types namespaces by the server's event maps; each namespace has its own contract.
  const host = io.of(SOCKET_NAMESPACES.host) as unknown as HostNamespace;
  host.use(socketAdminGuard(ctx.sessions));
  host.use((socket, next) => {
    socket.data.role = 'host';
    next();
  });

  const vote = io.of(SOCKET_NAMESPACES.vote) as unknown as VoteNamespace;
  vote.use((socket, next) => {
    socket.data.role = 'vote';
    socket.data.personId = null;
    next();
  });

  const disposeGame = registerGame({ host, vote }, ctx);

  return {
    io,
    host,
    vote,
    async close() {
      disposeGame();
      await io.close();
    },
  };
}
