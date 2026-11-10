import { cityOfHousehold } from '../../engine/location';
import { useEffect, useState } from 'react';
import { HOMES, RENTALS, type HomeTier } from '../../content/finance';
import {
  ELDERLY_AGE, INVITE_AFFINITY, headLabel, homeUpfrontCash, householdBlocker, householdView, invitable, moveOutPreview, shareAmounts,
  moverGroup, type HouseholdAction,
} from '../../engine/household';
import type { GameState, Person } from '../../engine/types';
import { active, ageOf, getBond, membersOf, money, parentsOf, partnerOf } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { Section } from '../components';

/** A household action button: disabled with the reason when it can't happen; optional two-step confirm. */
function HAct({ g, action, label, hint, confirm }: { g: GameState; action: HouseholdAction; label: string; hint?: string; confirm?: string }) {
  const household = useGame((s) => s.household);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  const blocker = householdBlocker(g, action);
  return (
    <button
      className={`choice money-act${armed ? ' armed' : ''}`}
      disabled={!!blocker}
      title={blocker ?? undefined}
      onClick={() => {
        if (confirm && !armed) return setArmed(true);
        setArmed(false);
        household(action);
      }}
    >
      <span>{armed ? `✔ ${confirm}` : label}</span>
      <span className="hint">{blocker ?? hint}</span>
    </button>
  );
}

const pct = (f: number) => `${Math.round(f * 100)}%`;

function relation(g: GameState, p: Person) {
  const me = active(g);
  const pt = partnerOf(g, me.id);
  if (p.id === me.id) return 'you';
  if (p.id === pt?.id) return 'partner';
  if (parentsOf(g, me).some((x) => x.id === p.id)) return 'parent';
  if (pt && parentsOf(g, pt).some((x) => x.id === p.id)) return 'parent-in-law';
  if (p.biologicalParents.includes(me.id) || p.adoptiveParents.includes(me.id)) return 'child';
  if (pt && (p.biologicalParents.includes(pt.id) || p.adoptiveParents.includes(pt.id))) return 'stepchild';
  if (parentsOf(g, p).some((x) => x.biologicalParents.includes(me.id) || x.adoptiveParents.includes(me.id))) return 'grandchild';
  return 'family';
}

/** Leaving a household you don't run: who comes, and what money goes with you. */
function MoveOutPanel({ g }: { g: GameState }) {
  const me = active(g);
  const view = householdView(g);
  const [bring, setBring] = useState<string[]>([]);
  const [take, setTake] = useState<'share' | 'savings'>('share');
  const prev = moveOutPreview(g, bring);
  const others = prev.group.filter((p) => p.id !== me.id);
  const shareTotal = prev.share.cash + prev.share.invest;
  const tier = Object.values(RENTALS).find((r) => r.capacity >= prev.group.length) ?? RENTALS.house;
  return (
    <div className="move-out">
      <div className="label">Who comes with you</div>
      <p className="hint">
        {others.length ? `${others.map((p) => `${p.firstName} (${relation(g, p)}${ageOf(p, g.year) < 18 ? `, ${ageOf(p, g.year)}` : ''})`).join(', ')} ${others.length === 1 ? 'comes' : 'come'} with you.` : 'Just you.'}
        {' '}Your partner and children under 18 always move with you.
      </p>
      {view.adultKids.map((k) => (
        <label key={k.id} className="toggle">
          <input type="checkbox" checked={bring.includes(k.id)} onChange={(e) => setBring(e.target.checked ? [...bring, k.id] : bring.filter((x) => x !== k.id))} />
          Bring {k.firstName} ({ageOf(k, g.year)}){moverGroup(g, k).length > 1 ? ' and their family' : ''}
        </label>
      ))}
      <div className="label">Money</div>
      <div className="choices">
        <label className="toggle">
          <input type="radio" name="take" checked={take === 'share'} onChange={() => setTake('share')} />
          Take your share: {money(shareTotal)} ({pct(prev.share.fraction)} of the savings{prev.share.invest ? `, ${money(prev.share.invest)} of it invested` : ''})
        </label>
        <label className="toggle">
          <input type="radio" name="take" checked={take === 'savings'} onChange={() => setTake('savings')} />
          Leave the shared savings behind: they’ll appreciate it
        </label>
      </div>
      <p className="hint">
        Your own savings ({money(prev.savings)}) come either way. You start out renting ({tier.label.toLowerCase()}, {money(tier.rent)}/yr) and can buy a
        home next year. The house stays with {headLabel(g, view.head)}. Moving costs $2,000.
      </p>
      <HAct g={g} action={{ kind: 'moveOut', bring, take }} label="🧳 Move out" confirm={`Confirm: move out${take === 'share' ? ` with ${money(shareTotal + prev.savings)}` : ''}`} />
    </div>
  );
}

