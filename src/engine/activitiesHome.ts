/** Activities: At home, health, learning, fun and travel, and family visits. */
import { HOBBY_BY_ID } from '../content/actions';
import { stableHash } from './relationships';
import { isGrandchildOf } from './grandchildren';
import { connectionOf, forget, harmFrom, harmText } from './relationships';
import { active, activePartnership, adjustBond, ageOf, flag, getBond, kidsAtHome, membersOf, partnerOf, stat } from './util';
import { TEST_RESULTS_DELAY } from './healthEvents';
import { maybeMeetFriend } from './friends';
import { distanceOf, type ActivityDef, flat, each, names, bondAll, moodAll, hasHobby, professional, kidAges } from './activityKit';
import { charge } from './money';
import { HOMES } from '../content/finance';

/** 5ks of training before the (secret) marathon appears. */
export const MARATHON_5KS = 16;

/** What a visit takes: across town, a few hours' drive, or a long trip. */
export const VISIT = { near: { energy: 10, cost: 40 }, drive: { energy: 20, cost: 250 }, far: { energy: 35, cost: 600 } } as const;

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
    id: 'run_5k', category: 'health', icon: '🏃', label: 'Run a 5k', who: 'solo', ages: [10, 85], perYear: 5, desc: 'A race morning, a bib number, and a free banana at the finish.',
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
    // Secret: appears once you're very fit and have trained with MARATHON_5KS 5ks.
    id: 'run_marathon', category: 'health', icon: '🏅', label: 'Run a marathon', who: 'solo', ages: [16, 85], perYear: 1,
    hidden: (_s, me) => !(me.stats.fitness > 95 && (me.flags.five_ks ?? 0) >= MARATHON_5KS),
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
        stat(c.me, 'stress', 6);
        c.s.scheduled.push({ dueYear: c.s.year + TEST_RESULTS_DELAY, eventId: 'test_results', subjectId: c.me.id });
        return { text: 'The doctor didn’t like something in your bloodwork and ordered more tests. The results come back next year.', tone: 'neutral' };
      }
      stat(c.me, 'health', 2);
      flag(c.me, 'clean_checkups');
      return { text: 'A clean bill of health. The doctor says keep it up.', tone: 'good' };
    },
  },
  {
    id: 'check_in', category: 'home', icon: '💬', label: 'Check in with them', who: 'close', max: 1, ages: [8, 120],
    desc: 'Ask how they’re really doing, and listen. It won’t fix everything, but you’ll know where things stand.',
    energy: flat(5), cost: flat(0),
    run: (c) => {
      const [p] = c.people;
      // Asking first matters most to someone who needs room. Once a year per person counts (no farming trust).
      if (p.flags.checked_in !== c.s.year) adjustBond(c.s, c.me.id, p.id, 2, connectionOf(p) === 'space' ? 5 : 3);
      p.flags.checked_in = c.s.year;
      const harm = harmFrom(p, c.me.id);
      if (harm) return { text: `${p.firstName} admits ${p.sex === 'F' ? 'she' : 'he'}’s still hurt about you ${harmText(harm)}.`, tone: 'neutral' };
      if (p.stats.stress >= 70) return { text: `${p.firstName} is overwhelmed and hadn’t wanted to say so. Now you know.`, tone: 'neutral' };
      if (getBond(c.s, c.me.id, p.id).affinity < 0) return { text: `${p.firstName} answered in one word. There’s distance between you.`, tone: 'neutral' };
      return { text: `${p.firstName} is doing well, and glad you asked.`, tone: 'good' };
    },
  },
  {
    id: 'ask_need', category: 'home', icon: '🤲', label: 'Ask what they need', who: 'close', max: 1, ages: [8, 120],
    desc: 'Ask how they like to be supported. Their answer shows on the Family tab.',
    energy: flat(6), cost: flat(0),
    run: (c) => {
      const [p] = c.people;
      if (!p.flags.pref_known) adjustBond(c.s, c.me.id, p.id, 1, 2); // feeling heard, the first time
      p.flags.pref_known = 1;
      const pref = connectionOf(p);
      if (pref === 'support' && p.stats.stress >= 70) stat(p, 'stress', -4);
      const answer = { time: 'Just more time together, honestly.', support: 'A hand with the everyday stuff would mean a lot.', experiences: 'Let’s do something new together.', space: 'Some room to figure things out myself.' }[pref];
      return { text: `${p.firstName} thought about it: "${answer}"`, tone: 'good' };
    },
  },
  {
    id: 'apologize', category: 'home', icon: '🕊️', label: 'Make a specific apology', who: 'close', max: 1, ages: [8, 120],
    eligible: (s, p) => !!harmFrom(p, active(s).id),
    desc: 'Name what you did and own it. Only for something that actually happened.',
    energy: flat(8), cost: flat(0),
    run: (c) => {
      const [p] = c.people;
      const harm = harmFrom(p, c.me.id)!;
      forget(p, harm.kind, c.me.id);
      if (getBond(c.s, c.me.id, p.id).trust < -30) {
        adjustBond(c.s, c.me.id, p.id, 2, 4);
        return { text: `You apologized for ${harmText(harm)}. ${p.firstName} heard you, but it will take time.`, tone: 'neutral' };
      }
      adjustBond(c.s, c.me.id, p.id, 4, 8);
      return { text: `You apologized for ${harmText(harm)}, and meant it. ${p.firstName} let out a long breath and hugged you.`, tone: 'good' };
    },
  },
  {
    id: 'household_goal', category: 'home', icon: '📋', label: 'Set a household goal', who: 'household', min: 1,
    desc: 'Sit down together and agree on one thing to work toward this year: savings, a trip, a project.',
    energy: flat(6), cost: flat(0), perYear: 1,
    run: (c) => {
      bondAll(c, 3, 3);
      stat(c.me, 'stress', -2);
      return { text: `You and ${names(c.people)} agreed on a goal and stuck it to the fridge.`, tone: 'good' };
    },
  },
  {
    id: 'road_trip', category: 'leisure', icon: '🚙', label: 'Plan a modest road trip', who: 'household', min: 0,
    desc: 'A few days somewhere new within driving distance. Cheap motels, good snacks.',
    energy: flat(25), cost: each(300, 100), perYear: 1,
    run: (c) => {
      moodAll(c, 'happiness', 6);
      moodAll(c, 'stress', -6);
      bondAll(c, 5, 3);
      return { text: c.people.length ? `Car games, a flat tire, and a lake none of you knew existed. ${names(c.people)} want to go again.` : 'Just you, the open road, and a playlist. Exactly what you needed.', tone: 'good' };
    },
  },
  {
    id: 'try_new_together', category: 'home', icon: '🎨', label: 'Try something new together', who: 'household', min: 1, max: 3, ages: [10, 120],
    desc: 'A pottery class, an escape room, a cooking challenge: something none of you have done before.',
    energy: flat(15), cost: each(0, 60),
    run: (c) => {
      bondAll(c, 5, 3);
      moodAll(c, 'happiness', 3);
      const pick = ['a pottery class', 'an escape room', 'a cooking challenge', 'a climbing gym', 'a painting night'][c.s.year % 5];
      return { text: `You and ${names(c.people)} tried ${pick}. Nobody was good at it, which was the fun part.`, tone: 'good' };
    },
  },
  {
    id: 'help_project', category: 'home', icon: '🛠️', label: 'Help with their project', who: 'household', max: 1, ages: [8, 120],
    labelFor: (_s, me) => (ageOf(me, _s.year) < 18 ? 'Help a parent with a project' : 'Help with their project'),
    desc: 'A science project, a side business, a garden plan: whatever they’re working on, lend a hand.',
    energy: flat(12), cost: flat(0),
    run: (c) => {
      const [p] = c.people;
      adjustBond(c.s, c.me.id, p.id, 6, 5);
      stat(p, 'happiness', 3);
      if (p.hobby) p.skills[p.hobby] = Math.min(100, (p.skills[p.hobby] ?? 0) + 2);
      return { text: `You spent a weekend on ${p.firstName}'s project. It works now, mostly thanks to the duct tape.`, tone: 'good' };
    },
  },
  {
    id: 'quiet_day', category: 'home', icon: '🫖', label: 'A quiet day together', who: 'household', min: 1, max: 2, ages: [8, 120],
    desc: 'No plans, no phones. Tea, a walk, a nap.',
    energy: flat(8), cost: flat(0),
    run: (c) => {
      moodAll(c, 'stress', -6);
      bondAll(c, 3, 3);
      return { text: `A slow day with ${names(c.people)}. You didn't do much, and that was the point.`, tone: 'good' };
    },
  },
  {
    id: 'build_treehouse', category: 'home', icon: '🌳', label: 'Build the kids a treehouse', who: 'kids', min: 1,
    eligible: (s, p) => kidAges(p, s, 4, 12),
    requires: (s, me) => {
      const home = s.households[me.householdId].assets.find((a) => a.kind === 'house');
      if ((me.skills.woodworking ?? 0) < 30) return 'Needs woodworking skill 30.';
      if (!home || home.name === HOMES.condo.label) return 'Needs a home with a yard.';
      return me.flags.treehouse ? 'You already built one.' : null;
    },
    desc: 'Lumber, a weekend, and a rope ladder. The kids will talk about it forever.',
    energy: flat(40), cost: flat(800),
    run: (c) => {
      flag(c.me, 'treehouse');
      bondAll(c, 8, 5);
      c.people.forEach((k) => stat(k, 'happiness', 8));
      stat(c.me, 'happiness', 5);
      c.me.skills.woodworking = Math.min(100, (c.me.skills.woodworking ?? 0) + 3);
      return { text: `${names(c.people)} declared it a no-grown-ups club. You were allowed in once, as the builder.`, tone: 'good' };
    },
  },
  {
    id: 'dentist', category: 'health', icon: '🦷', label: 'Dentist visit', who: 'solo', perYear: 1, desc: 'A cleaning and a check. Hopefully no drilling.',
    energy: flat(5), cost: flat(200),
    run: (c) => {
      flag(c.me, 'dentist_visits');
      stat(c.me, 'health', 1);
      if (c.rng.chance(0.25)) {
        charge(c.s.households[c.me.householdId], 300);
        stat(c.me, 'happiness', -2);
        return { text: 'A cavity. Another $300 and a numb, drooly afternoon.', tone: 'neutral' };
      }
      stat(c.me, 'happiness', 1);
      return { text: 'No cavities. Your teeth have never felt so smooth.', tone: 'good' };
    },
  },
  {
    id: 'diet_plan', category: 'health', icon: '🥗', label: 'Start a diet plan', who: 'solo', perYear: 1, desc: 'A nutritionist and a year of better groceries.',
    energy: flat(25), cost: flat(400),
    run: (c) => {
      flag(c.me, 'diet');
      // Hard to stick with when life is stressful.
      if (c.me.stats.stress >= 70 && c.rng.chance(0.4)) {
        stat(c.me, 'health', 1);
        return { text: 'You lasted three weeks before the takeout menus won. Still, you eat more vegetables now.', tone: 'neutral' };
      }
      stat(c.me, 'health', 4);
      stat(c.me, 'fitness', 2);
      stat(c.me, 'happiness', -1);
      return { text: 'Meal prep Sundays, fewer snacks, more energy. You miss dessert a little.', tone: 'good' };
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
    energy: (s, ppl) => (ppl[0] ? VISIT[distanceOf(s, ppl[0])].energy : VISIT.near.energy),
    cost: (s, ppl) => (ppl[0] ? VISIT[distanceOf(s, ppl[0])].cost : VISIT.near.cost),
    run: (c) => {
      const [p] = c.people;
      adjustBond(c.s, c.me.id, p.id, 8, 5);
      stat(p, 'happiness', 6);
      for (const m of membersOf(c.s, p.householdId)) if (m.id !== p.id) adjustBond(c.s, c.me.id, m.id, 3, 2);
      return { text: `${p.firstName} lit up when you walked in.`, tone: 'good' };
    },
  },
  {
    id: 'family_reunion', category: 'visits', icon: '🎪', label: 'Host a family reunion', who: 'guests', min: 3, perYear: 1,
    desc: 'Bring the whole family together from near and far: aunts, cousins, grandparents.',
    energy: flat(40), cost: each(800, 120),
    run: (c) => {
      flag(c.me, 'reunion');
      bondAll(c, 6, 4);
      moodAll(c, 'happiness', 5);
      for (const m of membersOf(c.s, c.me.householdId)) if (m.id !== c.me.id) adjustBond(c.s, c.me.id, m.id, 3, 2);
      // Someone you've drifted from may make peace; or old tensions flare up.
      const cold = c.people.find((p) => getBond(c.s, c.me.id, p.id).affinity < 15);
      if (cold && c.rng.chance(0.5)) {
        adjustBond(c.s, c.me.id, cold.id, 15, 10);
        return { text: `${cold.firstName} pulled you aside by the grill. Years of silence ended with a long hug.`, tone: 'good' };
      }
      if (c.rng.chance(0.2)) {
        const p = c.rng.pick(c.people);
        adjustBond(c.s, c.me.id, p.id, -10, -6);
        stat(c.me, 'stress', 6);
        return { text: `It was lovely until ${p.firstName} brought up the inheritance. The potato salad went untouched.`, tone: 'neutral' };
      }
      stat(c.me, 'happiness', 4);
      return { text: 'Matching T-shirts, a three-legged race, and a group photo with forty people squinting into the sun.', tone: 'good' };
    },
  },
  {
    // Made for traditions (docs/plans/family-traditions.md): a yearly birthday camping trip with the kids.
    id: 'birthday_camping', category: 'leisure', icon: '🏕️', label: 'Birthday camping trip', who: 'household', perYear: 1,
    requires: (s, me) => (kidsAtHome(s, me).some((k) => kidAges(k, s, 6, 17)) ? null : 'Needs a child aged 6–17 at home.'),
    desc: 'A tent, a campfire, and a birthday under the stars.',
    energy: flat(30), cost: each(250, 60),
    run: (c) => {
      moodAll(c, 'happiness', 6);
      moodAll(c, 'stress', -6);
      bondAll(c, 5, 3);
      const kids = c.people.filter((p) => kidAges(p, c.s, 6, 17));
      const star = kids.length ? kids[c.s.year % kids.length] : undefined;
      if (star) stat(star, 'happiness', 4);
      if (c.rng.chance(0.2)) return { text: `Rained all night. ${star ? `${star.firstName} says it was the best birthday ever, apparently.` : 'Everyone says it was the best trip ever, apparently.'}`, tone: 'good' };
      return { text: `S'mores, a campfire, and ${star ? `${star.firstName}'s` : 'a'} birthday under the stars.`, tone: 'good' };
    },
  },
  {
    // Made for traditions: the grandparents over for dinner, with the grandkids.
    id: 'grandparents_dinner', category: 'visits', icon: '🍲', label: 'Sunday dinner with the grandparents', who: 'guests', max: 4, perYear: 6,
    eligible: (s, p) => {
      const me = active(s);
      const pt = partnerOf(s, me.id);
      const parentOf = (x: { biologicalParents: string[]; adoptiveParents: string[] } | undefined) => !!x && (x.biologicalParents.includes(p.id) || x.adoptiveParents.includes(p.id));
      return (parentOf(me) || parentOf(pt)) && distanceOf(s, p) === 'near';
    },
    requires: (s, me) => (kidsAtHome(s, me).length ? null : 'Needs a child at home.'),
    desc: 'The grandparents come over; the kids set the table.',
    energy: flat(15), cost: flat(40),
    run: (c) => {
      for (const gp of c.people) {
        stat(gp, 'happiness', 3);
        adjustBond(c.s, c.me.id, gp.id, 3, 2);
        for (const k of kidsAtHome(c.s, c.me)) adjustBond(c.s, gp.id, k.id, 4, 3);
      }
      stat(c.me, 'happiness', 2);
      return { text: `${names(c.people)} brought dessert and stayed until the kids fell asleep on the couch.`, tone: 'good' };
    },
  },
  {
    // Made for traditions: lights on the house every December (a house, not an apartment or condo).
    id: 'holiday_lights', category: 'home', icon: '🎄', label: 'Holiday light display', who: 'household', min: 0, perYear: 1,
    requires: (s, me) => {
      const hh = s.households[me.householdId];
      const house = hh.assets.find((a) => a.kind === 'house');
      const ok = house ? house.name !== HOMES.condo.label : hh.rentTier === 'house';
      return ok ? null : 'Needs a house (not an apartment or condo).';
    },
    desc: 'Ladders, extension cords, and a lot of tiny lights.',
    energy: flat(20), cost: (s) => (active(s).flags.lights_bought ? 60 : 150),
    run: (c) => {
      flag(c.me, 'lights_bought');
      moodAll(c, 'happiness', 5);
      bondAll(c, 3, 2);
      const years = new Set((c.s.activityLog ?? []).filter((x) => x.id === 'holiday_lights').map((x) => x.year)).size;
      if (years >= 3) return { text: 'Cars slow down on your street now. Someone left a thank-you note in the mailbox.', tone: 'good' };
      return { text: 'Half the bulbs worked on the first try. The other half worked eventually.', tone: 'good' };
    },
  },
  {
    // Grandchildren's stories: pass on your craft to a grandchild 8–17 who lives with you or nearby.
    id: 'teach_grandchild', category: 'home', icon: '🧑‍🏫', label: 'Teach a grandchild your craft', who: 'close', max: 1, perYear: 3,
    eligible: (s, p) => isGrandchildOf(s, p, active(s)) && kidAges(p, s, 8, 17) && (p.householdId === active(s).householdId || distanceOf(s, p) === 'near'),
    requires: (_s, me) => (me.hobby && (me.skills[me.hobby] ?? 0) >= 50 ? null : 'Needs a hobby at skill 50+.'),
    desc: 'An afternoon showing them what took you years to learn.',
    energy: flat(15), cost: flat(0),
    run: (c) => {
      const [g] = c.people;
      const h = c.me.hobby!;
      g.skills[h] = Math.min(100, (g.skills[h] ?? 0) + 4);
      adjustBond(c.s, c.me.id, g.id, 4, 3);
      const open = g.traits.includes('curious') || g.traits.includes('creative') ? 70 : 40;
      const name = h === 'sports' ? 'sports' : HOBBY_BY_ID[h].label.toLowerCase();
      if (!g.hobby && stableHash(`${g.id}:${c.s.year}:learn`) % 100 < open) {
        g.hobby = h;
        return { text: `${g.firstName} took to ${name} right away and asked to come back next week.`, tone: 'good' };
      }
      return { text: `You showed ${g.firstName} the tricks it took you years to learn. ${g.firstName} was a quick study.`, tone: 'good' };
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
