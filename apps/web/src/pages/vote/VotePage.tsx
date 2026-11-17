import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { API_PATHS, type Person, type PersonMeDto } from '@pribe/shared';
import { api } from '../../lib/api';
import { useShellAvatar } from '../../shell';
import { RevealView } from './RevealView';
import { useVoteGame } from './useVoteGame';
import { VoteLogin } from './VoteLogin';
import { VotingPanel } from './VotingPanel';
import { MyFinale } from '../../components/finale';
import { LobbyWaiting, SoonWaiting } from './Waiting';
import './vote.css';

type Auth = { kind: 'loading' } | { kind: 'out'; persons: Person[] } | { kind: 'in'; me: Person };

/** Phone view (P6, L7). */
export function VotePage() {
  const { status, snapshot, cast, react, reconnect, clockOffset } = useVoteGame();
  const [params] = useSearchParams();
  const inviteCode = params.get('code') ?? '';
  const [auth, setAuth] = useState<Auth>({ kind: 'loading' });
  const [didLogout, setDidLogout] = useState(false);

  const loggedOut = useCallback(async () => {
    const persons = await api<Person[]>(API_PATHS.persons).catch(() => [] as Person[]);
    setAuth({ kind: 'out', persons });
  }, []);

  useEffect(() => {
    api<PersonMeDto>(API_PATHS.person.me)
      .then((r) => (r.person ? setAuth({ kind: 'in', me: r.person }) : loggedOut()))
      .catch(() => loggedOut());
  }, [loggedOut]);

  // Session gone on the server (admin reset the password, cookie expired): back to the login.
  const authMeId = auth.kind === 'in' ? auth.me.id : null;
  const serverMe = snapshot?.me;
  const recheckedFor = useRef<string | null>(null);
  useEffect(() => {
    if (serverMe) recheckedFor.current = null;
    // One recheck per login, so a server that keeps answering `me: null` cannot cause a reconnect loop.
    if (authMeId && status === 'connected' && serverMe === null && recheckedFor.current !== authMeId) {
      recheckedFor.current = authMeId;
      api<PersonMeDto>(API_PATHS.person.me)
        .then((r) => (r.person ? reconnect() : loggedOut()))
        .catch(() => {});
    }
  }, [authMeId, serverMe, status, reconnect, loggedOut]);

  const logout = async () => {
    await api(API_PATHS.person.logout, { method: 'POST', body: {} }).catch(() => {});
    setDidLogout(true);
    reconnect();
    await loggedOut();
  };

  const me = auth.kind === 'in' ? (snapshot?.persons.find((p) => p.id === auth.me.id) ?? auth.me) : null;
  useShellAvatar(me ? { emoji: me.emoji, color: me.color, label: me.name } : null);

  let content;
  let key: string;
  if (auth.kind === 'out') {
    key = 'login';
    content = (
      <VoteLogin
        persons={auth.persons}
        inviteCode={inviteCode}
        startWithRegister={!!inviteCode && !didLogout}
        onLoggedIn={(p) => {
          setAuth({ kind: 'in', me: p });
          reconnect();
        }}
      />
    );
  } else if (!snapshot || !me) {
    key = 'loading';
    content = (
      <div className="vote-page center vote-waiting">
        <motion.div className="hero-emoji" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
          📱
        </motion.div>
        <p className="muted">Verbinde …</p>
      </div>
    );
  } else {
    // Right after login the socket still runs on the old handshake; until it reconnects its vote fields belong to nobody.
    const identified = snapshot.me === me.id;
    const presenter = snapshot.persons.find((p) => p.id === snapshot.round?.presenterId) ?? null;
    switch (snapshot.phase) {
      case 'lobby':
        key = 'lobby';
        content = <LobbyWaiting me={me} poolSize={snapshot.poolSize} />;
        break;
      case 'choosePresenter':
      case 'drawing':
        key = 'soon';
        content = <SoonWaiting presenter={snapshot.phase === 'drawing' ? presenter : null} drawing={snapshot.phase === 'drawing'} />;
        break;
      case 'presenting':
      case 'countdown':
        key = `vote-${snapshot.round?.id}`;
        content = snapshot.round ? (
          <VotingPanel
            me={me}
            persons={snapshot.persons}
            round={snapshot.round}
            inCountdown={snapshot.phase === 'countdown'}
            myVote={identified ? snapshot.myVote : null}
            clockOffset={clockOffset}
            cast={cast}
            react={react}
          />
        ) : null;
        break;
      case 'reveal':
        key = `reveal-${snapshot.reveal?.roundId}`;
        content =
          snapshot.reveal && identified ? (
            <RevealView reveal={snapshot.reveal} outcome={snapshot.myOutcome} persons={snapshot.persons} myVote={snapshot.myVote} />
          ) : null;
        break;
      case 'finale':
        key = 'finale';
        content = snapshot.finale ? <MyFinale me={me} finale={snapshot.finale} /> : null;
        break;
    }
  }

  return (
    <div className="vote-root">
      {status !== 'connected' && snapshot && (
        <motion.div className="vote-offline" initial={{ y: -40 }} animate={{ y: 0 }} role="status">
          📡 Verbindung weg – verbinde neu …
        </motion.div>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          className="vote-stage"
          initial={{ opacity: 0, scale: 0.85, rotate: -3, y: 40 }}
          animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
          exit={{ opacity: 0, scale: 1.15, rotate: 3, y: -40 }}
          transition={{ type: 'spring', bounce: 0.45, duration: 0.6 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
      {me && snapshot && (
        <button type="button" className="ghost vote-change-name" onClick={() => void logout()}>
          Nicht {me.name}? Abmelden
        </button>
      )}
    </div>
  );
}
