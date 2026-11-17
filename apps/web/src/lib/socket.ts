import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_NAMESPACES,
  type HostClientToServerEvents,
  type HostServerToClientEvents,
  type VoteClientToServerEvents,
  type VoteServerToClientEvents,
} from '@pribe/shared';

export type HostSocket = Socket<HostServerToClientEvents, HostClientToServerEvents>;
export type VoteSocket = Socket<VoteServerToClientEvents, VoteClientToServerEvents>;

/** Same origin; the host handshake carries the httpOnly session cookie automatically. */
export function createHostSocket(): HostSocket {
  return io(SOCKET_NAMESPACES.host, { withCredentials: true });
}

export function createVoteSocket(): VoteSocket {
  return io(SOCKET_NAMESPACES.vote);
}
