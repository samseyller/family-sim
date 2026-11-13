import type { ReactElement } from 'react';
import { ACTIVITY_BY_ID, activityBlocker, candidatesFor, distanceOf, relativesOutside } from '../../engine/activities';
import { harmFrom, harmText } from '../../engine/relationships';
import { separatedFrom } from '../../engine/family';
import { friendship, isDistant } from '../../engine/friends';
import { householdBlocker, invitable, type HouseholdAction } from '../../engine/household';
import { isNear } from '../../engine/location';
import { isSibling, relationBlocker, siblingLeaveChance, type RelationAction } from '../../engine/relations';
import type { GameState, Person } from '../../engine/types';
import { active, activePartnership, ageOf, money } from '../../engine/util';
import { useGame } from '../../store/gameStore';
import { TRY_FOR_BABY_CHANCE } from '../../engine/romance';
import { ActionButton, Reveal } from '../components';

/** Actions that fit who this person is to you, behind an "Options" toggle (hidden if there are none). */
export function PersonOptions({ g, p }: { g: GameState; p: Person }) {
  const me = active(g);
  const relation = useGame((s) => s.relation);
  const household = useGame((s) => s.household);
  const activity = useGame((s) => s.activity);
  const out: ReactElement[] = [];
  const rel = (a: RelationAction, label: string, hint: string, confirm: string) =>
    out.push(<ActionButton key={a.kind} label={label} hint={hint} confirm={confirm} blocker={relationBlocker(g, a)} onClick={() => relation(a)} />);
  const hh = (a: HouseholdAction, key: string, label: string, hint: string, confirm?: string) =>
    out.push(<ActionButton key={key} label={label} hint={hint} confirm={confirm} blocker={householdBlocker(g, a)} onClick={() => household(a)} />);
  const act = (id: string, label: string, hint: string) =>
    out.push(<ActionButton key={id} label={label} hint={hint} blocker={activityBlocker(g, id, [p.id])} onClick={() => activity(id, [p.id])} />);

  // Anyone close: talk, listen, and own a mistake.
  if (candidatesFor(g, ACTIVITY_BY_ID.check_in).some((x) => x.id === p.id)) {
    act('check_in', `💬 Check in with ${p.firstName}`, 'See how they’re really doing');
    if (!p.flags.pref_known) act('ask_need', '🤲 Ask what they need', 'Learn how they like to be supported');
    const harm = harmFrom(p, me.id);
    if (harm) act('apologize', '🕊️ Apologize', `For ${harmText(harm)}`);
  }

  const ps = activePartnership(g, me.id);
  const isPartner = !!ps && (ps.a === p.id || ps.b === p.id);
  const parents = [...me.biologicalParents, ...me.adoptiveParents];
  const isParent = parents.includes(p.id);
  const isChild = p.biologicalParents.includes(me.id) || p.adoptiveParents.includes(me.id);
  const atHome = p.householdId === me.householdId;
  const adult = ageOf(p, g.year) >= 18;

  if (isPartner && (ps!.status === 'dating' || ps!.status === 'married')) {
    act('date_night', '🍷 Date night', 'Dinner out, just the two of you · $120');
    act('spend_the_night', '❤️ Make love', 'Closer than ever (there is always some chance of a baby)');
    if (ps!.status === 'married') act('try_for_baby', '👶 Try for a baby', `About ${Math.round(TRY_FOR_BABY_CHANCE * 100)}% chance each time`);
  }
  if (isPartner && ps!.status === 'dating') rel({ kind: 'breakUp', personId: p.id }, `💔 Break up with ${p.firstName}`, atHome ? 'They move out with half the savings' : 'It’s over', 'Confirm: break up');
  if (isPartner && ps!.status === 'married' && atHome) rel({ kind: 'separate', personId: p.id }, '💔 Separate', `${p.firstName} moves out with half the savings; the divorce comes after`, 'Confirm: separate');
  if (separatedFrom(g, me.id)?.id === p.id) rel({ kind: 'divorce', personId: p.id }, '📝 File for divorce', 'They get half the equity in your home', 'Confirm: divorce');
  if (isParent && atHome) hh({ kind: 'parentsOut', buy: null }, 'parentsOut', '🚪 Ask your parents to find their own place', 'They take their share of the savings and rent', 'Confirm: ask them to leave');
  if (isChild && adult && atHome) {
    hh({ kind: 'askToLeave', personId: p.id, gift: 'share' }, 'leaveShare', `🚪 Ask ${p.firstName} to move out (with their share)`, 'Their partner and kids go too', 'Confirm: ask them to leave');
    hh({ kind: 'askToLeave', personId: p.id, gift: 5000 }, 'leaveGift', `🚪 Ask ${p.firstName} to move out (with $5,000)`, 'A smaller send-off', 'Confirm: ask them to leave');
  }
  if (isSibling(me, p) && adult && atHome) {
    const odds = Math.round(siblingLeaveChance(g, me, p) * 100);
    rel({ kind: 'askSiblingToLeave', personId: p.id }, `🚪 Ask ${p.firstName} to move out`, `About ${odds}% chance they agree; asking hurts their trust either way (more if they refuse)`, 'Confirm: ask them to leave');
  }
  if (!atHome && invitable(g).some((x) => x.id === p.id)) hh({ kind: 'invite', personId: p.id }, 'invite', `🏡 Invite ${p.firstName} to live with you`, 'Everyone in their home moves in; their home is sold');

  // Relatives in another home: jump straight to a visit.
  if (relativesOutside(g, me).some((r) => r.id === p.id)) {
    const cost = (id: string) => money(ACTIVITY_BY_ID[id].cost(g, [p]));
    const dist = distanceOf(g, p);
    if (dist === 'near') act('visit', `🚗 Visit ${p.firstName}`, `Same city · ${cost('visit')}`);
    else if (dist === 'drive') act('visit', `🚗 Drive to see ${p.firstName}`, `A few hours away · ${cost('visit')}`);
    else {
      act('fly_visit', `✈️ Fly to see ${p.firstName}`, `A few days together · ${cost('fly_visit')}`);
      act('visit', `🚗 Drive to see ${p.firstName}`, `A long, tiring drive · ${cost('visit')}`);
    }
  }

  const fs = friendship(g, me, p.id);
  if (fs) {
    act('call_friend', `📞 Call ${p.firstName}`, 'Works anywhere');
    if (isNear(g, p)) act('coffee_friend', '☕ Get coffee', 'Same city only');
    else act('visit_friend', '✈️ Plan a trip to see them', 'Flights and a hotel');
    if (isDistant(g, me, p)) rel({ kind: 'forgetFriend', personId: p.id }, '👋 Let the friendship go', 'They are gone from your list for good', `Confirm: forget ${p.firstName}`);
  }

  if (!out.length) return null;
  return (
    <Reveal label="Options">
      <div className="choices">{out}</div>
    </Reveal>
  );
}
