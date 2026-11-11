import { useState } from 'react';
import { HOBBIES, HOBBY_BY_ID } from '../../content/actions';
import { SPORTS } from '../../content/sports';
import { hobbyBlocker, practiceBoost, practiceCostPerBlock } from '../../engine/hobbies';
import type { GameState } from '../../engine/types';
import { active, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { SportPicker } from './SportsPanel';

/** "Skill up; costs $120/block; workshop: 2× faster" for the practice row. */
export function practiceHint(g: GameState) {
  const me = active(g);
  if (!me.hobby) return '';
  const cost = practiceCostPerBlock(g, me);
  const boost = practiceBoost(g, me, me.hobby);
  return [
    'Skill up; it can become a career',
    cost ? `${money(cost)} per block` : '',
    boost > 1 ? `your setup: ${boost}× faster` : '',
  ].filter(Boolean).join(' · ');
}

/** Take up a hobby (or switch); skill in earlier hobbies is kept. Sports open a list of sports. */
export function HobbyPicker({ g }: { g: GameState }) {
  const me = active(g);
  const take = useGame((s) => s.takeHobby);
  const [sportsOpen, setSportsOpen] = useState(false);
  const current = me.hobby === 'sports' && me.sport ? `${SPORTS[me.sport].icon} Sport: ${SPORTS[me.sport].label}` : me.hobby ? `${HOBBY_BY_ID[me.hobby].icon} Hobby: ${HOBBY_BY_ID[me.hobby].label}` : '';
  return (
    <details className="jobs">
      <summary>{current ? `${current} · change` : '🎯 Take up a hobby'}</summary>
      <div className="job-list">
        {HOBBIES.filter((h) => h.id === 'sports' || h.id !== me.hobby).map((h) => {
          if (h.id === 'sports') {
            return (
              <button key={h.id} className={sportsOpen ? 'job on' : 'job'} aria-expanded={sportsOpen} onClick={() => setSportsOpen(!sportsOpen)}>
                <span>{h.icon} Sports…</span>
                <span className="hint">Ten sports: from youth leagues to the pros, or just for fun</span>
              </button>
            );
          }
          const blocker = hobbyBlocker(g, h.id);
          const skill = me.skills[h.id] ?? 0;
          return (
            <button key={h.id} className="job" disabled={!!blocker} title={blocker ?? undefined} onClick={() => take(h.id)}>
              <span>{h.icon} {h.label}{skill ? ` (skill ${skill})` : ''}</span>
              <span className="hint">{blocker ?? `${h.desc}${h.cost ? ` · ${money(h.cost)}/block` : ''}`}</span>
            </button>
          );
        })}
      </div>
      {sportsOpen && <SportPicker g={g} />}
      <p className="hint">You practice one hobby at a time; skill in old hobbies (and each sport) is kept. Gear and home upgrades make practice faster.</p>
    </details>
  );
}
