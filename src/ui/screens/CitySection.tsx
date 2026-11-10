import { useState, type ReactElement } from 'react';
import { CITIES, CITY_IDS, TRANSIT_BY_CITY, type CityDef } from '../../content/cities';
import { relocationCost, type FinanceAction } from '../../engine/finance';
import { friendsOf } from '../../engine/friends';
import { cityOf, cityOfHousehold, homePriceIn } from '../../engine/location';
import type { GameState } from '../../engine/types';
import { active, alive, childrenOf, membersOf, money, parentsOf } from '../../engine/util';
import { Section } from '../components';

type ActFn = (p: { g: GameState; action: FinanceAction; label: string; hint?: string; confirm?: string }) => ReactElement;

const pct = (x: number) => `${x >= 1 ? '+' : '−'}${Math.round(Math.abs(x - 1) * 100)}%`;
const TRANSIT = { great: 'great transit', good: 'good transit', poor: 'car country' } as const;

function Facts({ c }: { c: CityDef }) {
  return (
    <span className="hint">
      Pay {pct(c.pay)} · homes {pct(c.housing)} · living {pct(c.living)} · {TRANSIT[c.transit]}
    </span>
  );
}

/** Where you live, what it means for money, and moving to another city. */
export function CitySection({ g, Act }: { g: GameState; Act: ActFn }) {
  const me = active(g);
  const hh = g.households[me.householdId];
  const here = cityOfHousehold(hh);
  const c = CITIES[here];
  const [open, setOpen] = useState(false);
  // Who lives where: family and friends nearby make a city feel like home.
  const people = [...parentsOf(g, me), ...childrenOf(g, me.id), ...friendsOf(g, me)].filter((p) => alive(p) && p.householdId !== hh.id);
  const count = (city: string) => people.filter((p) => cityOf(g, p) === city).length;
  const working = membersOf(g, hh.id).filter((p) => p.jobId || p.partJobId).length;

  return (
    <Section title={`${c.icon} ${c.name}, ${c.state}`} aside={<span className="hint">{count(here)} family & friends nearby</span>}>
      <p className="hint">{c.blurb}.</p>
      <Facts c={c} />
      <p className="hint">Without a car, getting to work costs {money(TRANSIT_BY_CITY[c.transit])} a year here.</p>
      {!open ? (
        <button className="small" onClick={() => setOpen(true)}>🧳 Compare cities and move…</button>
      ) : (
        <>
          <p className="notice">
            Moving costs {money(relocationCost(g, hh))}. {hh.assets.some((a) => a.kind === 'house') ? 'Your home will be sold. ' : ''}
            {working ? 'Everyone who works here leaves their job and has to find a new one. ' : ''}
            Kids change schools. Friends who stay behind can still call and play games online.
          </p>
          <div className="choices">
            {CITY_IDS.filter((id) => id !== here).map((id) => {
              const d = CITIES[id];
              const n = count(id);
              return (
                <Act key={id} g={g} action={{ kind: 'moveCity', city: id }}
                  label={`${d.icon} ${d.name}, ${d.state}${n ? ` · ${n} family & friends there` : ''}`}
                  hint={`Pay ${pct(d.pay)} · family home ${money(homePriceIn('family', id))} · ${TRANSIT[d.transit]}`}
                  confirm={`Confirm: move to ${d.name}`} />
              );
            })}
          </div>
          <button className="small" onClick={() => setOpen(false)}>Close</button>
        </>
      )}
    </Section>
  );
}
