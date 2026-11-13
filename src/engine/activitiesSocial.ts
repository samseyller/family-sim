/** Activities: Social life, friends, money and luck, vices, and kid stuff. */
import { addHobbySkill } from './hobbies';
import { adjustBond, ageOf, flag, money, partnerOf, stat } from './util';
import { homeParents } from './generate';
import { cityName, cityOf } from './location';
import { friendsOf, maybeMeetFriend, sawFriend } from './friends';
import { jobBlurb } from './romance';
import { type ActivityDef, flat, bondAll, moodAll, names, working, hangOut } from './activityKit';
import { credit } from './money';

export const SOCIAL_ACTIVITIES: ActivityDef[] = [
  // 🎉 Social
  {
    id: 'night_out', category: 'social', icon: '🍻', label: 'Night out with friends', who: 'friends', min: 0, max: 4, where: 'near',
    desc: 'Catch up, laugh, stay out late. Go alone and you might make a new friend.',
    energy: flat(12), cost: (_s, ppl) => 60 + 40 * ppl.length,
    run: (c) => {
      stat(c.me, 'happiness', 6);
      stat(c.me, 'stress', -6);
      if (!partnerOf(c.s, c.me.id)) flag(c.me, 'met_people');
      if (!c.people.length) {
        const f = maybeMeetFriend(c.s, c.rng, c.me, 0.35, 'on a night out');
        return { text: f ? `You got talking with ${f.firstName}${jobBlurb(f)} at the bar. You swapped numbers.` : 'A fun night with the regulars.', tone: 'good' };
      }
      return hangOut(c, 6, 3, (who) => `You and ${who} closed the place down. Your face hurts from laughing.`);
    },
  },
  {
    id: 'volunteer', category: 'social', icon: '🤝', label: 'Volunteer', who: 'household', min: 0, ages: [12, 120], desc: 'Give an afternoon to a good cause. You might make a friend.',
    energy: flat(12), cost: flat(0),
    run: (c) => {
      moodAll(c, 'happiness', 5);
      bondAll(c, 3, 3);
      flag(c.me, 'volunteer');
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.2, 'volunteering');
      return { text: f ? `You helped at the food bank, and ${f.firstName} asked if you'd come again next week.` : 'You helped at the food bank. It helped you too.', tone: 'good' };
    },
  },
  {
    id: 'join_club', category: 'social', icon: '📚', label: 'Join a club', who: 'solo', perYear: 2, desc: 'A book club, rec league, or trivia team. A great way to make friends.',
    energy: flat(10), cost: flat(120),
    run: (c) => {
      stat(c.me, 'happiness', 3);
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.55, c.rng.pick(['at book club', 'in a rec league', 'on a trivia team']));
      return { text: f ? `You and ${f.firstName} hit it off right away.` : 'Nice people, but no real connection yet.', tone: f ? 'good' : 'neutral' };
    },
  },

  // 👋 Friends: in person (same city), from anywhere (calls, games), or a planned trip
  {
    id: 'coffee_friend', category: 'social', icon: '☕', label: 'Coffee with a friend', who: 'friends', max: 1, where: 'near', desc: 'An hour to catch up.',
    energy: flat(4), cost: flat(12),
    run: (c) => hangOut(c, 5, 3, (who) => `You and ${who} talked until the coffee went cold.`),
  },
  {
    id: 'game_day', category: 'social', icon: '🏈', label: 'Watch the game together', who: 'friends', max: 5, where: 'near', desc: 'Snacks, yelling at the TV, high fives.',
    energy: flat(6), cost: (_s, ppl) => 20 + 15 * ppl.length,
    run: (c) => hangOut(c, 4, 2, (who) => `You and ${who} celebrated a last-second win.`),
  },
  {
    id: 'hike_friends', category: 'social', icon: '🥾', label: 'Go hiking with friends', who: 'friends', max: 3, where: 'near', desc: 'Fresh air and long talks.',
    energy: flat(12), cost: flat(15),
    run: (c) => { stat(c.me, 'fitness', 3); return hangOut(c, 5, 4, (who) => `You and ${who} made it to the top and shared the view.`); },
  },
  {
    id: 'help_friend_move', category: 'social', icon: '📦', label: 'Help a friend move', who: 'friends', max: 1, where: 'near', perYear: 2, desc: 'Lift boxes; earn eternal gratitude (and pizza).',
    energy: flat(14), cost: flat(0),
    run: (c) => { stat(c.me, 'stress', 2); return hangOut(c, 8, 7, (who) => `You carried ${who}'s couch up three flights. They owe you big.`); },
  },
  {
    id: 'host_party', category: 'social', icon: '🎂', label: 'Throw a party', who: 'friends', min: 2, max: 10, where: 'near', perYear: 2, desc: 'Invite your friends over.',
    energy: flat(15), cost: (_s, ppl) => 100 + 30 * ppl.length,
    run: (c) => { stat(c.me, 'happiness', 6); return hangOut(c, 4, 2, (who) => `A great party. ${who} stayed to help clean up.`); },
  },
  {
    id: 'call_friend', category: 'social', icon: '📞', label: 'Call a friend', who: 'friends', max: 1, where: 'any', desc: 'Works from anywhere.',
    energy: flat(2), cost: flat(0),
    run: (c) => hangOut(c, 3, 2, (who) => `An hour on the phone with ${who}. It felt like no time had passed.`, 'no-answer'),
  },
  {
    id: 'video_games', category: 'social', icon: '🎮', label: 'Play video games online', who: 'friends', max: 3, where: 'any', desc: 'Headsets on, wherever you all live.',
    energy: flat(4), cost: flat(0),
    run: (c) => { stat(c.me, 'stress', -3); return hangOut(c, 3, 1, (who) => `You and ${who} finally beat the final boss at 2 a.m.`, 'no-answer'); },
  },
  {
    id: 'mentor', category: 'social', icon: '🧑‍🏫', label: 'Mentor someone', who: 'close', max: 1,
    requires: (_s, me) => (me.jobLevel >= 2 || Object.values(me.skills).some((v) => (v ?? 0) >= 50) ? null : 'Needs experience: a senior job, or real skill at something.'),
    eligible: (s, p) => p.birthYear > (s.people[s.activeId]?.birthYear ?? 0) + 10,
    desc: 'Pass on what you know to someone younger in the family.',
    energy: flat(12), cost: flat(0), perYear: 2,
    run: (c) => {
      const [p] = c.people;
      adjustBond(c.s, c.me.id, p.id, 5, 6);
      stat(p, 'smarts', 2);
      stat(c.me, 'happiness', 3);
      return { text: `You showed ${p.firstName} what took you years to learn. ${p.firstName} took notes.`, tone: 'good' };
    },
  },
  {
    id: 'volunteer_together', category: 'social', icon: '🫶', label: 'Volunteer together', who: 'household', min: 1, max: 3,
    desc: 'A food bank shift or a park cleanup, as a family.',
    energy: flat(12), cost: flat(0), perYear: 2,
    run: (c) => {
      bondAll(c, 4, 4);
      moodAll(c, 'happiness', 4);
      return { text: `You and ${names(c.people)} sorted cans for three hours and laughed the whole time.`, tone: 'good' };
    },
  },
  {
    id: 'visit_friend', category: 'social', icon: '✈️', label: 'Plan a trip to see a friend', who: 'friends', max: 1, where: 'far',
    desc: 'They live in another city: flights and a hotel, but a big boost to the friendship.',
    energy: flat(22), cost: flat(800),
    run: (c) => {
      const r = hangOut(c, 12, 8, (who) => `A long weekend with ${who} in ${c.people[0] ? cityName(cityOf(c.s, c.people[0])) : 'their city'}. You didn't stop talking.`);
      if (r.tone === 'bad') {
        // They never replied, so the trip was called off (the fare was refundable).
        credit(c.s.households[c.me.householdId], 800);
        return { text: `${r.text} You cancelled the trip and got your money back.`, tone: 'bad' };
      }
      flag(c.me, 'friend_trip');
      stat(c.me, 'happiness', 6);
      stat(c.me, 'stress', -4);
      return r;
    },
  },

  // 🎲 Money & luck
  {
    id: 'horse_races', category: 'risk', icon: '🏇', label: 'Bet on the horse races', who: 'solo', ages: [21, 120], desc: 'A $100 bet, a racing form you half understand, and a lot of yelling.',
    energy: flat(10), cost: flat(100),
    run: (c) => {
      const hh = c.s.households[c.me.householdId];
      const r = c.rng.next();
      if (r < 0.05) { credit(hh, 1600); flag(c.me, 'longshot'); stat(c.me, 'happiness', 8); return { text: 'Your 15-to-1 longshot came from nowhere on the final turn. You won $1,600!', tone: 'good' }; }
      if (r < 0.3) { credit(hh, 260); stat(c.me, 'happiness', 3); return { text: 'The favorite came through. A small win, and a great afternoon.', tone: 'good' }; }
      stat(c.me, 'happiness', -2);
      return { text: c.rng.pick(['Your horse stopped to look at a bird. Truly.', 'Neck and neck to the line, then a nose short.', 'You picked by name. The name was a lie.']), tone: 'bad' };
    },
  },
  {
    id: 'lottery', category: 'risk', icon: '🎟️', label: 'Lottery ticket', who: 'solo', desc: 'Two dollars and a dream.',
    energy: flat(2), cost: flat(2),
    run: (c) => {
      const r = c.rng.next();
      const hh = c.s.households[c.me.householdId];
      if (r < 0.0005) { credit(hh, 250000); flag(c.me, 'lottery_win'); return { text: 'JACKPOT. $250,000. You had to sit down.', tone: 'good' }; }
      if (r < 0.02) { credit(hh, 100); return { text: 'Three numbers! You won $100.', tone: 'good' }; }
      return { text: 'Not a single number. Maybe next time.', tone: 'neutral' };
    },
  },
  {
    id: 'casino', category: 'risk', icon: '🎰', label: 'Casino weekend', who: 'solo', desc: 'Bright lights; the house usually wins.',
    energy: flat(25), cost: flat(1000),
    run: (c) => {
      const r = c.rng.next();
      const hh = c.s.households[c.me.householdId];
      if (r < 0.1) { credit(hh, 3500); stat(c.me, 'happiness', 8); return { text: 'Hot streak at the blackjack table: you walked out $2,500 up.', tone: 'good' }; }
      if (r < 0.35) { credit(hh, 1000); return { text: 'You broke even. A fun weekend for the price of the hotel.', tone: 'neutral' }; }
      stat(c.me, 'happiness', -3);
      return { text: 'The house won. It always seems to.', tone: 'bad' };
    },
  },
  {
    id: 'side_gig', category: 'risk', icon: '🧰', label: 'Weekend side gig', who: 'solo', ages: [16, 120], desc: 'Odd jobs for extra cash.',
    energy: flat(20), cost: flat(0),
    run: (c) => { const pay = c.rng.int(600, 1800); credit(c.s.households[c.me.householdId], pay); stat(c.me, 'stress', 5); return { text: `You earned ${money(pay)} assembling furniture for strangers.`, tone: 'good' }; },
  },
  {
    id: 'garage_sale', category: 'risk', icon: '🏷️', label: 'Garage sale', who: 'solo', perYear: 1, desc: 'Turn clutter into cash.',
    energy: flat(15), cost: flat(0),
    run: (c) => { const pay = c.rng.int(200, 900); credit(c.s.households[c.me.householdId], pay); stat(c.me, 'happiness', 2); return { text: `The old exercise bike finally went. ${money(pay)} richer.`, tone: 'good' }; },
  },

  // ⚠️ Vices — feel good now, cost later
  {
    id: 'shut_down_bar', category: 'vices', icon: '🍻', label: 'Shut down a bar', who: 'solo', ages: [21, 90], desc: 'Last call? Never heard of it.',
    energy: flat(14), cost: flat(180),
    run: (c) => {
      stat(c.me, 'happiness', 6);
      stat(c.me, 'stress', -4);
      stat(c.me, 'health', -5);
      flag(c.me, 'closed_bar');
      if (c.me.jobId) c.me.workPerf = Math.max(0, c.me.workPerf - 5);
      const f = maybeMeetFriend(c.s, c.rng, c.me, 0.15, 'at the bar');
      return { text: f ? `You and ${f.firstName} were the last ones out, singing. Friends for life (or at least till Tuesday).` : 'The bartender knew your name by midnight. The morning did not go well.', tone: 'neutral' };
    },
  },
  {
    id: 'doom_scroll', category: 'vices', icon: '📱', label: 'Doom scroll for hours', who: 'solo', ages: [13, 120], desc: 'Just one more video. And one more.',
    energy: flat(6), cost: flat(0),
    run: (c) => {
      stat(c.me, 'happiness', -4);
      stat(c.me, 'stress', 4);
      stat(c.me, 'smarts', -1);
      flag(c.me, 'doom_scrolled');
      return { text: c.rng.pick(['Three hours vanished. You now know far too much about a celebrity feud.', 'It got dark outside. You did not notice.', 'You watched a man restore a rusty knife for forty minutes. Then another one.']), tone: 'bad' };
    },
  },
  {
    id: 'party', category: 'vices', icon: '🪩', label: 'Party all night', who: 'solo', desc: 'Dance till dawn. Pay for it tomorrow.',
    energy: flat(15), cost: flat(150),
    run: (c) => { stat(c.me, 'happiness', 8); stat(c.me, 'health', -4); stat(c.me, 'stress', -4); return { text: 'Legendary night. Rough morning.', tone: 'neutral' }; },
  },
  {
    id: 'skip_work', category: 'vices', icon: '🛌', label: 'Call in sick', who: 'solo', desc: 'A day off you did not earn.',
    requires: working, energy: flat(5), cost: flat(0),
    run: (c) => { stat(c.me, 'stress', -10); c.me.workPerf = Math.max(0, c.me.workPerf - 8); return { text: 'Blissful. Your manager noticed, though.', tone: 'neutral' }; },
  },
  {
    id: 'retail_therapy', category: 'vices', icon: '🛍️', label: 'Shopping spree', who: 'solo', desc: 'Buy things you do not need.',
    energy: flat(8), cost: flat(800),
    run: (c) => { stat(c.me, 'happiness', 6); return { text: 'Bags everywhere. The glow lasted until the card statement.', tone: 'neutral' }; },
  },

  // 🧸 Kid stuff (the player as a child)
  {
    id: 'play_friends', category: 'kid', icon: '⚽', label: 'Play with friends', who: 'solo', ages: [5, 17], desc: 'Outside until the streetlights come on.',
    energy: flat(6), cost: flat(0),
    run: (c) => { stat(c.me, 'happiness', 4); stat(c.me, 'fitness', 2); return { text: 'Muddy knees, best day ever.', tone: 'good' }; },
  },
  {
    id: 'play_sibling', category: 'kid', icon: '🧩', label: 'Play with a sibling', who: 'household', max: 1, ages: [3, 17], desc: 'Forts, games, a little arguing.',
    eligible: (s, p) => ageOf(p, s.year) < 18, energy: flat(6), cost: flat(0),
    run: (c) => { bondAll(c, 5, 3); moodAll(c, 'happiness', 3); return { text: `You and ${c.people[0].firstName} built the greatest blanket fort in history.`, tone: 'good' }; },
  },
  {
    id: 'zoo', category: 'kid', icon: '🦁', label: 'Ask to go to the zoo', who: 'solo', ages: [3, 13], kidAsk: true, desc: 'Lions! (If your parents say yes.)',
    energy: flat(10), cost: flat(120),
    run: (c) => { stat(c.me, 'happiness', 6); for (const p of homeParents(c.s, c.me)) adjustBond(c.s, c.me.id, p.id, 4, 2); return { text: 'The penguins were your favorite. You will be talking about them for weeks.', tone: 'good' }; },
  },
  {
    id: 'sports_camp', category: 'kid', icon: '⛺', label: 'Ask to go to summer camp', who: 'solo', ages: [8, 16], kidAsk: true, desc: 'A week away with new friends.',
    energy: flat(20), cost: flat(500),
    run: (c) => { stat(c.me, 'happiness', 7); stat(c.me, 'fitness', 4); if (c.me.hobby) addHobbySkill(c.s, c.me, c.me.hobby, 4); return { text: 'Campfires, bug bites, and a friend for life.', tone: 'good' }; },
  },
  {
    id: 'music_camp', category: 'kid', icon: '🎻', label: 'Ask to go to music camp', who: 'solo', ages: [8, 16], kidAsk: true, perYear: 1,
    desc: 'A week of lessons, jam sessions and a concert on the last night.',
    energy: flat(20), cost: flat(800),
    run: (c) => {
      stat(c.me, 'happiness', 6);
      addHobbySkill(c.s, c.me, 'music', c.me.hobby === 'music' ? 8 : 4);
      return { text: c.me.hobby === 'music' ? 'You played a solo at the final concert. Your parents filmed all of it.' : 'You learned three chords and a song about the camp cook.', tone: 'good' };
    },
  },
  {
    id: 'science_fair', category: 'kid', icon: '🔬', label: 'Science fair project', who: 'solo', ages: [8, 17], perYear: 1, desc: 'A volcano? A robot? Glory awaits.',
    energy: flat(15), cost: flat(0),
    run: (c) => {
      stat(c.me, 'smarts', 4);
      if (c.rng.chance(c.me.stats.smarts / 150)) { stat(c.me, 'happiness', 6); flag(c.me, 'science_ribbon'); return { text: 'Blue ribbon! Your parents framed it.', tone: 'good' }; }
      return { text: 'The volcano erupted a little early. You still learned a lot.', tone: 'neutral' };
    },
  },
  {
    id: 'sleepover', category: 'kid', icon: '🛏️', label: 'Ask to have a sleepover', who: 'solo', ages: [6, 14], kidAsk: true, perYear: 1,
    desc: 'Pizza, a movie, and whispering until 2 a.m. (If your parents say yes.)',
    energy: flat(15), cost: flat(60),
    run: (c) => {
      stat(c.me, 'happiness', 6);
      const pal = friendsOf(c.s, c.me)[0];
      if (pal) { adjustBond(c.s, c.me.id, pal.id, 6, 4); sawFriend(c.s, c.me, pal); }
      const met = pal ? undefined : maybeMeetFriend(c.s, c.rng, c.me, 0.6, 'at a sleepover');
      if (c.rng.chance(0.3)) { stat(c.me, 'stress', 3); return { text: 'Nobody slept. Breakfast was very quiet.', tone: 'neutral' }; }
      if (met) return { text: `You stayed up swapping secrets with ${met.firstName}. Friends for sure now.`, tone: 'good' };
      return { text: pal ? `You and ${pal.firstName} built a blanket fort and talked until 2 a.m.` : 'Pizza, a scary movie, and a blanket fort.', tone: 'good' };
    },
  },
];
