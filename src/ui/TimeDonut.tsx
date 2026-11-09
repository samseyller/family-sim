import { TIME_BUDGET } from '../content/actions';
import type { Plan } from '../engine/types';

export interface TimeSplit {
  work: number;
  self: number;
  family: number;
}

const SELF = new Set(['exercise', 'relax', 'learn']);
const WORK = new Set(['work', 'parttime']);

export function splitTime(plan: Plan): TimeSplit {
  const t: TimeSplit = { work: 0, self: 0, family: 0 };
  for (const [k, n] of Object.entries(plan.alloc)) {
    const action = k.split(':')[0];
    if (WORK.has(action)) t.work += n;
    else if (SELF.has(action)) t.self += n;
    else t.family += n;
  }
  return t;
}

const SLICES: { key: keyof TimeSplit; label: string; icon: string; color: string }[] = [
  { key: 'work', label: 'Work', icon: '💼', color: 'var(--series-1)' },
  { key: 'self', label: 'Yourself', icon: '🧘', color: 'var(--series-2)' },
  { key: 'family', label: 'Family', icon: '🏡', color: 'var(--series-3)' },
];

/** Donut of how the year's time blocks are split, with a labeled legend (doubles as the table view). */
export function TimeDonut({ split }: { split: TimeSplit }) {
  const R = 38;
  const C = 2 * Math.PI * R;
  const GAP = 2; // surface gap between segments, in px of arc
  const used = split.work + split.self + split.family;
  let offset = 0;
  const arcs = SLICES.filter((s) => split[s.key] > 0).map((s) => {
    const len = (split[s.key] / TIME_BUDGET) * C;
    const arc = { ...s, len, offset };
    offset += len;
    return arc;
  });
  const gap = arcs.length + (used < TIME_BUDGET ? 1 : 0) > 1 ? GAP : 0;

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 100 100" className="donut" role="img" aria-label={`Time: ${SLICES.map((s) => `${s.label} ${split[s.key]}`).join(', ')}, unused ${TIME_BUDGET - used} of ${TIME_BUDGET} blocks`}>
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="14" />
        <g transform="rotate(-90 50 50)">
          {arcs.map((a) => (
            <circle
              key={a.key}
              className="donut-seg"
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="14"
              strokeDasharray={`${Math.max(0, a.len - gap)} ${C}`}
              strokeDashoffset={-a.offset}
            >
              <title>{`${a.label}: ${split[a.key]} block${split[a.key] === 1 ? '' : 's'}`}</title>
            </circle>
          ))}
        </g>
        <text x="50" y="49" textAnchor="middle" className="donut-num">{used}</text>
        <text x="50" y="62" textAnchor="middle" className="donut-sub">of {TIME_BUDGET} blocks</text>
      </svg>
      <ul className="donut-legend">
        {SLICES.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ background: s.color }} aria-hidden />
            <span>{s.icon} {s.label}</span>
            <strong>{split[s.key]}</strong>
          </li>
        ))}
        {used < TIME_BUDGET && (
          <li className="muted">
            <span className="swatch unused" aria-hidden />
            <span>Unused</span>
            <strong>{TIME_BUDGET - used}</strong>
          </li>
        )}
      </ul>
    </div>
  );
}
