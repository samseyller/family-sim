import { useMemo, useState } from 'react';
import {
  ACTIVITIES, CATEGORIES, activityBlocker, candidatesFor, distanceOf, energyOf, timesThisYear, type ActivityDef, type Category,
} from '../../engine/activities';
import type { GameState } from '../../engine/types';
import { active, ageOf, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { Avatar } from '../Avatar';
import { Modal } from '../components';

/** The activities that make sense for the player's age right now. */
function forAge(g: GameState) {
  const age = ageOf(active(g), g.year);
  return ACTIVITIES.filter((a) => {
    const [lo, hi] = a.ages ?? [18, 120];
    return age >= lo && age <= hi;
  });
}

function EnergyBar({ g }: { g: GameState }) {
  const e = energyOf(g);
  const pct = (e.left / 100) * 100;
  const capped = 100 - e.max;
  return (
    <div className="card energy" aria-live="polite">
      <div className="row">
        <strong>⚡ Energy</strong>
        <span>{e.left} of {e.max} left</span>
      </div>
      <div className="energy-bar" role="meter" aria-label="Energy left" aria-valuemin={0} aria-valuemax={100} aria-valuenow={e.left}>
        <div className="energy-fill" style={{ width: `${pct}%` }} />
        {capped > 0 && <div className="energy-cap" style={{ width: `${capped}%` }} title="Lost to poor health or stress" />}
      </div>
      <p className="hint">
        Energy refills every year. {capped > 0 ? `Poor health or stress is costing you ${capped} this year.` : 'Stay healthy and calm to keep all 100.'}
      </p>
    </div>
  );
}

function ActivitySheet({ g, def, onClose }: { g: GameState; def: ActivityDef; onClose: () => void }) {
  const run = useGame((s) => s.activity);
  const pool = candidatesFor(g, def);
  const max = def.max ?? Infinity;
  const [picked, setPicked] = useState<string[]>(() => (def.who !== 'solo' && pool.length === 1 && (def.min ?? 1) >= 1 ? [pool[0].id] : []));
  const people = picked.map((id) => g.people[id]);
  const blocker = activityBlocker(g, def.id, picked);
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : max === 1 ? [id] : cur.length >= max ? cur : [...cur, id]));
  return (
    <Modal label={def.label} onClose={onClose}>
      <h2>{def.icon} {def.label}</h2>
      <p className="muted">{def.desc}</p>
      {def.who !== 'solo' && (
        <>
          <div className="label">
            {def.who === 'partner' ? 'With' : def.who === 'relative' ? 'Who will you visit?' : def.who === 'guests' ? 'Invite' : 'Who comes along?'}
            {def.min === 0 ? ' (optional)' : ''}
          </div>
          <div className="picker">
            {pool.length === 0 && <p className="hint">Nobody is available for this.</p>}
            {pool.map((p) => (
              <label key={p.id} className={`pick ${picked.includes(p.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                <Avatar person={p} year={g.year} size={40} />
                <span>
                  {p.firstName}
                  <span className="hint">
                    {' '}
                    {ageOf(p, g.year)}
                    {def.who === 'relative' || def.who === 'guests' ? ` · ${distanceOf(p.householdId) === 'far' ? 'far away' : 'nearby'}` : ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      <div className="sheet-cost">
        <span>⚡ {def.energy(g, people)} energy</span>
        <span>💵 {money(def.cost(g, people))}{def.kidAsk ? ' (if your parents say yes)' : ''}</span>
      </div>
      {blocker && <p className="notice">{blocker}</p>}
      <div className="choices">
        <button className="primary big" disabled={!!blocker} data-autofocus onClick={() => { run(def.id, picked); onClose(); }}>Do it</button>
        <button className="big" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

function ResultCard({ g }: { g: GameState }) {
  const dismiss = useGame((s) => s.dismissActivity);
  const r = g.lastActivity!;
  return (
    <Modal label={r.title} onClose={dismiss}>
      <div className="eyebrow">Activity</div>
      <h2>{r.title}</h2>
      <p className={r.tone === 'bad' ? 'neg' : undefined}>{r.text}</p>
      <div className="changes">
        {r.changes.map((c) => (
          <span key={c} className={`chip ${changeTone(c)}`}>{c}</span>
        ))}
      </div>
      <button className="primary big close-btn" data-autofocus onClick={dismiss}>Nice</button>
    </Modal>
  );
}

export function ActivitiesTab({ g }: { g: GameState }) {
  const available = useMemo(() => forAge(g), [g]);
  const cats = useMemo(() => [...new Set(available.map((a) => a.category))], [available]);
  const [cat, setCat] = useState<Category | 'all'>('all');
  const [open, setOpen] = useState<ActivityDef | null>(null);
  const shown = available.filter((a) => cat === 'all' || a.category === cat);
  const planning = g.phase === 'PLANNING';

  return (
    <div className="stack">
      <EnergyBar g={g} />
      {!planning && <p className="notice">Activities open again when you plan next year.</p>}
      <div className="chips" role="radiogroup" aria-label="Activity category">
        <button role="radio" aria-checked={cat === 'all'} className={cat === 'all' ? 'chip-btn on' : 'chip-btn'} onClick={() => setCat('all')}>All</button>
        {cats.map((c) => (
          <button key={c} role="radio" aria-checked={cat === c} className={cat === c ? 'chip-btn on' : 'chip-btn'} onClick={() => setCat(c)}>
            {CATEGORIES[c].icon} {CATEGORIES[c].label}
          </button>
        ))}
      </div>
      <div className="activity-grid">
        {shown.map((a) => {
          const pool = candidatesFor(g, a);
          // Judge availability without participants: only "nobody can come" and hard limits disable the card.
          const hard = activityBlocker(g, a.id, a.who === 'solo' ? [] : pool.slice(0, Math.max(1, a.min ?? 1)).map((p) => p.id));
          const done = timesThisYear(g, a.id);
          return (
            <button key={a.id} className="activity" disabled={!!hard} title={hard ?? undefined} onClick={() => setOpen(a)}>
              <span className="activity-icon" aria-hidden>{a.icon}</span>
              <span className="activity-body">
                <strong>{a.label}</strong>
                <span className="hint">{hard ?? a.desc}</span>
                <span className="activity-meta">
                  <span>⚡ {a.energy(g, pool.slice(0, 1))}</span>
                  <span>💵 {a.cost(g, a.who === 'solo' ? [] : pool.slice(0, Math.max(0, a.min ?? 1))) ? `from ${money(a.cost(g, a.who === 'solo' ? [] : pool.slice(0, Math.max(0, a.min ?? 1))))}` : 'free'}</span>
                  {done > 0 && <span>✓ ×{done}</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {open && !g.lastActivity && <ActivitySheet g={g} def={open} onClose={() => setOpen(null)} />}
      {g.lastActivity && <ResultCard g={g} />}
    </div>
  );
}

/** Color a change chip: gains are good, losses bad; for stress it's the other way round. */
function changeTone(c: string) {
  if (c.startsWith('Energy')) return '';
  if (c.startsWith('Stress')) return c.includes('-') ? 'good' : 'bad';
  if (/^-\$|-\d/.test(c)) return 'bad';
  return c.includes('+') ? 'good' : '';
}
