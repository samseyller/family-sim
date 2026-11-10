import { HOBBIES, HOBBY_BY_ID } from '../../content/actions';
import { hobbyBlocker, practiceBoost, practiceCostPerBlock } from '../../engine/hobbies';
import type { GameState } from '../../engine/types';
import { active, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';

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

/** Take up a hobby (or switch); skill in earlier hobbies is kept. */
export function HobbyPicker({ g }: { g: GameState }) {
  const me = active(g);
  const take = useGame((s) => s.takeHobby);
  return (
    <details className="jobs">
      <summary>{me.hobby ? `${HOBBY_BY_ID[me.hobby].icon} Hobby: ${HOBBY_BY_ID[me.hobby].label} · change` : '🎯 Take up a hobby'}</summary>
      <div className="job-list">
        {HOBBIES.filter((h) => h.id !== me.hobby).map((h) => {
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
      <p className="hint">You practice one hobby at a time; skill in old hobbies is kept. Gear and home upgrades make practice faster.</p>
    </details>
  );
}
