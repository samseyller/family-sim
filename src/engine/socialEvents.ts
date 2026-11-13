/** Friends: lunches, neighbors, school friends, a friend in need, weddings. */
import { cityName, cityOf, isNear, myCity } from './location';
import { afterTogether, canMakeFriends, friendsOf, makeFriend } from './friends';
import { makeAdultStranger } from './generate';
import { marry } from './family';
import { adjustBond, ageOf, getBond, money, partnerOf, stat } from './util';
import { age, one, wallet, type EventDef } from './eventKit';
import { HAS_COWORKERS, workplace } from './careerEvents';
import { charge, credit, hasCash } from './money';

export const FRIEND_EVENTS: EventDef[] = [
  // ── Friends ───────────────────────────────────────────────────────
  {
    id: 'coworker_lunch',
    major: false,
    work: true,
    cooldown: 6,
    // Only where you have everyday coworkers (not on deployment, on tour, or running your own shop).
    candidates: (c) => one(age(c, c.me) >= 18 && HAS_COWORKERS.includes(workplace(c) as never) && canMakeFriends(c.s, c.me), 0.3),
    build: () => ({
      title: 'Lunch invitation',
      text: 'A coworker you get along with asks if you want to grab lunch sometime.',
      choices: [
        { id: 'yes', label: 'Sure, let’s do it', hint: 'Could become a real friend' },
        { id: 'no', label: 'Politely decline' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch !== 'yes') return 'You ate at your desk. Again.';
      const f = makeFriend(c.s, c.rng, c.me, 'from work');
      return f ? `Lunch with ${f.firstName} became a weekly thing.` : 'A nice lunch, nothing more.';
    },
  },
  {
    id: 'new_neighbor',
    major: false,
    cooldown: 4,
    // Much likelier right after a move to a new city.
    candidates: (c) => one(age(c, c.me) >= 18 && canMakeFriends(c.s, c.me), (c.me.flags.moved_year ?? -9) >= c.s.year - 1 ? 4 : 0.5),
    build: (c) => ({
      title: 'The neighbors',
      text: `Someone from next door knocks with a plate of cookies${(c.me.flags.moved_year ?? -9) >= c.s.year - 1 ? `: "Welcome to ${cityName(myCity(c.s))}!"` : '.'}`,
      choices: [
        { id: 'invite', label: 'Invite them in for coffee', hint: 'Could become a friend' },
        { id: 'thanks', label: 'Thank them at the door' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch !== 'invite') return 'Delicious cookies. You wave when you see each other now.';
      const f = makeFriend(c.s, c.rng, c.me, 'next-door neighbor');
      return f ? `Coffee turned into dinner. ${f.firstName} is great.` : 'A pleasant chat.';
    },
  },
  {
    id: 'school_friend',
    stage: 'any',
    major: false,
    cooldown: 2,
    candidates: (c) => one(age(c, c.me) >= 6 && age(c, c.me) <= 17 && canMakeFriends(c.s, c.me) && friendsOf(c.s, c.me).length < 5, 2),
    build: () => ({
      title: 'Someone new at school',
      text: 'The new kid in class laughs at all your jokes.',
      choices: [
        { id: 'sit', label: 'Sit with them at lunch' },
        { id: 'no', label: 'Stick with your usual group' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch !== 'sit') return 'Maybe tomorrow.';
      const f = makeFriend(c.s, c.rng, c.me, 'from school');
      return f ? `You and ${f.firstName} are inseparable now.` : 'You had a good laugh.';
    },
  },
  {
    id: 'friend_in_need',
    major: false,
    cooldown: 4,
    candidates: (c) => friendsOf(c.s, c.me)
      .filter((f) => isNear(c.s, f) && getBond(c.s, c.me.id, f.id).affinity >= 15 && ageOf(f, c.s.year) >= 18 && age(c, c.me) >= 18)
      .slice(0, 3).map((f) => ({ subject: f, weight: 0.6 })),
    build: (c, f) => ({
      title: 'A friend in need',
      text: `${f!.firstName} lost their job and is embarrassed to ask, but could you lend them $2,000 for rent?`,
      choices: [
        { id: 'lend', label: 'Lend the money', hint: 'Friends remember this', disabled: !hasCash(wallet(c), 2000) },
        { id: 'help', label: 'Help them job-hunt instead', hint: 'Time, not money' },
        { id: 'no', label: 'Say you can’t right now' },
      ],
    }),
    resolve: (c, ch, f) => {
      if (ch === 'lend') {
        charge(wallet(c), 2000);
        adjustBond(c.s, c.me.id, f!.id, 12, 12);
        afterTogether(c.s, c.me, f!);
        // Half the time it comes back with interest in gratitude.
        if (c.rng.chance(0.5)) {
          credit(wallet(c), 2000);
          return `${f!.firstName} found work two months later and paid you back with a thank-you dinner.`;
        }
        return `${f!.firstName} is still getting back on their feet. You never mention the money.`;
      }
      if (ch === 'help') {
        adjustBond(c.s, c.me.id, f!.id, 6, 5);
        afterTogether(c.s, c.me, f!);
        return `You spent a weekend polishing ${f!.firstName}'s résumé. They got two interviews.`;
      }
      adjustBond(c.s, c.me.id, f!.id, -6, -8);
      return `${f!.firstName} said they understood. Things felt a little stiff after.`;
    },
  },
  {
    id: 'friend_wedding',
    major: false,
    cooldown: 3,
    candidates: (c) => friendsOf(c.s, c.me)
      .filter((f) => !partnerOf(c.s, f.id) && ageOf(f, c.s.year) >= 22 && ageOf(f, c.s.year) <= 50 && getBond(c.s, c.me.id, f.id).affinity >= 25 && age(c, c.me) >= 18)
      .slice(0, 3).map((f) => ({ subject: f, weight: 0.5 })),
    build: (c, f) => {
      const far = !isNear(c.s, f!);
      const cost = far ? 1200 : 300;
      return {
        title: `${f!.firstName} is getting married!`,
        text: `${f!.firstName} wants you there for the big day${far ? ` in ${cityName(cityOf(c.s, f!))}` : ''}.`,
        choices: [
          { id: 'go', label: `Go to the wedding (${money(cost)}${far ? ' with travel' : ''})`, disabled: !hasCash(wallet(c), cost) },
          { id: 'gift', label: 'Send a gift and your regrets ($150)' },
          { id: 'skip', label: 'Skip it' },
        ],
      };
    },
    resolve: (c, ch, f) => {
      const spouse = makeAdultStranger(c.s, c.rng, f!);
      marry(c.s, f!, spouse);
      if (ch === 'go') {
        charge(wallet(c), isNear(c.s, f!) ? 300 : 1200);
        adjustBond(c.s, c.me.id, f!.id, 10, 6);
        afterTogether(c.s, c.me, f!);
        stat(c.me, 'happiness', 5);
        return `You gave a toast that made ${f!.firstName} cry (the good kind).`;
      }
      if (ch === 'gift') {
        charge(wallet(c), 150);
        adjustBond(c.s, c.me.id, f!.id, 2, 1);
        return `${f!.firstName} sent a sweet thank-you card.`;
      }
      adjustBond(c.s, c.me.id, f!.id, -8, -5);
      return `${f!.firstName} noticed the empty seat.`;
    },
  },

];
