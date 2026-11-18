import { m as motion } from 'motion/react';
import type { GuessEdge, Person } from '@pribe/shared';
import { Avatar } from '../Avatar';

const W = 1600;
const H = 860;
const NODE_R = 54;

interface Point {
  x: number;
  y: number;
}

function layout(persons: Person[]): Map<string, Point> {
  const n = persons.length;
  return new Map(
    persons.map((p, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(n, 1);
      return [p.id, { x: W / 2 + Math.cos(a) * (W / 2 - 150), y: H / 2 - 10 + Math.sin(a) * (H / 2 - 110) }];
    }),
  );
}

/** Curved so that A→B and B→A run side by side; ends stop at the node rim. */
function curve(from: Point, to: Point) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const c = { x: (from.x + to.x) / 2 + nx * len * 0.18, y: (from.y + to.y) / 2 + ny * len * 0.18 };
  const trim = (p: Point, toward: Point, by: number) => {
    const l = Math.hypot(toward.x - p.x, toward.y - p.y) || 1;
    return { x: p.x + ((toward.x - p.x) / l) * by, y: p.y + ((toward.y - p.y) / l) * by };
  };
  const s = trim(from, c, NODE_R + 6);
  const e = trim(to, c, NODE_R + 14);
  return { d: `M ${s.x} ${s.y} Q ${c.x} ${c.y} ${e.x} ${e.y}`, label: { x: (s.x + 2 * c.x + e.x) / 4, y: (s.y + 2 * c.y + e.y) / 4 } };
}

/** R64: who guessed whom how often (owner dummy votes are already excluded server-side). */
export function GuessNetwork({ persons, edges }: { persons: Person[]; edges: GuessEdge[] }) {
  const pos = layout(persons);
  const drawn = edges.filter((e) => e.fromId !== e.toId && pos.has(e.fromId) && pos.has(e.toId));
  const max = Math.max(1, ...drawn.map((e) => e.count));
  const nodeDelay = (i: number) => 0.1 + i * 0.08;
  const edgeStart = nodeDelay(persons.length) + 0.3;
  // Weakest first so the thick ones land last, on top.
  const ordered = [...drawn].reverse();
  const step = Math.min(0.35, 6 / Math.max(ordered.length, 1));

  return (
    <svg className="finale-network" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tipp-Netz">
      <defs>
        {persons.map((p) => (
          <marker key={p.id} id={`arrow-${p.id}`} viewBox="0 0 10 10" refX="2" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={p.color} />
          </marker>
        ))}
        <filter id="finale-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
      {ordered.map((e, i) => {
        const from = persons.find((p) => p.id === e.fromId)!;
        const { d, label } = curve(pos.get(e.fromId)!, pos.get(e.toId)!);
        const width = 3 + (e.count / max) * 14;
        const delay = edgeStart + i * step;
        return (
          <g key={`${e.fromId}>${e.toId}`}>
            {e.correct > 0 && (
              <motion.path
                d={d}
                fill="none"
                stroke="#73d95f"
                strokeWidth={width + 12}
                strokeLinecap="round"
                filter="url(#finale-glow)"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.85 }}
                transition={{ delay, duration: 0.9, ease: 'easeOut' }}
              />
            )}
            <motion.path
              d={d}
              fill="none"
              stroke={from.color}
              strokeWidth={width}
              strokeLinecap="round"
              markerEnd={`url(#arrow-${from.id})`}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.9 }}
              transition={{ delay, duration: 0.9, ease: 'easeOut' }}
            />
            {e.count > 1 && (
              <motion.g initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: delay + 0.8, type: 'spring', bounce: 0.6 }}>
                <circle cx={label.x} cy={label.y} r={22} fill={from.color} stroke="var(--surface-default)" strokeWidth={4} />
                <text x={label.x} y={label.y} className="finale-network-count" textAnchor="middle" dominantBaseline="central">
                  {e.count}
                </text>
              </motion.g>
            )}
          </g>
        );
      })}
      {persons.map((p, i) => {
        const { x, y } = pos.get(p.id)!;
        return (
          <motion.g
            key={p.id}
            initial={{ scale: 0, rotate: -180, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ delay: nodeDelay(i), type: 'spring', bounce: 0.55 }}
          >
            <circle cx={x} cy={y} r={NODE_R + 8} fill={p.color} opacity={0.35} />
            <foreignObject className="finale-network-node" x={x - NODE_R} y={y - NODE_R} width={NODE_R * 2} height={NODE_R * 2}>
              <Avatar person={p} size={NODE_R * 2} />
            </foreignObject>
            <text x={x} y={y + NODE_R + 36} className="finale-network-name" textAnchor="middle">
              {p.name}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}
