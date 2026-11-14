/** Moments along the hobby paths: firsts, scares, breaks, and bragging rights. */
import { stableHash } from './relationships';
import { CAREER_BY_ID } from '../content/careers';
import { DEDUCTIBLE } from '../content/economy';
import type { Ctx, EventDef } from './eventKit';
import { ownsGear, restoreProgress } from './hobbies';
import { relativesOutside } from './activityKit';
import { local } from './eventKit';
import type { Hobby, Person } from './types';
import { adjustBond, ageOf, flag, journal, kidsAtHome, money, stat } from './util';
import { charge, credit } from './money';

const wallet = (c: Ctx) => c.s.households[c.me.householdId];
const skill = (p: Person, h: Hobby) => p.skills[h] ?? 0;
const one = (cond: boolean, weight: number) => (cond ? [{ weight, urgent: false }] : []);
const adult = (c: Ctx) => ageOf(c.me, c.s.year) >= 18;
const practiced = (c: Ctx) => (c.s.plan.alloc.practice ?? 0) > 0;
/** Your job, if you've held it since before this year. */
const job = (c: Ctx) => (c.me.jobId && c.me.flags.hired_year !== c.s.year ? CAREER_BY_ID[c.me.jobId] : undefined);

export const HOBBY_EVENTS: EventDef[] = [
  {
    id: 'first_solo',
    stage: 'any',
    major: false,
    cooldown: 0,
    candidates: (c) => one(c.me.hobby === 'flying' && skill(c.me, 'flying') >= 20 && !c.me.flags.first_solo, 6),
    build: () => ({
      title: 'First solo flight',
      text: 'Your instructor climbs out of the plane and says, "Take it around the pattern. By yourself."',
      choices: [{ id: 'go', label: 'Take off' }, { id: 'wait', label: 'Not today', hint: 'Nerves' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'wait') return 'There will be another day.';
      c.me.flags.first_solo = 1;
      c.me.skills.flying = Math.min(100, skill(c.me, 'flying') + 5);
      stat(c.me, 'happiness', 8);
      journal(c.s, 'You flew solo for the first time.', 'major');
      return 'Three landings, all yours. They cut your shirt tail off, a pilot tradition.';
    },
  },
  {
    id: 'engine_trouble',
    major: false,
    severe: true,
    cooldown: 4,
    candidates: (c) => one(c.me.hobby === 'flying' && skill(c.me, 'flying') >= 30 && practiced(c), 0.4),
    build: () => ({
      title: 'Engine trouble',
      text: 'At 3,000 feet the engine coughs, then goes quiet. A farm field stretches out below.',
      choices: [{ id: 'land', label: 'Fly the plane: pick a field and land it' }, { id: 'restart', label: 'Try to restart the engine first', hint: 'Riskier' }],
    }),
    resolve: (c, ch) => {
      const odds = Math.min(0.95, skill(c.me, 'flying') / 100 + (ch === 'land' ? 0.25 : 0.05));
      if (c.rng.chance(odds)) {
        flag(c.me, 'steady_hands');
        stat(c.me, 'stress', 6);
        return 'A textbook emergency landing. The farmer brought you lemonade while you waited.';
      }
      stat(c.me, 'health', -12);
      charge(wallet(c), ownsGear(wallet(c), 'plane') ? 15000 : DEDUCTIBLE.home);
      return 'A hard landing, a broken wrist, and a bent plane. You were lucky.';
    },
  },
  {
    id: 'workshop_injury',
    major: false,
    severe: true,
    cooldown: 4,
    candidates: (c) => one((c.me.hobby === 'woodworking' || c.me.hobby === 'mechanics') && practiced(c), 0.35),
    build: () => ({
      title: 'Ouch',
      text: 'A moment of distraction in the workshop, and now there is a lot of blood.',
      choices: [{ id: 'er', label: 'Go to the ER ($1,500)' }, { id: 'tape', label: 'Tape it up and keep working', hint: 'Tough, but risky' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'er') {
        charge(wallet(c), 1500);
        stat(c.me, 'health', -4);
        return 'Six stitches. You bought proper safety glasses on the way home.';
      }
      stat(c.me, 'health', c.rng.chance(0.5) ? -12 : -3);
      return 'It healed, mostly. Your grip isn’t quite the same.';
    },
  },
  {
    id: 'food_critic',
    major: false,
    cooldown: 3,
    candidates: (c) => one(!!job(c) && (job(c)!.id === 'restaurant_owner' || (job(c)!.id === 'chef' && c.me.jobLevel >= 2)), 1.2),
    build: () => ({
      title: 'A critic at table six',
      text: 'The city’s toughest food critic just sat down.',
      choices: [{ id: 'bold', label: 'Cook your boldest dish', hint: 'Skill decides' }, { id: 'safe', label: 'Play it safe' }],
    }),
    resolve: (c, ch) => {
      const owner = job(c)!.id === 'restaurant_owner';
      if (ch === 'safe') return '"Competent," the review said. Business as usual.';
      if (c.rng.chance(skill(c.me, 'cooking') / 110)) {
        credit(wallet(c), owner ? 25000 : 3000);
        flag(c.me, 'rave_review');
        journal(c.s, 'A rave review! The phone hasn’t stopped ringing.', 'good');
        return 'Four stars. There is a line out the door.';
      }
      if (owner) charge(wallet(c), 15000);
      stat(c.me, 'stress', 6);
      return 'Two stars and the word "overambitious." It stung.';
    },
  },
  {
    id: 'bad_review',
    major: false,
    cooldown: 5,
    candidates: (c) => one(!!job(c) && (job(c)!.id === 'restaurant_owner' || (job(c)!.id === 'chef' && c.me.jobLevel >= 2)), 0.6),
    build: () => ({
      title: 'A one-star review',
      text: 'A furious one-star review is going around: cold soup, a long wait, and a photo that does your best dish no favors.',
      choices: [
        { id: 'respond', label: 'Reply publicly and set the record straight', hint: 'Could win people over, or make it worse' },
        { id: 'fix', label: 'Invite them back and fix what went wrong', hint: 'Humble, slow, usually works' },
        { id: 'ignore', label: 'Ignore it', hint: 'It will blow over. Probably.' },
      ],
    }),
    resolve: (c, ch) => {
      const owner = job(c)!.id === 'restaurant_owner';
      flag(c.me, 'bad_review');
      if (ch === 'fix') {
        c.me.skills.cooking = Math.min(100, skill(c.me, 'cooking') + 3);
        stat(c.me, 'stress', 3);
        return 'They came back, loved it, and updated the review to four stars. Your kitchen runs tighter now.';
      }
      if (ch === 'respond' && c.rng.chance(0.5)) {
        if (owner) credit(wallet(c), 8000);
        return 'Your reply was funny and gracious. People came in just to meet you.';
      }
      if (owner) charge(wallet(c), ch === 'respond' ? 12000 : 5000);
      stat(c.me, 'stress', 6);
      return ch === 'respond' ? 'The reply went viral for the wrong reasons. A slow month followed.' : 'A few slow weeks, then the regulars came back.';
    },
  },
  {
    id: 'thanksgiving_for_20',
    major: false,
    cooldown: 5,
    candidates: (c) => one(adult(c) && skill(c.me, 'cooking') >= 40 && relativesOutside(c.s, c.me).length >= 3, 0.5),
    build: (c) => ({
      title: 'Thanksgiving for twenty',
      text: 'Word is out that you are the best cook in the family. Everyone wants Thanksgiving at your place this year: all twenty of them.',
      choices: [
        { id: 'host', label: `Host it, and cook everything yourself (${money(local(c, 1200))})`, hint: 'A huge day; skill decides how it goes' },
        { id: 'potluck', label: 'Host a potluck', hint: 'Less work, smaller glory' },
        { id: 'decline', label: 'Not this year', hint: 'Someone else will do it' },
      ],
    }),
    resolve: (c, ch) => {
      const family = relativesOutside(c.s, c.me);
      if (ch === 'decline') return 'Your aunt hosted. The turkey was dry, and everyone mentioned your cooking.';
      if (ch === 'potluck') {
        for (const p of family) adjustBond(c.s, c.me.id, p.id, 3, 2);
        return 'Seven pies, no vegetables, and a very happy family.';
      }
      charge(wallet(c), local(c, 1200));
      flag(c.me, 'thanksgiving_host');
      c.me.skills.cooking = Math.min(100, skill(c.me, 'cooking') + 2);
      if (c.rng.chance(skill(c.me, 'cooking') / 110)) {
        for (const p of family) adjustBond(c.s, c.me.id, p.id, 7, 4);
        stat(c.me, 'happiness', 8);
        return 'A golden turkey, six sides, and a standing ovation. Your recipes are family legend now.';
      }
      for (const p of family) adjustBond(c.s, c.me.id, p.id, 4, 2);
      stat(c.me, 'stress', 8);
      return 'The oven gave out halfway through the turkey. Takeout pizza, lots of laughter, a story for years.';
    },
  },
  {
    id: 'impossible_repair',
    major: false,
    cooldown: 5,
    candidates: (c) => one(adult(c) && (['mechanic', 'shop_owner'].includes(c.me.jobId ?? '') || skill(c.me, 'mechanics') >= 50), 0.5),
    build: () => ({
      title: 'The impossible repair',
      text: 'A customer tows in a car three shops have given up on. Electrical gremlins, a strange knock, and a very worried owner.',
      choices: [{ id: 'take', label: 'Take it on', hint: 'Skill decides; it could take weeks' }, { id: 'refer', label: 'Send them to the dealer' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'refer') return 'The dealer quoted them a new engine. They still send you a card at Christmas.';
      if (c.rng.chance(Math.min(0.9, skill(c.me, 'mechanics') / 100 + 0.1))) {
        flag(c.me, 'impossible_repair');
        credit(wallet(c), 1500);
        c.me.skills.mechanics = Math.min(100, skill(c.me, 'mechanics') + 3);
        stat(c.me, 'happiness', 6);
        return 'A corroded ground wire behind the dash. It runs like new, and the owner tells everyone about you.';
      }
      stat(c.me, 'stress', 6);
      return 'Three weekends and no answer. You handed back the keys and a refund, humbled.';
    },
  },
  {
    id: 'restore_with_kid',
    stage: 'any',
    major: false,
    cooldown: 4,
    // The project car, or an old family car that needs some love (less often).
    candidates: (c) => {
      const car = wallet(c).assets.find((a) => a.gear === 'project_car' && (a.restore ?? 0) < 100);
      const oldCar = wallet(c).assets.some((a) => a.kind === 'car' && !a.broken && (a.age ?? 0) >= 10);
      if (!adult(c) || (!car && !oldCar)) return [];
      return kidsAtHome(c.s, c.me).filter((k) => ageOf(k, c.s.year) >= 8).slice(0, 1).map((k) => ({ weight: car ? 1.2 : 0.25, subject: k }));
    },
    build: (_c, kid) => ({
      title: 'A helper in the garage',
      text: `${kid!.firstName} has been hanging around the garage while you work on the ${wallet(_c).assets.some((a) => a.gear === 'project_car' && (a.restore ?? 0) < 100) ? 'project car' : 'old family car'}, asking what everything does.`,
      choices: [
        { id: 'together', label: `Hand ${kid!.firstName} a wrench`, hint: 'Slower work, a lot of talking' },
        { id: 'alone', label: 'Shoo them out; you need to concentrate', hint: 'Faster progress' },
      ],
    }),
    resolve: (c, ch, kid) => {
      const car = wallet(c).assets.find((a) => a.gear === 'project_car' && (a.restore ?? 0) < 100);
      if (ch === 'alone') {
        if (car) restoreProgress(car, 8);
        adjustBond(c.s, c.me.id, kid!.id, -2, 0);
        return 'You got a lot done. The garage felt a little quiet.';
      }
      if (car) restoreProgress(car, 4);
      adjustBond(c.s, c.me.id, kid!.id, 10, 6);
      kid!.skills.mechanics = Math.min(100, (kid!.skills.mechanics ?? 0) + 8);
      flag(kid!, 'car_with_parent');
      return `Grease up to the elbows, ${kid!.firstName} found the leak you had missed for a month. You will never hear the end of it.`;
    },
  },
  {
    id: 'viral_song',
    major: false,
    cooldown: 6,
    candidates: (c) => one(adult(c) && skill(c.me, 'music') >= 60, 0.4),
    build: () => ({
      title: 'Your song took off',
      text: 'A video of you playing an original song has a few million views overnight.',
      choices: [{ id: 'ride', label: 'Ride the wave: shows, merch, interviews', hint: 'Money now; tiring' }, { id: 'quiet', label: 'Enjoy it quietly' }],
    }),
    resolve: (c, ch) => {
      flag(c.me, 'viral');
      if (ch === 'quiet') { stat(c.me, 'happiness', 6); return 'You read every comment. Then you wrote another song.'; }
      const pay = 5000 + skill(c.me, 'music') * 250;
      credit(wallet(c), pay);
      stat(c.me, 'stress', 6);
      return `A whirlwind month: ${money(pay)} and a lot of airports.`;
    },
  },
  {
    // A shot at a bigger stage: a band, an orchestra seat, or a tour needs a player.
    id: 'big_audition',
    major: false,
    cooldown: 5,
    candidates: (c) => one(adult(c) && skill(c.me, 'music') >= 45 && !(c.me.jobId === 'musician' && c.me.jobLevel >= 3), 0.5),
    build: () => ({
      title: 'A big audition',
      text: 'A touring band lost their player a week before the tour. A friend got you an audition. Tomorrow. Bring two songs.',
      choices: [{ id: 'go', label: 'Practice all night and go for it', hint: 'Skill decides it; nerves don’t help' }, { id: 'pass', label: 'Pass', hint: 'Not the right time' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'pass') return 'You wished them luck. Maybe next time.';
      const odds = Math.min(0.9, Math.max(0.1, skill(c.me, 'music') / 100 + 0.1 - Math.max(0, c.me.stats.stress - 60) / 200));
      c.me.skills.music = Math.min(100, skill(c.me, 'music') + 2);
      if (!c.rng.chance(odds)) {
        stat(c.me, 'happiness', -5);
        stat(c.me, 'stress', 4);
        return 'Your hands shook on the second song. They went with someone else, but you learned a lot about playing under pressure.';
      }
      flag(c.me, 'audition_won');
      stat(c.me, 'happiness', 8);
      c.me.skills.music = Math.min(100, skill(c.me, 'music') + 4);
      // A session player gets the bump to touring; anyone else gets a paid run of shows.
      if (c.me.jobId === 'musician' && c.me.jobLevel === 1) {
        c.me.jobLevel = 2;
        journal(c.s, 'You won the audition and went out on tour.', 'major');
        return 'You nailed it. Pack a bag: you are a touring musician now.';
      }
      const pay = 3000 + skill(c.me, 'music') * 60;
      credit(wallet(c), pay);
      journal(c.s, `You won the audition and played a run of shows (${money(pay)}).`, 'good');
      return `You nailed it. A month of shows, ${money(pay)}, and your name on a poster.`;
    },
  },
  {
    // Scheduled by bigBreakYear: a hit song or a won headline audition. Taking it makes you a Headliner.
    id: 'big_break',
    major: true,
    cooldown: 0,
    build: (c) => {
      const song = stableHash(`${c.s.seed}:${c.s.year}:${c.me.id}:kind`) % 2 === 0;
      return {
        title: song ? 'A hit song' : 'The headline audition',
        text: song
          ? 'A song you wrote on a slow afternoon is suddenly everywhere: radio, ads, a million covers. A promoter wants you at the top of the bill, starting this summer.'
          : 'A festival lost its headliner and auditioned a dozen acts in a week. They picked you. The slot is yours if you want it.',
        choices: [
          { id: 'headline', label: '🎤 Take the top of the bill', hint: 'Headliner pay, a heavy touring schedule' },
          { id: 'stay', label: song ? 'Take the royalties and keep your life as it is' : 'Thank them and keep the life you have', hint: song ? 'A one-time windfall' : 'Your touring life stays as it is' },
        ],
      };
    },
    resolve: (c, ch) => {
      c.me.flags.big_break = c.s.year;
      const song = stableHash(`${c.s.seed}:${c.s.year}:${c.me.id}:kind`) % 2 === 0;
      if (ch === 'headline') {
        c.me.jobLevel = 3;
        c.me.jobYears = 0;
        stat(c.me, 'happiness', 10);
        stat(c.me, 'stress', 6);
        journal(c.s, song ? 'Your song became a hit, and you became a headliner.' : 'You won the headline audition and topped the bill.', 'major');
        return 'Your name at the top of the poster. Your mother framed it.';
      }
      if (song) {
        const pay = 25_000;
        credit(wallet(c), pay);
        journal(c.s, `Your song became a hit; you kept your life as it was and took the royalties (${money(pay)}).`, 'good');
        return 'You still hear it in grocery stores. You still smile every time.';
      }
      return 'You turned it down. Some nights you wonder; most nights you are glad.';
    },
  },
  {
    id: 'big_catch',
    major: false,
    cooldown: 3,
    candidates: (c) => one(skill(c.me, 'fishing') >= 50, 0.6),
    build: () => ({
      title: 'The big one',
      text: 'After a forty-minute fight, the biggest fish you have ever seen is in the net.',
      choices: [{ id: 'mount', label: 'Have it mounted ($800)' }, { id: 'release', label: 'A photo, then let it go' }],
    }),
    resolve: (c, ch) => {
      flag(c.me, 'big_catch');
      stat(c.me, 'happiness', 8);
      if (ch === 'mount') { charge(wallet(c), 800); return 'It hangs over the fireplace. Everyone hears the story.'; }
      return 'It swam off with a flick of its tail. The photo is your phone background forever.';
    },
  },
  {
    id: 'storm_at_sea',
    major: false,
    severe: true,
    cooldown: 4,
    candidates: (c) => one(ownsGear(wallet(c), 'offshore_boat'), 0.5),
    build: () => ({
      title: 'Storm on the horizon',
      text: 'Thirty miles out, the sky goes black and the swells start building.',
      choices: [{ id: 'back', label: 'Head for port now' }, { id: 'push', label: 'The fish are biting; push on', hint: 'Skill decides' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'back') return 'You made it in just as the rain hit. Smart call.';
      if (c.rng.chance(skill(c.me, 'fishing') / 120)) {
        credit(wallet(c), 3000);
        return 'You rode it out and came back with a full cooler. Legendary.';
      }
      charge(wallet(c), 15000);
      stat(c.me, 'stress', 8);
      return 'A rogue wave smashed the electronics. $15,000 in repairs.';
    },
  },
  {
    id: 'county_fair',
    stage: 'any',
    major: false,
    cooldown: 2,
    candidates: (c) => one(skill(c.me, 'gardening') >= 40 || skill(c.me, 'cooking') >= 40 || skill(c.me, 'woodworking') >= 40, 0.8),
    build: (c) => {
      const what = skill(c.me, 'gardening') >= 40 ? 'your prize tomatoes' : skill(c.me, 'cooking') >= 40 ? 'your famous pie' : 'a hand-built birdhouse';
      return {
        title: 'The county fair',
        text: `Entries close tomorrow. Do you enter ${what}?`,
        choices: [{ id: 'enter', label: 'Enter it' }, { id: 'skip', label: 'Just go for the funnel cake' }],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'skip') { stat(c.me, 'happiness', 2); return 'Funnel cake was the right call.'; }
      const best = Math.max(skill(c.me, 'gardening'), skill(c.me, 'cooking'), skill(c.me, 'woodworking'));
      if (c.rng.chance(best / 110)) {
        flag(c.me, 'blue_ribbon');
        credit(wallet(c), 250);
        return 'Blue ribbon! And $250.';
      }
      return 'Honorable mention. Next year.';
    },
  },
];
