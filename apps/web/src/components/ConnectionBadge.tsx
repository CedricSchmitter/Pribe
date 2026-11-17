import type { ConnectionStatus } from '../lib/useSocket';

const LABELS: Record<ConnectionStatus, string> = {
  connecting: 'Verbinde …',
  connected: 'Verbunden',
  disconnected: 'Getrennt',
  unauthorized: 'Nicht angemeldet',
};

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <span className={`badge badge-${status}`} data-status={status}>
      {LABELS[status]}
    </span>
  );
}
