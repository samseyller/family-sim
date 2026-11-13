/** Activities: Hobbies and side gigs: earn by skill, restore, share with family. */
import { ownsGear, practiceBoost, restoreProgress } from './hobbies';
import { active, flag, journal, money, stat } from './util';
import { type ActivityDef, flat, names, bondAll, moodAll, needSkill, projectCar, earn, hangOut } from './activityKit';
import { credit } from './money';
import { gardenHarvest } from './handy';
import { maybeMeetFriend } from './friends';

export const HOBBY_ACTIVITIES: ActivityDef[] = [
  // 🧰 Hobbies & side gigs: earn by skill, restore, share with family
  {
    id: 'sell_furniture', category: 'hobby', icon: '🪑', label: 'Build and sell a piece', who: 'solo', perYear: 3,
    requires: needSkill('woodworking', 30), desc: 'A table, a bookshelf, a rocking chair. Pays by skill (more with a workshop).',
    energy: flat(12), cost: flat(300),
    run: (c) => earn(c, 'woodworking', 400, 45, 'Someone bought your piece', 'workshop'),
  },
  {
    id: 'play_gig', category: 'hobby', icon: '🎤', label: 'Play a gig', who: 'solo', perYear: 6,
    requires: needSkill('music', 30), desc: 'A bar, a wedding, a coffee shop. Pays by skill.',
    energy: flat(10), cost: flat(0),
    run: (c) => earn(c, 'music', 150, 18, 'The crowd sang along', 'studio'),
  },
  {
    id: 'cater_event', category: 'hobby', icon: '🍱', label: 'Cater an event', who: 'solo', perYear: 3,
    requires: needSkill('cooking', 35), desc: 'Feed a party of fifty. Pays by skill (more with a chef’s kitchen).',
    energy: flat(14), cost: flat(400),
    run: (c) => earn(c, 'cooking', 800, 32, 'Guests asked for your card', 'chef_kitchen'),
  },
  {
    id: 'hobby_project_together', category: 'hobby', icon: '🧩', label: 'A hobby project together', who: 'household', min: 1, max: 2, ages: [10, 120],
    requires: (_s, me) => (me.hobby ? null : 'Pick up a hobby first.'),
    desc: 'Build, cook, grow or play something together over a few weekends; they pick up some of your skill.',
    energy: flat(16), cost: flat(100), perYear: 2,
    run: (c) => {
      const h = c.me.hobby!;
      bondAll(c, 5, 3);
      for (const p of c.people) p.skills[h] = Math.min(100, (p.skills[h] ?? 0) + 3);
      c.me.skills[h] = Math.min(100, (c.me.skills[h] ?? 0) + 1);
      return { text: `You and ${names(c.people)} finished it together. It's a little crooked, and everyone is proud of it.`, tone: 'good' };
    },
  },
  {
    id: 'share_creation', category: 'hobby', icon: '🖼️', label: 'Share something you made', who: 'household', min: 0,
    requires: (_s, me) => (me.hobby && (me.skills[me.hobby] ?? 0) >= 20 ? null : 'Make something first: a hobby at skill 20 or more.'),
    desc: 'A song, a painting, a meal, a birdhouse: show the people you love what you’ve been working on.',
    energy: flat(8), cost: flat(0), perYear: 2,
    run: (c) => {
      stat(c.me, 'happiness', 4);
      bondAll(c, 3, 2);
      return { text: c.people.length ? `${names(c.people)} loved it, and asked for another.` : 'You posted it online. A stranger said it made their day.', tone: 'good' };
    },
  },
  {
    id: 'run_food_truck', category: 'hobby', icon: '🚚', label: 'Run the food truck', who: 'solo', perYear: 3,
    requires: (s, me) => (ownsGear(s.households[me.householdId], 'food_truck') ? null : 'Buy a food truck first (Money → Hobby gear).'),
    desc: 'A weekend at the festival grounds. Pays by cooking skill (more with a chef’s kitchen to prep in).',
    energy: flat(20), cost: flat(500),
    run: (c) => { flag(c.me, 'food_truck_days'); return earn(c, 'cooking', 1500, 40, 'The line wrapped around the block', 'chef_kitchen'); },
  },
  {
    id: 'share_harvest', category: 'hobby', icon: '🍅', label: 'Share your harvest', who: 'friends', where: 'near', min: 0, perYear: 1,
    requires: (s, me) => (gardenHarvest(s, s.households[me.householdId]) > 0 ? null : 'Needs a home garden: gardening as your hobby, and a yard.'),
    desc: 'Baskets of tomatoes and zucchini for friends and neighbors. (Everyone has too much zucchini.)',
    energy: flat(8), cost: flat(0),
    run: (c) => {
      flag(c.me, 'shared_harvest');
      bondAll(c, 5, 4);
      stat(c.me, 'happiness', 3);
      const met = maybeMeetFriend(c.s, c.rng, c.me, 0.35, 'over the garden fence');
      if (met) return { text: `${met.firstName} from down the street came back with a pie. You have a new friend.`, tone: 'good' };
      return { text: c.people.length ? `${names(c.people)} will be eating salads for a week.` : 'The neighbors left thank-you notes on your porch.', tone: 'good' };
    },
  },
  {
    id: 'fix_cars', category: 'hobby', icon: '🔧', label: 'Fix a neighbor’s car', who: 'solo', perYear: 4,
    requires: needSkill('mechanics', 25), desc: 'Cash for weekend repairs.',
    energy: flat(8), cost: flat(100),
    run: (c) => earn(c, 'mechanics', 200, 14, 'It purrs like new', 'garage_lift'),
  },
  {
    id: 'farmers_market', category: 'hobby', icon: '🧺', label: 'Sell at the farmers market', who: 'solo', perYear: 4,
    requires: needSkill('gardening', 25), desc: 'Tomatoes, herbs, and a lot of small talk.',
    energy: flat(8), cost: flat(50),
    run: (c) => { stat(c.me, 'stress', -3); return earn(c, 'gardening', 100, 9, 'You sold out by noon', 'greenhouse'); },
  },
  {
    id: 'restore_car', category: 'hobby', icon: '🚙', label: 'Work on the project car', who: 'household', min: 0, max: 2,
    requires: (s, me) => (projectCar(s, me) ? (projectCar(s, me)!.restore ?? 0) >= 100 ? 'It’s fully restored.' : null : 'Buy a project car first (Money → Hobby gear).'),
    desc: 'Parts and long weekends; the value climbs as it comes back to life. Bring a kid along.',
    energy: flat(15), cost: flat(1500),
    run: (c) => {
      const car = projectCar(c.s, c.me)!;
      const skill = c.me.skills.mechanics ?? 0;
      restoreProgress(car, Math.round((8 + skill / 5) * practiceBoost(c.s, c.me, 'mechanics')));
      c.me.skills.mechanics = Math.min(100, skill + 2);
      bondAll(c, 5, 4);
      if ((car.restore ?? 0) >= 100) {
        flag(c.me, 'restored_car');
        journal(c.s, `You finished restoring the classic. It's worth ${money(car.value)} now.`, 'major');
        return { text: `The engine turned over on the first try. A restored classic, worth ${money(car.value)}.`, tone: 'good' };
      }
      return { text: `${car.restore}% restored. ${c.people.length ? `${names(c.people)} handed you every wrench.` : 'Grease up to your elbows.'}`, tone: 'good' };
    },
  },
  {
    id: 'car_show', category: 'hobby', icon: '🏆', label: 'Enter a classic car show', who: 'solo', perYear: 1,
    requires: (s, me) => ((projectCar(s, me)?.restore ?? 0) >= 100 ? null : 'Needs a fully restored classic.'),
    desc: 'Polish, park, and hope for a trophy.', energy: flat(6), cost: flat(50),
    run: (c) => {
      if (c.rng.chance(0.3 + (c.me.skills.mechanics ?? 0) / 300)) {
        credit(c.s.households[c.me.householdId], 2000);
        flag(c.me, 'car_show_win');
        return { text: 'Best in Show and a $2,000 prize!', tone: 'good' };
      }
      return { text: 'No trophy, but a crowd around your car all day.', tone: 'good' };
    },
  },
  {
    id: 'fishing_trip', category: 'hobby', icon: '🎣', label: 'Go fishing', who: 'household', min: 0, max: 3,
    requires: (_s, me) => (me.hobby === 'fishing' || (me.skills.fishing ?? 0) > 0 ? null : 'Take up fishing first.'),
    desc: 'Quiet water and good company (better with a boat).',
    energy: flat(8), cost: flat(40),
    run: (c) => {
      bondAll(c, 5, 4);
      stat(c.me, 'stress', -6);
      c.me.skills.fishing = Math.min(100, (c.me.skills.fishing ?? 0) + Math.round(2 * practiceBoost(c.s, c.me, 'fishing')));
      return { text: c.people.length ? `You and ${names(c.people)} caught nothing and loved every minute.` : 'Just you, the lake, and a very patient fish.', tone: 'good' };
    },
  },
  {
    id: 'fishing_tournament', category: 'hobby', icon: '🐟', label: 'Fishing tournament', who: 'solo', perYear: 2,
    requires: needSkill('fishing', 30), desc: 'Entry fee, early start, prize money by skill (a boat helps).',
    energy: flat(12), cost: flat(150),
    run: (c) => {
      const odds = ((c.me.skills.fishing ?? 0) / 160) * practiceBoost(c.s, c.me, 'fishing');
      if (c.rng.chance(Math.min(0.8, odds))) {
        const prize = c.rng.pick([500, 1000, 2500, 5000].filter((_, i) => i <= Math.floor(odds * 4)));
        credit(c.s.households[c.me.householdId], prize);
        return { text: `You placed! ${money(prize)} in prize money.`, tone: 'good' };
      }
      return { text: 'Skunked. Next time.', tone: 'neutral' };
    },
  },
  {
    id: 'scenic_flight', category: 'hobby', icon: '🛩️', label: 'Take the family flying', who: 'household', min: 0, max: 3,
    requires: (_s, me) => (me.flags.ppl ? null : 'Needs a pilot license.'),
    desc: 'Up over the city at sunset (cheaper in your own plane).',
    energy: flat(10), cost: (s) => (ownsGear(s.households[active(s).householdId], 'plane') ? 150 : 450),
    run: (c) => {
      bondAll(c, 7, 5);
      moodAll(c, 'happiness', 6);
      c.me.skills.flying = Math.min(100, (c.me.skills.flying ?? 0) + 2);
      return { text: c.people.length ? `${names(c.people)} pressed their faces to the window the whole way.` : 'Clear skies and a perfect landing.', tone: 'good' };
    },
  },
  {
    id: 'garden_day', category: 'hobby', icon: '🌻', label: 'A day in the garden', who: 'household', min: 0,
    requires: (_s, me) => (me.hobby === 'gardening' || (me.skills.gardening ?? 0) > 0 ? null : 'Take up gardening first.'),
    desc: 'Dirt under your nails, peace in your head.',
    energy: flat(6), cost: flat(30),
    run: (c) => {
      moodAll(c, 'stress', -5);
      bondAll(c, 3, 2);
      c.me.skills.gardening = Math.min(100, (c.me.skills.gardening ?? 0) + Math.round(2 * practiceBoost(c.s, c.me, 'gardening')));
      return { text: 'The tomatoes are finally turning red.', tone: 'good' };
    },
  },
  {
    id: 'dinner_party', category: 'hobby', icon: '🍷', label: 'Host a dinner party', who: 'friends', min: 1, max: 6, where: 'near',
    requires: needSkill('cooking', 20), desc: 'Cook for your friends (better with a chef’s kitchen).',
    energy: flat(12), cost: (_s, ppl) => 60 + 30 * ppl.length,
    run: (c) => {
      c.me.skills.cooking = Math.min(100, (c.me.skills.cooking ?? 0) + 1);
      const great = (c.me.skills.cooking ?? 0) >= 50;
      return hangOut(c, great ? 7 : 4, 3, (who) => great ? `${who} are still talking about your risotto.` : `${who} were very polite about the casserole.`);
    },
  },

];
