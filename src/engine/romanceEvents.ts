/** Getting caught seeing someone else (scheduled by dating while you're in a relationship). */
import { breakUp, separate, startDating } from './family';
import type { Ctx, EventDef } from './eventKit';
import type { Person } from './types';
import { activePartnership, adjustBond, alive, flag, getBond, journal, kidsAtHome, stat } from './util';

/** End things with your partner: a spouse separates (the divorce comes later); dating ends. */
function endWith(c: Ctx, p: Person) {
  const ps = activePartnership(c.s, c.me.id);
  if (!ps) return;
  if (ps.status === 'married') {
    separate(c.s, c.me, p);
    c.me.flags.separated_year = c.s.year;
    for (const k of kidsAtHome(c.s, c.me)) { flag(k, 'parents_divorced'); stat(k, 'happiness', -10); }
  } else if (p.householdId === c.me.householdId) {
    separate(c.s, c.me, p);
    ps.status = 'ended';
    ps.endYear = c.s.year;
  } else breakUp(c.s, c.me, p);
}

const secret = (c: Ctx) => {
  const sp = c.me.secretPartnerId ? c.s.people[c.me.secretPartnerId] : undefined;
  return sp && alive(sp) ? sp : undefined;
};

export const ROMANCE_EVENTS: EventDef[] = [
  {
    id: 'caught_cheating',
    major: true,
    cooldown: 0,
    build: (c, p) => {
      const sp = secret(c);
      return {
        title: 'Found out',
        text: `${p!.firstName} saw the messages. ${sp ? `They know about ${sp.firstName}.` : 'They know you have been going on dates behind their back.'} The silence at dinner is deafening.`,
        choices: [
          { id: 'apologize', label: 'Apologize, and promise it is over', hint: 'Trust takes a huge hit; they may leave anyway' },
          ...(sp ? [{ id: 'leave', label: `Leave ${p!.firstName} for ${sp.firstName}` }] : []),
          { id: 'end', label: 'Let them go', hint: 'It is over' },
        ],
      };
    },
    resolve: (c, ch, p) => {
      const partner = p!;
      const sp = secret(c);
      c.me.flags.sneaking = 0;
      flag(c.me, 'caught');
      stat(c.me, 'stress', 10);
      if (ch === 'apologize') {
        c.me.secretPartnerId = undefined;
        adjustBond(c.s, c.me.id, partner.id, -35, -45);
        const b = getBond(c.s, c.me.id, partner.id);
        // Whether they stay depends on how much love and trust were there to begin with.
        if (c.rng.chance(Math.min(0.85, Math.max(0.1, 0.45 + b.affinity / 150 + b.trust / 200)))) {
          return `${partner.firstName} is staying, for now. It will take a long time to earn back their trust.`;
        }
        endWith(c, partner);
        journal(c.s, `${partner.firstName} left you after finding out.`, 'major');
        return `${partner.firstName} couldn't get past it, and left.`;
      }
      endWith(c, partner);
      adjustBond(c.s, c.me.id, partner.id, -30, -40);
      if (ch === 'leave' && sp) {
        c.me.secretPartnerId = undefined;
        startDating(c.s, c.me, sp);
        journal(c.s, `You left ${partner.firstName} for ${sp.firstName}.`, 'major');
        return `It was messy and painful. Now you and ${sp.firstName} are together, out in the open.`;
      }
      c.me.secretPartnerId = undefined;
      journal(c.s, `You and ${partner.firstName} split up after they found out.`, 'major');
      return `${partner.firstName} packed a bag that night. It's over.`;
    },
  },
];
