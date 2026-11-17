import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useSearchParams } from 'react-router';
import {
  API_PATHS,
  type Person,
  type PersonAuthStatusDto,
  type PersonMeDto,
  type SubmissionStatusDto,
  type SubmitStatusDto,
  type TopicDto,
  type TopicResponseDto,
} from '@pribe/shared';
import { api, ApiRequestError } from '../../lib/api';
import { useShellAvatar, useToast } from '../../shell';
import { DeadlineBanner } from './DeadlineBanner';
import { PasswordStep } from './PasswordStep';
import { Avatar } from '../../components/Avatar';
import { PersonPicker } from './PersonPicker';
import { RegisterStep } from './RegisterStep';
import { TopicWheel } from './TopicWheel';
import { UploadCard } from './UploadCard';
import './submit.css';

const STATUS_POLL_MS = 5000;
const SUBMISSION_POLL_MS = 2000;

type Step =
  | { kind: 'loading' }
  | { kind: 'pick' }
  | { kind: 'register' }
  | { kind: 'password'; person: Person; hasPassword: boolean }
  | { kind: 'in'; me: Person; topic: TopicDto | null; topicSeen: boolean };

export function SubmitPage() {
  const toast = useToast();
  const [params] = useSearchParams();
  const inviteCode = params.get('code') ?? '';
  const [persons, setPersons] = useState<Person[] | null>(null);
  const [status, setStatus] = useState<SubmitStatusDto | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [mine, setMine] = useState<SubmissionStatusDto | null>(null);

  const me = step.kind === 'in' ? step.me : null;
  useShellAvatar(me ? { emoji: me.emoji, color: me.color, label: me.name } : null);

  const refreshStatus = useCallback(async () => {
    const s = await api<SubmitStatusDto>(API_PATHS.submit.status);
    setClockOffset(s.serverTime - Date.now());
    setStatus(s);
  }, []);

  const enter = useCallback(async (person: Person) => {
    const { topic } = await api<TopicResponseDto>(API_PATHS.submit.topic);
    setStep({ kind: 'in', me: person, topic, topicSeen: topic !== null });
  }, []);

  useEffect(() => {
    api<Person[]>(API_PATHS.persons)
      .then(setPersons)
      .catch(() => setPersons([]));
    api<PersonMeDto>(API_PATHS.person.me)
      .then((r) => (r.person ? enter(r.person) : setStep({ kind: inviteCode ? 'register' : 'pick' })))
      .catch(() => setStep({ kind: 'pick' }));
    void refreshStatus().catch(() => {});
    const timer = setInterval(() => void refreshStatus().catch(() => {}), STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [refreshStatus, enter]);

  const meId = me?.id ?? null;
  useEffect(() => {
    if (!meId) {
      setMine(null);
      return;
    }
    let alive = true;
    let settled = false;
    const load = async () => {
      if (settled) return;
      try {
        const s = await api<SubmissionStatusDto>(API_PATHS.submit.mine);
        if (!alive) return;
        setMine(s);
        settled = s.status !== 'converting';
      } catch (err) {
        if (alive && err instanceof ApiRequestError && err.status === 404) {
          settled = true;
          setMine(null);
        }
      }
    };
    void load();
    const timer = setInterval(load, SUBMISSION_POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [meId, mine?.submissionId]);

  async function choose(id: string) {
    const person = persons?.find((p) => p.id === id);
    if (!person) return;
    try {
      const { hasPassword } = await api<PersonAuthStatusDto>(API_PATHS.person.status(id));
      setStep({ kind: 'password', person, hasPassword });
    } catch {
      toast('Das hat nicht geklappt. Bitte nochmal.', 'error');
    }
  }

  async function logout() {
    await api(API_PATHS.person.logout, { method: 'POST', body: {} }).catch(() => {});
    setMine(null);
    setStep({ kind: 'pick' });
  }

  if (!persons || !status || step.kind === 'loading') return null;

  let content: ReactNode;
  let key: string = step.kind;
  if (step.kind === 'pick') {
    content = (
      <PersonPicker persons={persons} onChoose={(id) => void choose(id)} onRegister={() => setStep({ kind: 'register' })} />
    );
  } else if (step.kind === 'register') {
    content = (
      <RegisterStep
        initialCode={inviteCode}
        onRegistered={(p) => {
          setPersons((list) => [...(list ?? []), p]);
          void enter(p);
        }}
        onBack={() => setStep({ kind: 'pick' })}
      />
    );
  } else if (step.kind === 'password') {
    content = (
      <PasswordStep
        person={step.person}
        hasPassword={step.hasPassword}
        onLoggedIn={(p) => void enter(p)}
        onBack={() => setStep({ kind: 'pick' })}
      />
    );
  } else if (!step.topicSeen) {
    key = 'wheel';
    content = (
      <TopicWheel
        onSpin={async () => (await api<TopicResponseDto>(API_PATHS.submit.topicSpin, { method: 'POST', body: {} })).topic!}
        onDone={(topic) => setStep({ ...step, topic, topicSeen: true })}
      />
    );
  } else {
    content = (
      <div className="stack">
        <MeRow me={step.me} onLogout={() => void logout()} />
        {step.topic && (
          <div className="topic-card small">
            <span className="label">{step.topic.index === null ? 'Dein Thema' : `Dein Thema · Nr. ${step.topic.index + 1}`}</span>
            <strong className="topic-title">{step.topic.title}</strong>
          </div>
        )}
        <UploadCard
          status={status}
          mine={mine}
          onUploaded={(dto) => {
            setMine(dto);
            void refreshStatus().catch(() => {});
          }}
        />
      </div>
    );
  }

  return (
    <main className="page submit">
      <DeadlineBanner status={status} clockOffset={clockOffset} onExpired={() => void refreshStatus()} />
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          initial={{ opacity: 0, x: 80, rotate: 2 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          exit={{ opacity: 0, x: -80, rotate: -2 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

function MeRow({ me, onLogout }: { me: Person; onLogout: () => void }) {
  return (
    <div className="me-row">
      <Avatar person={me} size={56} />
      <div className="me-text">
        <span className="muted">Du bist</span>
        <strong className="me-name">{me.name}</strong>
      </div>
      <button type="button" className="ghost" onClick={onLogout}>
        Abmelden
      </button>
    </div>
  );
}
