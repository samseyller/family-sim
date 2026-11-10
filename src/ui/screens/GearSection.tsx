import type { ReactElement } from 'react';
import { HOBBY_BY_ID } from '../../content/actions';
import { GEAR, type GearId } from '../../content/gear';
import type { FinanceAction } from '../../engine/finance';
import { gearOf } from '../../engine/hobbies';
import type { GameState } from '../../engine/types';
import { active, money } from '../../engine/util';
import { Section } from '../components';

type ActFn = (p: { g: GameState; action: FinanceAction; label: string; hint?: string; confirm?: string }) => ReactElement;

/** Planes, boats, and project cars: buy, keep up, restore, sell, and pass down. */
export function GearSection({ g, Act }: { g: GameState; Act: ActFn }) {
  const hh = g.households[active(g).householdId];
  const owned = gearOf(hh);
  return (
    <Section title="🧰 Hobby gear">
      {owned.map((a) => {
        const def = GEAR[a.gear!];
        return (
          <div key={a.id} className="car-row">
            <div className="row"><span>{def.icon} {a.name}</span><strong>{money(a.value)}</strong></div>
            <div className="row hint">
              <span>
                Upkeep {money(a.upkeep)}/yr · {HOBBY_BY_ID[def.hobby].label} practice {def.boost}× faster
                {a.gear === 'project_car' ? ` · ${a.restore ?? 0}% restored (Activities → Work on the project car)` : ''}
              </span>
            </div>
            <div className="choices">
              <Act g={g} action={{ kind: 'sellGear', assetId: a.id }} label={`Sell for ${money(a.value)}`} confirm={`Confirm: sell the ${a.name.toLowerCase()}`} />
            </div>
          </div>
        );
      })}
      <div className="choices">
        {(Object.keys(GEAR) as GearId[]).map((id) => {
          const d = GEAR[id];
          return (
            <Act key={id} g={g} action={{ kind: 'buyGear', gear: id }} label={`${d.icon} ${d.label}: ${money(d.price)}`}
              hint={`${d.desc} · upkeep ${money(d.upkeep)}/yr`} confirm={`Confirm: buy for ${money(d.price)}`} />
          );
        })}
      </div>
      <p className="hint">Gear passes down to your children with the family estate.</p>
    </Section>
  );
}
