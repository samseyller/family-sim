/** Activities: At home, health, learning, fun and travel, and family visits. */
import { activePartnership, adjustBond, ageOf, flag, getBond, membersOf, partnerOf, stat } from './util';
import { maybeMeetFriend } from './friends';
import { distanceOf, type ActivityDef, flat, each, names, bondAll, moodAll, hasHobby, professional, kidAges } from './activityKit';
import { charge } from './money';

export const HOME_ACTIVITIES: ActivityDef[] = [
  // 🏡 At home — cheap, repeatable, great for bonds with anyone in the household (any age)
  {
    id: 'do_chores', category: 'home', icon: '🧺', label: 'Do your spouse’s chores', who: 'solo', perYear: 3,
    labelFor: (s, me) => { const p = partnerOf(s, me.id); return p ? `Do ${p.firstName}’s chores` : 'Do your spouse’s chores'; },
    requires: (s, me) => {
      const p = partnerOf(s, me.id);
      return activePartnership(s, me.id)?.status === 'married' && p && p.householdId === me.householdId ? null : 'Needs a spouse at home.';
    },
    desc: 'Dishes, laundry, the gutters: take a load off their plate. It’s tiring, and they notice.',
    energy: flat(10), cost: flat(0),
    run: (c) => {
      const p = partnerOf(c.s, c.me.id)!;
      adjustBond(c.s, c.me.id, p.id, 7, 5);
      stat(p, 'stress', -6);
      stat(p, 'happiness', 3);
      stat(c.me, 'stress', 4);
      return { text: c.rng.pick([`${p.firstName} came home to a spotless kitchen and just hugged you.`, `You folded the laundry the way ${p.firstName} likes. They noticed.`, `The gutters are clean. ${p.firstName} is smitten.`]), tone: 'good' };
    },
  },
  {
    id: 'game_night', category: 'home', icon: '🎲', label: 'Game night', who: 'household', desc: 'Board games and snacks with people at home.',
    energy: flat(8), cost: flat(15),
    run: (c) => { bondAll(c, 4, 3); moodAll(c, 'happiness', 3); return { text: `Game night with ${names(c.people)}. Someone flipped the board (lovingly).`, tone: 'good' }; },
  },
  {
    id: 'cook_together', category: 'home', icon: '🍝', label: 'Cook dinner together', who: 'household', desc: 'Make a meal side by side.',
    energy: flat(8), cost: flat(40),
    run: (c) => {
      bondAll(c, 4, 4);
      if (c.rng.chance(0.15)) { moodAll(c, 'happiness', 1); return { text: 'The smoke alarm went off. Pizza was ordered. Still a great night.', tone: 'neutral' }; }
      moodAll(c, 'happiness', 3);
      return { text: `You and ${names(c.people)} made something genuinely delicious.`, tone: 'good' };
    },
  },
  {
    id: 'movie_marathon', category: 'home', icon: '🎬', label: 'Movie marathon', who: 'household', desc: 'Blankets, popcorn, too many sequels.',
    energy: flat(6), cost: flat(20),
    run: (c) => { bondAll(c, 3, 2); moodAll(c, 'stress', -4); return { text: 'Three movies in, everyone was asleep on the couch.', tone: 'good' }; },
  },
  {
    id: 'garden', category: 'home', icon: '🌱', label: 'Garden project', who: 'household', min: 0, desc: 'Plant something together (or alone).',
    energy: flat(12), cost: flat(120),
    run: (c) => { bondAll(c, 3, 3); stat(c.me, 'health', 2); stat(c.me, 'stress', -5); return { text: 'Dirt under the fingernails and tomatoes on the way.', tone: 'good' }; },
  },
  {
    id: 'park', category: 'home', icon: '🛝', label: 'Trip to the park', who: 'kids', desc: 'Swings, slides and a picnic with the little ones.',
    eligible: (s, p) => ageOf(p, s.year) <= 12, energy: flat(8), cost: flat(10),
    run: (c) => { bondAll(c, 5, 4); c.people.forEach((k) => stat(k, 'happiness', 4)); stat(c.me, 'fitness', 1); return { text: `${names(c.people)} ran until they couldn't anymore.`, tone: 'good' }; },
  },
  {
    id: 'teach_drive', category: 'home', icon: '🚘', label: 'Teach to drive', who: 'household', max: 1, desc: 'White knuckles, big trust.',
    eligible: (s, p) => kidAges(p, s, 15, 19), energy: flat(12), cost: flat(0),
    run: (c) => {
      const [t] = c.people;
      if (c.rng.chance(0.12)) {
        charge(c.s.households[c.me.householdId], 1500);
        adjustBond(c.s, c.me.id, t.id, 2, 4);
        return { text: `${t.firstName} met a mailbox. $1,500 later, you both laughed about it.`, tone: 'neutral' };
      }
      adjustBond(c.s, c.me.id, t.id, 5, 10);
      return { text: `${t.firstName} parallel parked on the first try. You pretended not to be impressed.`, tone: 'good' };
    },
  },
  {
    id: 'heart_to_heart', category: 'home', icon: '🫶', label: 'A heart-to-heart', who: 'household', max: 1, desc: 'Really talk with one person at home.',
    energy: flat(10), cost: flat(0),
    run: (c) => {
      const [p] = c.people;
      const b = getBond(c.s, c.me.id, p.id);
      if (c.rng.chance(0.5 + b.trust / 250)) { adjustBond(c.s, c.me.id, p.id, 6, 10); stat(p, 'stress', -5); return { text: `You and ${p.firstName} talked late into the night. Something lifted.`, tone: 'good' }; }
      adjustBond(c.s, c.me.id, p.id, -2, 1);
      return { text: `${p.firstName} wasn't ready to open up. At least you tried.`, tone: 'neutral' };
    },
  },

  // 🩺 Health
  {
    id: 'hike', category: 'health', icon: '🥾', label: 'Go hiking', who: 'solo', ages: [8, 85], desc: 'A trail, a view, and nobody asking you for anything.',
    energy: flat(10), cost: flat(0),
    run: (c) => {
      stat(c.me, 'fitness', 3);
      stat(c.me, 'stress', -6);
      stat(c.me, 'happiness', 3);
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.06, 'on a hiking trail');
      return { text: f ? `You and ${f.firstName} kept passing each other on the trail, then shared the summit. Hiking buddies now.` : 'Muddy boots, a great view, and a clear head.', tone: 'good' };
    },
  },
  {
    id: 'run_5k', category: 'health', icon: '🏃', label: 'Run a 5k', who: 'solo', ages: [10, 85], perYear: 4, desc: 'A race morning, a bib number, and a free banana at the finish.',
    energy: flat(12), cost: flat(40),
    run: (c) => {
      c.me.flags.five_ks = (c.me.flags.five_ks ?? 0) + 1;
      stat(c.me, 'fitness', 4);
      stat(c.me, 'health', 1);
      stat(c.me, 'happiness', 3);
      const fast = c.me.stats.fitness >= 85;
      return { text: fast ? `A personal best! 5k number ${c.me.flags.five_ks}, and you finished near the front.` : `5k number ${c.me.flags.five_ks}: you crossed the line and immediately looked for the banana table.`, tone: 'good' };
    },
  },
  {
    // Secret: appears once you're very fit and have run five 5ks.
    id: 'run_marathon', category: 'health', icon: '🏅', label: 'Run a marathon', who: 'solo', ages: [16, 85], perYear: 1,
    hidden: (_s, me) => !(me.stats.fitness > 95 && (me.flags.five_ks ?? 0) >= 5),
    desc: '26.2 miles. You have trained for this.',
    energy: flat(30), cost: flat(150),
    run: (c) => {
      flag(c.me, 'marathon');
      c.me.flags.marathons = (c.me.flags.marathons ?? 0) + 1;
      stat(c.me, 'happiness', 10);
      stat(c.me, 'health', -2);
      return { text: 'Mile 20 was the hardest thing you have ever done. Mile 26.2 was the best. You cried at the finish, and that is fine.', tone: 'good' };
    },
  },
  {
    id: 'checkup', category: 'health', icon: '🩺', label: 'Doctor check-up', who: 'solo', perYear: 1, desc: 'Catch problems early.',
    energy: flat(10), cost: flat(150),
    run: (c) => {
      c.me.flags.checkup_year = c.s.year;
      if (ageOf(c.me, c.s.year) > 40 && c.me.stats.health < 60 && c.rng.chance(0.4)) {
        stat(c.me, 'health', 6);
        stat(c.me, 'stress', 6);
        return { text: 'The doctor caught something early. Treatment started right away.', tone: 'neutral' };
      }
      stat(c.me, 'health', 2);
      flag(c.me, 'clean_checkups');
      return { text: 'A clean bill of health. The doctor says keep it up.', tone: 'good' };
    },
  },
  {
    id: 'therapy', category: 'health', icon: '🛋️', label: 'Therapy session', who: 'solo', desc: 'Talk it through with a professional.',
    energy: flat(12), cost: flat(150),
    run: (c) => { stat(c.me, 'stress', -12); stat(c.me, 'happiness', 3); return { text: 'You left lighter than you arrived.', tone: 'good' }; },
  },
  {
    id: 'gym', category: 'health', icon: '🏋️', label: 'Gym membership', who: 'solo', perYear: 1, desc: 'A year of access; a big push to fitness.',
    energy: flat(20), cost: flat(600),
    run: (c) => {
      stat(c.me, 'fitness', 8);
      stat(c.me, 'health', 3);
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.15, 'at the gym');
      return { text: f ? `Sore for a week, then hooked. ${f.firstName} became your gym buddy.` : 'Sore for a week, then hooked.', tone: 'good' };
    },
  },
  {
    id: 'yoga', category: 'health', icon: '🧘', label: 'Yoga class', who: 'solo', desc: 'Stretch, breathe, unclench.',
    energy: flat(10), cost: flat(60),
    run: (c) => { stat(c.me, 'stress', -8); stat(c.me, 'fitness', 2); return { text: 'Namaste. Your shoulders came down from your ears.', tone: 'good' }; },
  },

  // 📚 Learning
  {
    id: 'conference', category: 'learning', icon: '🎤', label: 'Attend a conference', who: 'solo', perYear: 1,
    requires: (s, me) => (professional(s, me) ? null : 'Needs a full-time professional career (one that requires a degree).'),
    desc: 'Talks, badges, and a lot of networking. Your employer pays.',
    energy: flat(20), cost: flat(0),
    run: (c) => {
      c.me.workPerf = Math.min(100, c.me.workPerf + 12);
      stat(c.me, 'smarts', 2);
      stat(c.me, 'stress', 2);
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.2, 'at a conference');
      return { text: f ? `Great talks, and you hit it off with ${f.firstName} at the hotel bar. Your boss loved your trip report.` : 'You came back with ideas, a tote bag, and a boss who noticed.', tone: 'good' };
    },
  },
  {
    id: 'read_book', category: 'learning', icon: '📖', label: 'Read a good book', who: 'solo', ages: [8, 120], desc: 'Get lost in a story.',
    energy: flat(6), cost: flat(15),
    run: (c) => { stat(c.me, 'smarts', 2); stat(c.me, 'stress', -3); return { text: 'You stayed up way too late to finish it.', tone: 'good' }; },
  },
  {
    id: 'language', category: 'learning', icon: '🗣️', label: 'Language course', who: 'solo', desc: 'Learn to order more than coffee abroad.',
    energy: flat(25), cost: flat(400),
    run: (c) => { stat(c.me, 'smarts', 4); flag(c.me, 'languages'); return { text: '¡Muy bien! Your accent is… getting there.', tone: 'good' }; },
  },
  {
    id: 'cooking_class', category: 'learning', icon: '👩‍🍳', label: 'Cooking class', who: 'solo', desc: 'Knife skills and a fancy sauce.',
    energy: flat(15), cost: flat(200),
    run: (c) => { stat(c.me, 'happiness', 4); flag(c.me, 'cook'); return { text: 'You can now make a béchamel. Nobody can stop you.', tone: 'good' }; },
  },
  {
    id: 'hobby_workshop', category: 'learning', icon: '🎯', label: 'Hobby workshop', who: 'solo', ages: [10, 120], desc: 'A weekend intensive for your hobby.',
    requires: hasHobby, energy: flat(20), cost: flat(250),
    run: (c) => { c.me.skills[c.me.hobby!] = Math.min(100, (c.me.skills[c.me.hobby!] ?? 0) + 7); stat(c.me, 'happiness', 3); return { text: 'You learned more in a weekend than in a year.', tone: 'good' }; },
  },

  // 🌴 Fun & travel — the big ones cost a lot of energy and money
  {
    id: 'concert', category: 'leisure', icon: '🎤', label: 'Concert', who: 'household', min: 0, desc: 'Live music, loud and happy.',
    energy: flat(12), cost: each(90, 90),
    run: (c) => { moodAll(c, 'happiness', 5); bondAll(c, 4, 2); return { text: 'Your ears are still ringing. Worth it.', tone: 'good' }; },
  },
  {
    id: 'ball_game', category: 'leisure', icon: '⚾', label: 'Ball game', who: 'household', min: 0, desc: 'Hot dogs and a seventh-inning stretch.',
    energy: flat(12), cost: each(60, 60),
    run: (c) => { moodAll(c, 'happiness', 4); bondAll(c, 4, 2); return { text: c.rng.chance(0.2) ? 'You caught a foul ball! Legend.' : 'The home team lost. Nobody cared.', tone: 'good' }; },
  },
  {
    id: 'spa_day', category: 'leisure', icon: '💆', label: 'Spa day', who: 'solo', desc: 'Massage, steam, silence.',
    energy: flat(10), cost: flat(250),
    run: (c) => { stat(c.me, 'stress', -15); stat(c.me, 'happiness', 3); return { text: 'You forgot what stress was for a whole afternoon.', tone: 'good' }; },
  },
  {
    id: 'getaway', category: 'leisure', icon: '🏕️', label: 'Weekend getaway', who: 'household', min: 0, desc: 'A cabin, a lake, no email.',
    energy: flat(25), cost: each(600, 250),
    run: (c) => { moodAll(c, 'happiness', 7); moodAll(c, 'stress', -10); bondAll(c, 6, 4); return { text: 'Two days, one lake, zero notifications.', tone: 'good' }; },
  },
  {
    id: 'vacation', category: 'leisure', icon: '🏖️', label: 'Beach vacation', who: 'household', min: 0, desc: 'A week of sun and sand.',
    energy: flat(45), cost: each(2000, 900),
    run: (c) => {
      moodAll(c, 'happiness', 10);
      moodAll(c, 'stress', -18);
      bondAll(c, 9, 6);
      if (c.rng.chance(0.12)) { charge(c.s.households[c.me.householdId], 400); return { text: 'The airline lost a suitcase, but the beach was perfect.', tone: 'neutral' }; }
      return { text: 'Sandcastles, sunsets, and a family photo worth framing.', tone: 'good' };
    },
  },
  {
    id: 'world_trip', category: 'leisure', icon: '✈️', label: 'Trip abroad', who: 'household', min: 0, desc: 'A once-in-a-while adventure overseas.',
    energy: flat(60), cost: each(4500, 2200),
    run: (c) => {
      moodAll(c, 'happiness', 14);
      moodAll(c, 'stress', -20);
      bondAll(c, 12, 8);
      flag(c.me, 'trips_abroad');
      if (c.rng.chance(0.15)) { moodAll(c, 'health', -4); return { text: 'Everyone caught the same stomach bug. Still, the views!', tone: 'neutral' }; }
      return { text: 'New food, new streets, stories you will tell for years.', tone: 'good' };
    },
  },

  // 🚗 Family visits
  {
    id: 'fly_visit', category: 'visits', icon: '✈️', label: 'Fly to see a relative', who: 'relative', max: 1,
    eligible: (s, p) => distanceOf(s, p) === 'far',
    desc: 'Flights and a few days with family in another city: less tiring than the drive, and more time together.',
    energy: flat(20), cost: flat(900),
    run: (c) => {
      const [p] = c.people;
      adjustBond(c.s, c.me.id, p.id, 12, 6);
      stat(p, 'happiness', 8);
      stat(c.me, 'happiness', 4);
      for (const m of membersOf(c.s, p.householdId)) if (m.id !== p.id) adjustBond(c.s, c.me.id, m.id, 4, 3);
      flag(c.me, 'flew_to_family');
      return { text: `${p.firstName} was waiting at arrivals with a sign. You stayed up talking every night.`, tone: 'good' };
    },
  },
  {
    id: 'visit', category: 'visits', icon: '🚗', label: 'Visit a relative', who: 'relative', max: 1, desc: 'Drop by, or travel to see someone.',
    energy: (s, ppl) => (ppl[0] && distanceOf(s, ppl[0]) === 'far' ? 35 : 10),
    cost: (s, ppl) => (ppl[0] && distanceOf(s, ppl[0]) === 'far' ? 600 : 40),
    run: (c) => {
      const [p] = c.people;
      adjustBond(c.s, c.me.id, p.id, 8, 5);
      stat(p, 'happiness', 6);
      for (const m of membersOf(c.s, p.householdId)) if (m.id !== p.id) adjustBond(c.s, c.me.id, m.id, 3, 2);
      return { text: `${p.firstName} lit up when you walked in.`, tone: 'good' };
    },
  },
  {
    id: 'host_holiday', category: 'visits', icon: '🦃', label: 'Host a holiday dinner', who: 'guests', perYear: 1, desc: 'Invite family over for a big meal.',
    energy: flat(30), cost: each(300, 60),
    run: (c) => {
      bondAll(c, 5, 3);
      for (const m of membersOf(c.s, c.me.householdId)) if (m.id !== c.me.id) adjustBond(c.s, c.me.id, m.id, 3, 2);
      if (c.people.length >= 3 && c.rng.chance(0.25)) {
        const p = c.rng.pick(c.people);
        adjustBond(c.s, c.me.id, p.id, -12, -6);
        stat(c.me, 'stress', 6);
        return { text: `Dinner was lovely until ${p.firstName} brought up politics.`, tone: 'neutral' };
      }
      stat(c.me, 'happiness', 6);
      return { text: 'A full table, a fuller fridge, and leftovers for days.', tone: 'good' };
    },
  },

];
