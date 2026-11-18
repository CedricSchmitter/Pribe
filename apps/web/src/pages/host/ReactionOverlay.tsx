import { useMemo } from 'react';
import { m as motion } from 'motion/react';
import type { ComboEvent, Person, PersonId, ReactionEvent } from '@pribe/shared';
import { Avatar } from '../../components/Avatar';
import { ComboBlast } from '../../fx';

/** Seeded from the reaction id so a re-render does not move a flying emoji. */
function seeded(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function Flyer({ r, person }: { r: ReactionEvent; person: Person | undefined }) {
  const p = useMemo(() => {
    const rnd = seeded(r.id);
    return { x: 5 + rnd() * 90, drift: (rnd() - 0.5) * 300, spin: (rnd() - 0.5) * 120, size: 4 + rnd() * 4 };
  }, [r.id]);
  return (
    <motion.div
      className="host-reaction"
      style={{ left: `${p.x}%`, fontSize: `${p.size}rem` }}
      initial={{ y: '10vh', opacity: 0, scale: 0.2 }}
      animate={{
        y: '-110vh',
        x: [0, p.drift * 0.4, -p.drift * 0.5, p.drift * 0.3, p.drift],
        rotate: [0, p.spin, -p.spin, p.spin * 0.5, 0],
        opacity: [0, 1, 1, 1, 0],
        scale: [0.2, 1.8, 1, 1.15, 0.8],
      }}
      transition={{ duration: 4, ease: 'easeOut', scale: { duration: 4, times: [0, 0.08, 0.2, 0.5, 1] } }}
    >
      {r.emoji}
      {person && (
        <span className="host-reaction-from">
          <Avatar person={person} size={36} />
        </span>
      )}
    </motion.div>
  );
}

export function ReactionOverlay({
  reactions,
  combo,
  person,
}: {
  reactions: ReactionEvent[];
  combo: ComboEvent | null;
  person(id: PersonId | null): Person | undefined;
}) {
  return (
    <div className="host-reactions">
      <div aria-hidden>
        {reactions.map((r) => (
          <Flyer key={r.id} r={r} person={person(r.personId)} />
        ))}
      </div>
      <ComboBlast combo={combo} />
    </div>
  );
}
