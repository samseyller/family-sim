/** Activities: Love and dating: meeting someone, time with your partner, and exes. */
import type { Person } from './types';
import { active, activePartnership, adjustBond, ageOf, flag, getBond, journal, membersOf, partnerOf, stat } from './util';
import { breakUp, mergeHouseholds, startDating } from './family';
import { shareAmounts, splitOff } from './household';
import { canConceive, carrierOf, conceive, isSingle, pregnancyChance, TRY_FOR_BABY_CHANCE } from './romance';
import { type ActivityDef, flat, bondAll, moodAll, attached, tryToMeet } from './activityKit';

export const ROMANCE_ACTIVITIES: ActivityDef[] = [
  // 💘 Love & dating — meeting someone (if you are already seeing someone, it is sneaking around)
  {
    id: 'dating_app', category: 'romance', icon: '📱', label: 'Try a dating app', who: 'solo', warning: attached, desc: 'Swipe, chat, maybe meet up.',
    energy: flat(6), cost: flat(30),
    run: (c) => tryToMeet(c, 0.35, 'through a dating app', [
      'Three matches, two ghosted you, one only talked about crypto.',
      'You matched with your cousin’s ex. You deleted the app for a week.',
    ]),
  },
  {
    id: 'speed_dating', category: 'romance', icon: '⏱️', label: 'Speed dating', who: 'solo', warning: attached, desc: 'Twelve five-minute conversations.',
    energy: flat(10), cost: flat(45),
    run: (c) => tryToMeet(c, 0.45, 'at a speed-dating night', [
      'The bell kept ringing right when things got interesting.',
      'You learned a lot about other people’s pets. No sparks tonight.',
    ]),
  },
  {
    id: 'blind_date', category: 'romance', icon: '🙈', label: 'Blind date', who: 'solo', warning: attached, desc: 'A friend swears you two are perfect for each other.',
    energy: flat(8), cost: flat(80),
    run: (c) => tryToMeet(c, 0.4, 'on a blind date', [
      'Your friend has a very different idea of "perfect for you."',
      'Nice dinner, polite handshake, no second date.',
    ]),
  },
  {
    id: 'dance_class', category: 'romance', icon: '💃', label: 'Take a dance class', who: 'solo', warning: attached, desc: 'Learn to salsa, and maybe meet someone.',
    energy: flat(12), cost: flat(200),
    run: (c) => {
      stat(c.me, 'fitness', 2);
      stat(c.me, 'happiness', 3);
      return tryToMeet(c, 0.3, 'in a dance class', ['You stepped on a lot of toes, but you can almost salsa now.']);
    },
  },

  // 💘 Love & dating — with your partner
  {
    id: 'date_night', category: 'romance', icon: '🌹', label: 'Date night', who: 'partner', max: 1, desc: 'Dinner for two.',
    energy: flat(10), cost: flat(120),
    run: (c) => { bondAll(c, 7, 4); moodAll(c, 'happiness', 3); return { text: `You and ${c.people[0].firstName} closed down the restaurant.`, tone: 'good' }; },
  },
  {
    id: 'picnic', category: 'romance', icon: '🧺', label: 'Picnic in the park', who: 'partner', max: 1, desc: 'Sandwiches, sunshine, no phones.',
    energy: flat(6), cost: flat(25),
    run: (c) => {
      bondAll(c, 5, 3);
      if (c.rng.chance(0.2)) return { text: 'It poured. You ate under a tree, soaked and laughing.', tone: 'good' };
      moodAll(c, 'stress', -3);
      return { text: `You and ${c.people[0].firstName} watched the clouds until sunset.`, tone: 'good' };
    },
  },
  {
    id: 'concert_date', category: 'romance', icon: '🎸', label: 'Concert date', who: 'partner', max: 1, desc: 'Loud music, sticky floors, one great night.',
    energy: flat(12), cost: flat(250),
    run: (c) => { bondAll(c, 6, 3); moodAll(c, 'happiness', 5); return { text: `You and ${c.people[0].firstName} sang every word. Your ears are still ringing.`, tone: 'good' }; },
  },
  {
    id: 'weekend_getaway', category: 'romance', icon: '🏖️', label: 'Weekend getaway', who: 'partner', max: 1, perYear: 2, desc: 'Two nights somewhere new, just the two of you.',
    energy: flat(18), cost: flat(1500),
    run: (c) => {
      bondAll(c, 10, 6);
      moodAll(c, 'stress', -8);
      moodAll(c, 'happiness', 5);
      return { text: `A cabin, a lake, and ${c.people[0].firstName}. You came back a little more in love.`, tone: 'good' };
    },
  },
  {
    id: 'try_for_baby', category: 'romance', icon: '👶', label: 'Try for a baby', who: 'partner', max: 1, perYear: 4,
    desc: 'Married and ready: a much better chance of a baby than leaving it to luck.',
    energy: flat(8), cost: flat(0),
    eligible: (s, p) => {
      const me = active(s);
      return activePartnership(s, me.id)?.status === 'married' && p.householdId === me.householdId && canConceive(s, me, p);
    },
    run: (c) => {
      const p = c.people[0];
      bondAll(c, 6, 5);
      moodAll(c, 'stress', -2);
      flag(c.me, 'romantic_nights');
      if (canConceive(c.s, c.me, p) && c.rng.chance(TRY_FOR_BABY_CHANCE)) {
        const carrier = carrierOf(c.s, c.me, p)!;
        c.s.households[c.me.householdId].pendingBirth = { year: c.s.year + 1, parents: [carrier.id, carrier.id === c.me.id ? p.id : c.me.id] };
        moodAll(c, 'happiness', 8);
        journal(c.s, `You and ${p.firstName} are expecting a baby!`, 'major');
        return { text: `A few weeks later: two pink lines. You and ${p.firstName} just stared at each other, grinning.`, tone: 'good' };
      }
      moodAll(c, 'happiness', 3);
      return { text: 'Not this time. There is always next month.', tone: 'neutral' };
    },
  },
  {
    id: 'spend_the_night', category: 'romance', icon: '🌙', label: 'Make love', who: 'partner', max: 1, perYear: 4,
    desc: 'Things get romantic. There’s always some chance of a pregnancy.',
    energy: flat(8), cost: flat(0),
    eligible: (s, p) => getBond(s, active(s).id, p.id).affinity >= 20,
    run: (c) => {
      const p = c.people[0];
      bondAll(c, 6, 4);
      moodAll(c, 'happiness', 4);
      moodAll(c, 'stress', -3);
      flag(c.me, 'romantic_nights');
      if (canConceive(c.s, c.me, p) && c.rng.chance(pregnancyChance(c.s, c.me))) {
        conceive(c.s, c.rng, c.me, p);
        return { text: `A wonderful night with ${p.firstName}. A few weeks later, a surprise: a positive pregnancy test.`, tone: 'neutral' };
      }
      return { text: `A wonderful night with ${p.firstName}. Breakfast in bed the next morning.`, tone: 'good' };
    },
  },
  {
    id: 'move_in_together', category: 'romance', icon: '🔑', label: 'Move in together', who: 'partner', max: 1,
    desc: 'Share a home (and the bills). Their household joins yours.',
    energy: flat(10), cost: flat(2000),
    eligible: (s, p) => {
      const me = active(s);
      return activePartnership(s, me.id)?.status === 'dating' && p.householdId !== me.householdId && getBond(s, me.id, p.id).affinity >= 40;
    },
    run: (c) => {
      const p = c.people[0];
      mergeHouseholds(c.s, p.householdId, c.me.householdId);
      bondAll(c, 6, 5);
      moodAll(c, 'happiness', 5);
      journal(c.s, `${p.firstName} moved in with you.`, 'major');
      return { text: `Boxes everywhere, and ${p.firstName}'s mug next to yours.`, tone: 'good' };
    },
  },
  {
    id: 'break_up', category: 'romance', icon: '💔', label: 'Break up', who: 'partner', max: 1, desc: 'End a dating relationship. (Married couples separate through life events.)',
    energy: flat(4), cost: flat(0),
    eligible: (s) => activePartnership(s, active(s).id)?.status === 'dating',
    run: (c) => {
      const p = c.people[0];
      breakUp(c.s, c.me, p);
      // If they lived with you, they move back out.
      if (p.householdId === c.me.householdId) {
        // They leave with their own young kids (not yours) and their share of the savings.
        const mine = (k: Person) => k.biologicalParents.includes(c.me.id) || k.adoptiveParents.includes(c.me.id);
        const group = [p, ...membersOf(c.s, p.householdId).filter((k) => ageOf(k, c.s.year) < 18 && !mine(k) && (k.biologicalParents.includes(p.id) || k.adoptiveParents.includes(p.id)))];
        const share = shareAmounts(c.s, p.householdId, group);
        splitOff(c.s, group, share.cash, share.invest);
      }
      stat(c.me, 'happiness', -4);
      journal(c.s, `You and ${p.firstName} broke up.`, 'info');
      return { text: `A hard conversation with ${p.firstName}. It was the right call, but it still hurts.`, tone: 'neutral' };
    },
  },

  // 💘 Love & dating — exes
  {
    id: 'coffee_ex', category: 'romance', icon: '☕', label: 'Coffee with an ex', who: 'ex', max: 1, desc: 'Catch up with someone you used to date.',
    energy: flat(6), cost: flat(15),
    run: (c) => {
      const ex = c.people[0];
      bondAll(c, 5, 3);
      const spark = isSingle(c.s, c.me) && isSingle(c.s, ex) && getBond(c.s, c.me.id, ex.id).affinity >= 25;
      if (spark && c.rng.chance(0.35)) {
        startDating(c.s, c.me, ex);
        flag(c.me, 'rekindled');
        stat(c.me, 'happiness', 8);
        journal(c.s, `You and ${ex.firstName} are back together.`, 'major');
        return { text: `One coffee turned into dinner. You and ${ex.firstName} are giving it another try.`, tone: 'good' };
      }
      return { text: `You and ${ex.firstName} laughed about old times. It felt good to be friends.`, tone: 'good' };
    },
  },
  {
    id: 'text_ex', category: 'romance', icon: '💬', label: 'Late-night text to an ex', who: 'ex', max: 1, desc: '"u up?" What could go wrong?',
    energy: flat(2), cost: flat(0),
    run: (c) => {
      const ex = c.people[0];
      const partner = partnerOf(c.s, c.me.id);
      if (partner && c.rng.chance(0.35)) {
        adjustBond(c.s, c.me.id, partner.id, -12, -12);
        stat(c.me, 'stress', 6);
        return { text: `${partner.firstName} saw the message. That was a long, awkward week.`, tone: 'bad' };
      }
      if (c.rng.chance(0.5)) {
        adjustBond(c.s, c.me.id, ex.id, 4, 1);
        return { text: `${ex.firstName} replied with a laughing emoji and a memory you'd forgotten.`, tone: 'good' };
      }
      adjustBond(c.s, c.me.id, ex.id, -3, -2);
      return { text: `Left on read. You put the phone face-down and stared at the ceiling.`, tone: 'neutral' };
    },
  },

];
