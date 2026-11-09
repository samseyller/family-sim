/**
 * Playable childhood: events that only fire while the active character is under 18,
 * plus the player's own coming of age. Adult events are filtered out for children
 * (see EventDef.stage in events.ts).
 */
import { HOBBY_BY_ID } from '../content/actions';
import type { Ctx, EventDef } from './events';
import { moveOut, startPath, type LifePath } from './family';
import type { GameState, Hobby, Person } from './types';
import { adjustBond, ageOf, alive, clamp, flag, getBond, journal, money, parentsOf, partnerOf, stat } from './util';

/** Living parents who share the active character's home. */
export const parentsAtHome = (s: GameState, p: Person) => parentsOf(s, p).filter((x) => alive(x) && x.householdId === p.householdId);

const age = (c: Ctx) => ageOf(c.me, c.s.year);
const one = (cond: boolean, weight: number, urgent = false) => (cond ? [{ weight, urgent }] : []);
const social = (c: Ctx) => c.s.plan.alloc.socialize ?? 0;
const avgParentAffinity = (c: Ctx) => {
  const ps = parentsAtHome(c.s, c.me);
  return ps.length ? ps.reduce((sum, p) => sum + getBond(c.s, c.me.id, p.id).affinity, 0) / ps.length : 0;
};
const bondParents = (c: Ctx, dA: number, dT: number) => {
  for (const p of parentsAtHome(c.s, c.me)) adjustBond(c.s, c.me.id, p.id, dA, dT);
};