/** Who runs the home, everyone's share of the savings, and moves in or out. */
export function HouseholdCard({ g }: { g: GameState }) {
  const me = active(g);
  const hh = g.households[me.householdId];
  const view = householdView(g);
  const [leaving, setLeaving] = useState(false);
  const adults = membersOf(g, hh.id).filter((p) => ageOf(p, g.year) >= 18);
  const cheapestHome = (Object.keys(HOMES) as HomeTier[])[0];
  const guests = invitable(g);

  return (
    <Section title="👪 Household" aside={<span className="hint">Run by {headLabel(g, view.head)}</span>}>
      <p className="hint">Everyone’s pay goes into the shared savings. Each adult’s share grows with what they bring in, and goes with them if they leave.</p>
      {adults.map((p) => {
        const f = shareAmounts(g, hh.id, [p]);
        return (
          <div key={p.id} className="row">
            <span>{p.id === me.id ? 'You' : p.firstName} <span className="hint">({relation(g, p)}, {ageOf(p, g.year)})</span></span>
            <span>{pct(f.fraction)} · {money(f.cash + f.invest)}</span>
          </div>
        );
      })}

      {!view.runs && (
        <>
          <div className="label">Your options</div>
          <div className="choices">
            <HAct g={g} action={{ kind: 'takeCharge' }} label="🗝️ Take charge of the household"
              hint={`You decide who lives here and keep the home; possible once a parent is ${ELDERLY_AGE}+ or you bring in most of the money`} />
            {!leaving && (
              <button className="choice money-act" onClick={() => setLeaving(true)} disabled={g.phase !== 'PLANNING'}>
                <span>🧳 Move out…</span>
                <span className="hint">Start your own household, with your share of the savings</span>
              </button>
            )}
          </div>
          {leaving && <MoveOutPanel g={g} />}
        </>
      )}

      {view.runs && view.parents.length > 0 && (
        <>
          <div className="label">Your parents here</div>
          <div className="choices">
            <HAct g={g} action={{ kind: 'parentsOut', buy: cheapestHome }}
              label={`🏠 Buy them a ${HOMES[cheapestHome].label.toLowerCase()} (${money(homeUpfrontCash(cheapestHome, cityOfHousehold(hh)))})`}
              hint="They move into a home of their own, paid in full, with their share of the savings" confirm="Confirm: buy them a home" />
            <HAct g={g} action={{ kind: 'parentsOut', buy: null }} label="🚪 Ask them to move out"
              hint="They rent a place with their share of the savings. They won’t take it well." confirm="Confirm: ask them to leave" />
          </div>
        </>
      )}

      {view.runs && view.adultKids.map((k) => {
        const theirs = shareAmounts(g, hh.id, moverGroup(g, k));
        const family = moverGroup(g, k).length > 1;
        return (
          <div key={k.id} className="car-row">
            <div className="row"><span>{k.firstName} ({ageOf(k, g.year)}){family ? ' and their family' : ''}</span><span className="hint">{k.jobId ? 'working' : k.studyingUntil ? 'studying' : 'no job'}</span></div>
            <div className="money-grid">
              <HAct g={g} action={{ kind: 'askToLeave', personId: k.id, gift: 0 }} label="Ask to move out" hint="No money: it will sting" confirm={`Confirm: ${k.firstName} moves out`} />
              <HAct g={g} action={{ kind: 'askToLeave', personId: k.id, gift: 5000 }} label="…with $5,000" confirm={`Confirm: ${k.firstName} moves out`} />
              <HAct g={g} action={{ kind: 'askToLeave', personId: k.id, gift: 15000 }} label="…with $15,000" confirm={`Confirm: ${k.firstName} moves out`} />
              {theirs.cash + theirs.invest > 0 && (
                <HAct g={g} action={{ kind: 'askToLeave', personId: k.id, gift: 'share' }} label={`…with their share (${money(theirs.cash + theirs.invest)})`} confirm={`Confirm: ${k.firstName} moves out`} />
              )}
            </div>
          </div>
        );
      })}

      {view.runs && guests.length > 0 && (
        <>
          <div className="label">Invite family to live with you</div>
          <div className="choices">
            {guests.map((p) => {
              const others = membersOf(g, p.householdId).filter((x) => x.id !== p.id);
              const aff = Math.round(getBond(g, me.id, p.id).affinity);
              return (
                <HAct key={p.id} g={g} action={{ kind: 'invite', personId: p.id }}
                  label={`🏡 Invite ${p.firstName} (${relation(g, p)}, ${ageOf(p, g.year)})${others.length ? ` and ${others.length} more` : ''}`}
                  hint={`Relationship ${aff} (needs ${INVITE_AFFINITY}). Everyone in their home moves in; their home is sold and the money joins yours.`}
                  confirm={`Confirm: invite ${p.firstName}`} />
              );
            })}
          </div>
        </>
      )}
    </Section>
  );
}
