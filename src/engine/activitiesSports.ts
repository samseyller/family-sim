/** Activities: Sports: training, leagues, games, coaching. */
import { SPORTS } from '../content/sports';
import { chooseSport, trainSport } from './sports';
import { active, ageOf, flag, journal, money, stat } from './util';
import { maybeMeetFriend } from './friends';
import { type ActivityDef, flat, names, bondAll, moodAll, needSport, hangOut } from './activityKit';

export const SPORTS_ACTIVITIES: ActivityDef[] = [
  // 🏅 Sports
  {
    id: 'pickup_game', category: 'sports', icon: '🏟️', label: 'Pickup game', who: 'friends', min: 0, max: 5, where: 'near', ages: [8, 90],
    requires: (_s, me) => (me.hobby === 'sports' && me.sport && SPORTS[me.sport].team ? null : 'Needs a team sport.'),
    desc: 'Show up, pick teams, play. Bring friends or meet some.',
    energy: flat(10), cost: flat(10),
    run: (c) => {
      stat(c.me, 'fitness', 3);
      trainSport(c.s, c.me, 2);
      if (!c.people.length) {
        const f = maybeMeetFriend(c.s, c.rng, c.me, 0.25, `playing pickup ${SPORTS[c.me.sport!].label.toLowerCase()}`);
        return { text: f ? `You and ${f.firstName} ended up on the same team, and now you play every week.` : 'A good sweat with strangers.', tone: 'good' };
      }
      return hangOut(c, 5, 3, (who) => `You and ${who} played until it got dark.`);
    },
  },
  {
    id: 'rec_league', category: 'sports', icon: '🥇', label: 'Join a rec league', who: 'solo', perYear: 1, ages: [16, 85],
    requires: needSport, desc: 'A season of games with a team (or a ladder, for solo sports).',
    energy: flat(14), cost: flat(150),
    run: (c) => {
      c.me.flags.league_year = c.s.year;
      stat(c.me, 'fitness', 4);
      stat(c.me, 'happiness', 3);
      trainSport(c.s, c.me, 3);
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.3, 'on your league team');
      return { text: f ? `A fun season, and ${f.firstName} from the team is a real friend now.` : 'A fun season. You never miss a game.', tone: 'good' };
    },
  },
  {
    id: 'sport_event', category: 'sports', icon: '🏁', label: 'Enter a race or tournament', who: 'solo', perYear: 3, ages: [10, 90],
    requires: (_s, me) => (me.hobby === 'sports' && me.sport && !SPORTS[me.sport].team ? null : 'Needs a solo sport (tennis, golf, swimming, running).'),
    desc: 'A marathon, a swim meet, a tournament: entry fee, prizes by skill.',
    energy: flat(16), cost: flat(100),
    run: (c) => {
      const sp = SPORTS[c.me.sport!];
      const skill = c.me.skills.sports ?? 0;
      stat(c.me, 'fitness', 3);
      if (c.me.sport === 'running') flag(c.me, 'marathon');
      if (c.me.sport === 'golf' && c.rng.chance(0.02 + skill / 2000)) {
        flag(c.me, 'hole_in_one');
        journal(c.s, 'A hole-in-one!', 'major');
      }
      if (c.rng.chance(skill / 140)) {
        const prize = Math.round((200 + skill * skill * 0.8) / 50) * 50;
        c.s.households[c.me.householdId].wallet += prize;
        flag(c.me, 'champion');
        return { text: `You won the ${sp.event}! ${money(prize)} in prize money.`, tone: 'good' };
      }
      return { text: c.me.sport === 'running' ? 'You crossed the finish line of the marathon. Legs like jelly, heart full.' : `A solid ${sp.event}. Not your day to win, but close.`, tone: 'good' };
    },
  },
  {
    id: 'private_coach', category: 'sports', icon: '🧑‍🏫', label: 'Hire a private coach', who: 'solo', perYear: 2, ages: [8, 90],
    requires: needSport, desc: 'Personal coaching: a real jump in skill.',
    energy: flat(10), cost: (s) => (ageOf(active(s), s.year) < 18 ? 0 : 1200),
    kidAsk: true,
    run: (c) => {
      trainSport(c.s, c.me, 6);
      return { text: `Your coach fixed one thing in your ${SPORTS[c.me.sport!].label.toLowerCase()} technique, and everything clicked.`, tone: 'good' };
    },
  },
  {
    id: 'coach_kids', category: 'sports', icon: '🧢', label: 'Coach your kid’s team', who: 'kids', max: 3, ages: [18, 80],
    eligible: (s, k) => ageOf(k, s.year) >= 5,
    requires: (_s, me) => ((me.skills.sports ?? 0) >= 15 ? null : 'Needs some sports skill (15+).'),
    desc: 'Volunteer coach: big bonding, and your kids improve (they may take up your sport).',
    energy: flat(14), cost: flat(100),
    run: (c) => {
      for (const k of c.people) {
        if (k.hobby !== 'sports' && c.me.sport) chooseSport(k, c.me.sport);
        trainSport(c.s, k, 4);
      }
      bondAll(c, 7, 5);
      flag(c.me, 'coached');
      trainSport(c.s, c.me, 1);
      return { text: `Orange slices, a whistle, and ${names(c.people)} beaming every time you yelled "nice hustle!"`, tone: 'good' };
    },
  },
  {
    id: 'sports_camp', category: 'sports', icon: '🏕️', label: 'Send kids to sports camp', who: 'kids', max: 2, perYear: 1, ages: [18, 90],
    eligible: (s, k) => ageOf(k, s.year) >= 7 && k.hobby === 'sports',
    desc: 'A week with real coaches: a big skill boost.',
    energy: flat(4), cost: (_s, ppl) => 1500 * Math.max(1, ppl.length),
    run: (c) => {
      for (const k of c.people) { trainSport(c.s, k, 8); stat(k, 'happiness', 5); }
      bondAll(c, 3, 2);
      return { text: `${names(c.people)} came home sunburned, exhausted, and much better.`, tone: 'good' };
    },
  },
  {
    id: 'watch_pro_game', category: 'sports', icon: '🎟️', label: 'Go to a pro game', who: 'household', min: 0, max: 5,
    desc: 'Tickets, hot dogs, and a foam finger.',
    energy: flat(8), cost: (_s, ppl) => 120 * (ppl.length + 1),
    run: (c) => { bondAll(c, 5, 3); moodAll(c, 'happiness', 5); return { text: c.people.length ? `You and ${names(c.people)} screamed yourselves hoarse.` : 'Great seats, great game.', tone: 'good' }; },
  },
  {
    id: 'play_catch', category: 'sports', icon: '🥎', label: 'Play catch in the yard', who: 'household', min: 1, ages: [6, 90],
    desc: 'Simple, free, and somehow the best talks happen here.',
    energy: flat(4), cost: flat(0),
    run: (c) => { bondAll(c, 4, 4); moodAll(c, 'stress', -2); return { text: `You and ${names(c.people)} talked about everything and nothing.`, tone: 'good' }; },
  },

];