export const CHILD_EVENTS: EventDef[] = [
  {
    id: 'pick_hobby',
    stage: 'child',
    major: false,
    cooldown: 2,
    candidates: (c) => one(!c.me.hobby && age(c) >= 6 && age(c) <= 13, 6),
    build: () => ({
      title: 'Something to love',
      text: 'School is starting up after-school clubs. Which one catches your eye?',
      choices: [
        { id: 'music', label: `${HOBBY_BY_ID.music.icon} Music club` },
        { id: 'sports', label: `${HOBBY_BY_ID.sports.icon} Sports team` },
        { id: 'art', label: `${HOBBY_BY_ID.art.icon} Art club` },
        { id: 'none', label: 'None of them', hint: 'Maybe next year' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'none') return 'You walked past the sign-up table.';
      c.me.hobby = ch as Hobby;
      c.me.skills[c.me.hobby] = (c.me.skills[c.me.hobby] ?? 0) + 5;
      stat(c.me, 'happiness', 4);
      return `You signed up for ${HOBBY_BY_ID[c.me.hobby].label.toLowerCase()}. Plan Practice time to get good at it.`;
    },
  },
  {
    id: 'report_card',
    stage: 'child',
    major: false,
    cooldown: 2,
    candidates: (c) => one(age(c) >= 7 && parentsAtHome(c.s, c.me).length > 0, 3),
    build: (c) => {
      const good = c.me.stats.smarts >= 55;
      return {
        title: 'Report card',
        text: good ? 'Your report card is full of praise. Your parents stick it on the fridge.' : 'Your grades slipped this term. Your parents want to talk.',
        choices: good
          ? [{ id: 'proud', label: 'Bask in it' }, { id: 'modest', label: "It's no big deal", hint: 'Keep your head down' }]
          : [{ id: 'promise', label: 'Promise to study harder', hint: 'More stress, a bit smarter' }, { id: 'shrug', label: 'Shrug it off', hint: 'Your parents will not love that' }],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'proud') { bondParents(c, 4, 3); stat(c.me, 'happiness', 4); return 'Ice cream for dinner. Best night ever.'; }
      if (ch === 'modest') { bondParents(c, 2, 4); return 'Your parents smiled at each other over your head.'; }
      if (ch === 'promise') { stat(c.me, 'smarts', 3); stat(c.me, 'stress', 5); bondParents(c, 2, 5); return 'Homework at the kitchen table, every night. It is working.'; }
      bondParents(c, -5, -4);
      return 'The talk did not go well.';
    },
  },
  {
    id: 'playground_bully',
    severe: true,
    stage: 'child',
    major: true,
    cooldown: 6,
    candidates: (c) => one(age(c) >= 7 && age(c) <= 14, 2),
    build: () => ({
      title: 'Trouble at recess',
      text: 'An older kid has been taking your lunch money all week.',
      choices: [
        { id: 'stand', label: 'Stand up to them', hint: 'Fitness helps' },
        { id: 'tell', label: 'Tell a grown-up', hint: 'Safer; builds trust at home' },
        { id: 'avoid', label: 'Avoid them', hint: 'Lonely lunches' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'stand') {
        if (c.rng.chance(0.3 + c.me.stats.fitness / 150)) {
          stat(c.me, 'happiness', 8);
          flag(c.me, 'brave');
          return 'You said "no" loud enough for everyone to hear. They never bothered you again.';
        }
        stat(c.me, 'health', -6);
        stat(c.me, 'stress', 6);
        return 'It ended with a scraped knee and a trip to the principal.';
      }
      if (ch === 'tell') {
        bondParents(c, 4, 8);
        stat(c.me, 'stress', -4);
        return 'Your parents called the school. The lunch money stayed yours.';
      }
      stat(c.me, 'happiness', -6);
      stat(c.me, 'stress', 6);
      return 'You ate lunch in the library for a month.';
    },
  },
  {
    id: 'best_friend',
    stage: 'child',
    major: false,
    cooldown: 5,
    candidates: (c) => one(age(c) >= 7 && !c.me.flags.best_friend, 1 + social(c) * 2),
    build: () => ({
      title: 'A new kid in class',
      text: 'The new kid sits alone at lunch. They have the same backpack as you.',
      choices: [
        { id: 'sit', label: 'Sit with them' },
        { id: 'pass', label: 'Stick with your usual group' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'sit') {
        c.me.flags.best_friend = c.s.year;
        stat(c.me, 'happiness', 8);
        stat(c.me, 'stress', -4);
        return 'By Friday you had a secret handshake. Best friends.';
      }
      return 'You waved. They waved back.';
    },
  },
  {
    id: 'first_crush',
    stage: 'child',
    major: false,
    cooldown: 3,
    candidates: (c) => one(age(c) >= 13 && social(c) > 0, 2 + social(c)),
    build: () => ({
      title: 'Butterflies',
      text: "Someone in your class keeps catching your eye, and you think they've noticed.",
      choices: [
        { id: 'ask', label: 'Ask them to the school dance', hint: 'Takes courage' },
        { id: 'secret', label: 'Keep it a secret' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'secret') return 'You wrote their name in a notebook, then scribbled it out.';
      if (c.rng.chance(0.35 + c.me.stats.happiness / 250)) {
        stat(c.me, 'happiness', 10);
        flag(c.me, 'first_love');
        return 'They said yes! You danced badly and laughed the whole time.';
      }
      stat(c.me, 'happiness', -6);
      return "They said they're going with friends. You survived. Barely.";
    },
  },
  {
    id: 'parents_argue',
    severe: true,
    stage: 'child',
    major: true,
    cooldown: 5,
    candidates: (c) => {
      const [a, b] = parentsAtHome(c.s, c.me);
      return one(!!a && !!b && partnerOf(c.s, a.id)?.id === b.id && getBond(c.s, a.id, b.id).affinity < 25, 3);
    },
    build: (c) => {
      const [a, b] = parentsAtHome(c.s, c.me);
      return {
        title: 'Raised voices',
        text: `You can hear ${a.firstName} and ${b.firstName} arguing through the wall again.`,
        choices: [
          { id: 'a', label: `Take ${a.firstName}'s side` },
          { id: 'b', label: `Take ${b.firstName}'s side` },
          { id: 'peace', label: 'Ask them both to stop', hint: 'Brave; it might help' },
          { id: 'headphones', label: 'Put on headphones' },
        ],
      };
    },
    resolve: (c, ch) => {
      const [a, b] = parentsAtHome(c.s, c.me);
      if (ch === 'a' || ch === 'b') {
        const [win, lose] = ch === 'a' ? [a, b] : [b, a];
        adjustBond(c.s, c.me.id, win.id, 6, 4);
        adjustBond(c.s, c.me.id, lose.id, -10, -8);
        return `${lose.firstName} looked hurt. ${win.firstName} hugged you a little too tightly.`;
      }
      if (ch === 'peace') {
        adjustBond(c.s, a.id, b.id, 10, 6);
        bondParents(c, 4, 4);
        return 'They both went quiet, then apologized to you. And to each other.';
      }
      stat(c.me, 'stress', 5);
      return 'You turned the music up until you fell asleep.';
    },
  },
  {
    id: 'summer_job',
    stage: 'child',
    major: false,
    cooldown: 1,
    candidates: (c) => one(age(c) >= 15 && !c.me.partJobId, 2),
    build: () => ({
      title: 'Summer plans',
      text: 'The ice cream shop is hiring teens for the summer.',
      choices: [
        { id: 'work', label: 'Take the job', hint: '+$2,500 to your savings, more stress' },
        { id: 'camp', label: 'Enjoy the summer', hint: 'Rest and recharge' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'work') {
        c.me.fund += 2500;
        stat(c.me, 'stress', 4);
        flag(c.me, 'summer_jobs');
        return `Long shifts, sticky hands, and ${money(2500)} saved for the future.`;
      }
      stat(c.me, 'stress', -8);
      stat(c.me, 'happiness', 5);
      return 'Lazy afternoons and late sunsets.';
    },
  },
  {
    id: 'talent_show',
    stage: 'child',
    major: false,
    cooldown: 3,
    candidates: (c) => one(!!c.me.hobby && (c.me.skills[c.me.hobby] ?? 0) >= 25, 2),
    build: (c) => ({
      title: 'The school showcase',
      text: `There's a school showcase for ${HOBBY_BY_ID[c.me.hobby!].label.toLowerCase()}. Will you take part?`,
      choices: [
        { id: 'perform', label: 'Sign up', hint: 'Your skill decides how it goes' },
        { id: 'watch', label: 'Watch from the crowd' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'watch') return 'You cheered for your friends and imagined being up there.';
      const skill = c.me.skills[c.me.hobby!] ?? 0;
      if (c.rng.chance(clamp(skill / 80, 0.2, 0.9))) {
        c.me.skills[c.me.hobby!] = skill + 5;
        stat(c.me, 'happiness', 8);
        bondParents(c, 5, 3);
        flag(c.me, 'showcase_star');
        return 'The room went quiet, then erupted. Your parents were on their feet.';
      }
      stat(c.me, 'stress', 6);
      return 'Your nerves got the better of you. Next year.';
    },
  },
  {
    id: 'own_coming_of_age',
    stage: 'any',
    major: true,
    cooldown: 0,
    candidates: (c) => one(age(c) >= 18 && !c.me.flags.came_of_age, 10, true),
    build: (c) => {
      const skill = c.me.hobby ? c.me.skills[c.me.hobby] ?? 0 : 0;
      return {
        title: "You're 18",
        text: `High school is done. Smarts ${c.me.stats.smarts}${c.me.hobby ? `, ${HOBBY_BY_ID[c.me.hobby].label.toLowerCase()} skill ${skill}` : ''}, savings ${money(c.me.fund)}. What's next?`,
        choices: [
          { id: 'university', label: '🎓 University', hint: '4 years; best-paid careers. Smarts helps.', disabled: c.me.stats.smarts < 45 },
          { id: 'trade', label: '🛠️ Trade school', hint: '2 years; steady skilled work' },
          { id: 'passion', label: c.me.hobby ? `${HOBBY_BY_ID[c.me.hobby].icon} Chase your ${HOBBY_BY_ID[c.me.hobby].label.toLowerCase()} dream` : 'Chase a dream', hint: 'Needs real skill', disabled: skill < 45 },
          { id: 'work', label: '💼 Start working', hint: 'Look for a job in your plan right away' },
        ],
      };
    },
    resolve: (c, ch) => {
      c.me.flags.came_of_age = 1;
      if (ch === 'work') {
        journal(c.s, 'You skipped college and went straight to work.', 'major');
        return 'No more classrooms. Time to find a job: check the Work section of your plan.';
      }
      startPath(c.s, c.me, ch as LifePath);
      const label = ch === 'university' ? 'university' : ch === 'trade' ? 'trade school' : `a life in ${c.me.hobby}`;
      journal(c.s, `You set off toward ${label}.`, 'major');
      return `You chose ${label}.`;
    },
  },
  {
    id: 'own_leaving_home',
    stage: 'any',
    major: true,
    cooldown: 3,
    candidates: (c) => one(age(c) >= 18 && !!c.me.flags.came_of_age && parentsAtHome(c.s, c.me).length > 0 && !partnerOf(c.s, c.me.id), age(c) >= 21 ? 5 : 2, age(c) >= 19),
    build: (c) => {
      const gift = parentGift(c);
      return {
        title: 'A place of your own?',
        text: `You could move out with your savings (${money(c.me.fund)})${gift ? ` and a ${money(gift)} gift from your parents` : ''}, or stay home a while longer.`,
        choices: [
          { id: 'go', label: 'Move out', hint: 'Your own household and your own bills' },
          { id: 'stay', label: 'Stay home for now', hint: 'Cheaper; less independence' },
        ],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'stay') {
        stat(c.me, 'happiness', -2);
        return 'Your old room, your old bed. It will do for now.';
      }
      const gift = parentGift(c);
      const home = c.s.households[c.me.householdId];
      home.wallet -= gift;
      moveOut(c.s, c.me, gift);
      bondParents(c, 4, 2);
      journal(c.s, 'You moved into your own place.', 'major');
      return 'A tiny apartment, a borrowed couch, and a key that is yours alone.';
    },
  },
];

/** What parents chip in when you leave home: warmer bonds and fuller wallets give more. */
function parentGift(c: Ctx) {
  const wallet = c.s.households[c.me.householdId].wallet;
  if (wallet <= 0 || avgParentAffinity(c) < 20) return 0;
  return Math.round(Math.min(20000, wallet * 0.1) / 500) * 500;
}
