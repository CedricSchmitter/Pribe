import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { API_PATHS, type HostInfoDto } from '@pribe/shared';
import { emojiBurst, FloatingEmojis, JumpText, shake } from '../../fx';
import { api } from '../../lib/api';
import { Avatar } from './Avatar';
import type { HostGame } from './useHostGame';

export function Lobby({ game, onError }: { game: HostGame; onError(msg: string): void }) {
  const snap = game.snapshot!;
  const [info, setInfo] = useState<HostInfoDto | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const voteUrl = info?.voteUrl ?? null;

  useEffect(() => {
    api<HostInfoDto>(API_PATHS.hostInfo)
      .then(setInfo)
      .catch(() => setInfo({ voteUrl: `${location.origin}/vote`, registrationOpen: false }));
  }, []);

  useEffect(() => {
    if (!voteUrl) return;
    void QRCode.toString(voteUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setQr);
  }, [voteUrl]);

  const connected = snap.connectedPersonIds.map((id) => game.person(id)).filter((p) => p !== undefined);

  // Celebrate each newcomer with their own emoji; the first render only records who is already there.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(snap.connectedPersonIds);
    const prev = seen.current;
    seen.current = ids;
    if (!prev) return;
    const timers = connected
      .filter((p) => !prev.has(p.id))
      .map((p, i) =>
        setTimeout(() => {
          emojiBurst([p.emoji, '🎉'], { x: 0.72, y: 0.45 }, 24);
          shake(8, 350);
        }, 450 + i * 250),
      );
    return () => timers.forEach(clearTimeout);
  }, [snap.connectedPersonIds.join('|')]);

  async function start() {
    const res = await game.command('game:start');
    if (!res.ok) onError(res.message);
  }

  return (
    <div className="host-lobby">
      <FloatingEmojis emojis={['📱', '🎤', '📊', '🤔', '🔥', '😂', '👏', '🍅']} count={18} />
      <div className="host-lobby-qr">
        <motion.div
          className="host-qr fx-pulse-glow"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 12 }}
          dangerouslySetInnerHTML={qr ? { __html: qr } : undefined}
        />
        <div className="host-lobby-url">{voteUrl?.replace(/^https?:\/\//, '')}</div>
        {info && !info.registrationOpen && (
          <div className="inline-warning">Kein Einladungscode gesetzt – Neue können sich nicht registrieren (Admin → Einstellungen).</div>
        )}
      </div>
      <div className="host-lobby-side">
        <h1>
          <JumpText text="Handy raus!" /> <motion.span style={{ display: 'inline-block' }} animate={{ rotate: [-15, 15, -15] }} transition={{ repeat: Infinity, duration: 0.6 }}>📱</motion.span>
        </h1>
        <p className="muted">QR-Code scannen, Namen wählen – los geht's.</p>
        <div className="host-lobby-names">
          <AnimatePresence>
            {connected.map((p, i) => (
              <motion.div
                key={p.id}
                className="host-lobby-name"
                style={{ borderColor: p.color }}
                initial={{ x: i % 2 ? 900 : -900, y: -300, rotate: i % 2 ? 540 : -540, scale: 0.2, opacity: 0 }}
                animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0, rotate: 90 }}
                transition={{ type: 'spring', stiffness: 160, damping: 13 }}
              >
                <Avatar person={p} size={56} />
                <span>{p.name}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="host-lobby-footer">
          <span className="muted">
            {connected.length} von {snap.persons.length} dabei · {snap.poolSize} Präsentationen im Pool
          </span>
          <button type="button" className="primary host-big-button" onClick={start} disabled={snap.poolSize === 0}>
            Spiel starten 🚀
          </button>
        </div>
      </div>
    </div>
  );
}
