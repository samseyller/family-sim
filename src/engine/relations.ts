/**
 * Ending relationships from the Family tab: break up with someone you're dating, separate from a
 * spouse (the divorce is settled a year later, or now if you're already apart), and let go of a
 * friend you've drifted apart from. Moving parents or grown children out uses household actions.
 */
import { breakUp, divorce, separate, separatedFrom } from './family';
import { friendship, isDistant } from './friends';
import type { GameState, Person } from './types';
import { active, activePartnership, adjustBond, flag, journal, kidsAtHome, stat } from './util';

export type RelationAction =
  | { kind: 'breakUp'; personId: string }
  | { kind: 'separate'; personId: string }
  | { kind: 'divorce'; personId: string }
  | { kind: 'forgetFriend'; personId: string };

const partnershipWith = (s: GameState, me: Person, id: string) => {
  const ps = activePartnership(s, me.id);
  return ps && (ps.a === id || ps.b === id) ? ps : undefined;
};

export function relationBlocker(s: GameState, a: RelationAction): string | null {
  if (s.phase !== 'PLANNING') return 'Decided while planning.';
  const me = active(s);
  const p = s.people[a.personId];
  if (!p) return 'Unknown person.';
  switch (a.kind) {
    case 'breakUp':
      return partnershipWith(s, me, p.id)?.status === 'dating' ? null : 'You are not dating them.';
    case 'separate':
      if (partnershipWith(s, me, p.id)?.status !== 'married') return 'You are not married to them.';
      return p.householdId === me.householdId ? null : 'You already live apart.';
    case 'divorce':
      return separatedFrom(s, me.id)?.id === p.id ? null : 'Only after separating.';
    case 'forgetFriend':
      if (!friendship(s, me, p.id)) return 'Not a friend.';
      return isDistant(s, me, p) ? null : 'Only friends you have drifted apart from.';
  }
}

/** The kids at home feel it when their parents split up. */
function kidsFeelIt(s: GameState, me: Person) {
  for (const k of kidsAtHome(s, me)) {
    flag(k, 'parents_divorced');
    adjustBond(s, me.id, k.id, -5, -5);
    stat(k, 'happiness', -10);
  }
}

export function relationAction(state: GameState, a: RelationAction): GameState {
  if (relationBlocker(state, a)) return state;
  const s: GameState = structuredClone(state);
  const me = active(s);
  const p = s.people[a.personId];
  switch (a.kind) {
    case 'breakUp': {
      if (p.householdId === me.householdId) {
        // Living together: they move out with half the savings, as in a separation.
        const ps = partnershipWith(s, me, p.id)!;
        separate(s, me, p);
        ps.status = 'ended';
        ps.endYear = s.year;
      } else breakUp(s, me, p);
      stat(me, 'happiness', -4);
      journal(s, `You broke up with ${p.firstName}.`, 'major');
      break;
    }
    case 'separate':
      separate(s, me, p);
      me.flags.separated_year = s.year;
      kidsFeelIt(s, me);
      stat(me, 'happiness', -6);
      journal(s, `You and ${p.firstName} separated. ${p.firstName} moved out; the kids are staying with you.`, 'major');
      break;
    case 'divorce': {
      const paid = divorce(s, me, p);
      journal(s, `You and ${p.firstName} divorced${paid ? `, paying ${p.firstName} half the home equity` : ''}.`, 'major');
      break;
    }
    case 'forgetFriend':
      s.friends = (s.friends ?? []).filter((f) => !(f.of === me.id && f.id === p.id));
      journal(s, `You let your friendship with ${p.firstName} go.`, 'info');
      break;
  }
  return s;
}
