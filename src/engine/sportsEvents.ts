/** Sports moments: tryouts, big games, injuries, the draft, contracts, and retirement. */
import { CAREER_BY_ID } from '../content/careers';
import { PRO_SKILL, SPORTS, TRAVEL_TEAM_COST } from '../content/sports';
import { canCover, coverHint, credit, payEmergency } from './money';
import type { Ctx, EventDef } from './eventKit';
import { goPro, isPro, retireFromPro } from './sports';
import type { Person } from './types';
import { adjustBond, ageOf, alive, childrenOf, clamp, flag, journal, money, stat } from './util';

const age = (c: Ctx, p: Person = c.me) => ageOf(p, c.s.year);
const one = (cond: boolean, weight: number, urgent = false, subject?: Person) => (cond ? [{ weight, urgent, subject }] : []);
const athlete = (p: Person) => p.hobby === 'sports' && !!p.sport;
const skill = (p: Person) => p.skills.sports ?? 0;
const sportName = (p: Person) => (p.sport ? SPORTS[p.sport].label.toLowerCase() : 'sports');
const wallet = (c: Ctx) => c.s.households[c.me.householdId];
const myKids = (c: Ctx) => childrenOf(c.s, c.me.id).filter((k) => alive(k) && k.householdId === c.me.householdId);

export const SPORTS_EVENTS: EventDef[] = [
  {
    id: 'youth_tryouts',
    stage: 'any',
    major: false,
    cooldown: 3,
    candidates: (c) => one(athlete(c.me) && age(c) >= 8 && age(c) <= 13 && !c.me.flags.travel_team, 2),
    build: (c) => ({
      title: 'Travel team tryouts',
      text: `The ${sportName(c.me)} travel team is holding tryouts. More games, better coaching, and a lot of car rides for your parents.`,
      choices: [{ id: 'try', label: 'Try out', hint: `Your skill: ${skill(c.me)}` }, { id: 'rec', label: 'Stay in the rec league' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'rec') return 'Rec league it is. Orange slices at halftime.';
      if (c.rng.chance(clamp(skill(c.me) / 40, 0.15, 0.95))) {
        c.me.flags.travel_team = 1;
        stat(c.me, 'happiness', 8);
        return 'You made the team! Practice four days a week.';
      }
      stat(c.me, 'happiness', -4);
      return 'Not this year. The coach said to keep working on it.';
    },
  },
  {
    id: 'kid_travel_team',
    major: false,
    cooldown: 3,
    candidates: (c) => myKids(c).filter((k) => athlete(k) && age(c, k) >= 8 && age(c, k) <= 13 && !k.flags.travel_team && skill(k) >= 20)
      .slice(0, 1).map((k) => ({ subject: k, weight: 1.5, urgent: false })),
    build: (_c, k) => ({
      title: `${k!.firstName} made the travel team`,
      text: `${k!.firstName}'s ${sportName(k!)} coach wants them on the travel team. It costs about ${money(TRAVEL_TEAM_COST)} a year in fees and weekend trips.`,
      choices: [
        { id: 'yes', label: `Sign them up (${money(TRAVEL_TEAM_COST)}/yr)`, hint: 'Faster improvement; a real shot at more' },
        { id: 'no', label: 'Keep it fun in the rec league' },
      ],
    }),
    resolve: (c, ch, k) => {
      if (ch === 'no') { stat(k!, 'happiness', -2); return `${k!.firstName} was disappointed, but still loves playing.`; }
      k!.flags.travel_team = 1;
      stat(k!, 'happiness', 8);
      adjustBond(c.s, c.me.id, k!.id, 5, 3);
      return 'Hotel pools, early mornings, and a lot of team snacks.';
    },
  },
  {
    id: 'varsity_tryouts',
    stage: 'any',
    major: false,
    cooldown: 2,
    candidates: (c) => one(athlete(c.me) && age(c) >= 14 && age(c) <= 17 && !c.me.flags.varsity && skill(c.me) >= 35, 3),
    build: (c) => ({
      title: 'Varsity tryouts',
      text: `The varsity ${sportName(c.me)} coach is watching.`,
      choices: [{ id: 'try', label: 'Give it everything', hint: `Your skill: ${skill(c.me)}` }, { id: 'jv', label: 'Another year on JV' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'jv') return 'One more year to grow.';
      if (c.rng.chance(clamp((skill(c.me) - 20) / 40, 0.1, 0.95))) {
        c.me.flags.varsity = 1;
        stat(c.me, 'happiness', 8);
        journal(c.s, `You made varsity ${sportName(c.me)}.`, 'good');
        return 'Your name is on the roster. You read it four times.';
      }
      return 'Cut, this time. You stayed after practice every day the next week.';
    },
  },
  {
    id: 'championship_game',
    stage: 'any',
    major: false,
    cooldown: 2,
    candidates: (c) => one(athlete(c.me) && (isPro(c.me) || !!c.me.flags.varsity || !!c.me.flags.travel_team || c.me.flags.league_year === c.s.year) && skill(c.me) >= 30, 0.9),
    build: (c) => ({
      title: 'The championship',
      text: `Final seconds of the ${sportName(c.me)} championship. The game is in your hands.`,
      choices: [{ id: 'take', label: 'Take the shot yourself', hint: 'Skill decides' }, { id: 'pass', label: 'Trust a teammate' }],
    }),
    resolve: (c, ch) => {
      const odds = ch === 'take' ? skill(c.me) / 110 : 0.45;
      if (c.rng.chance(odds)) {
        flag(c.me, 'champion');
        stat(c.me, 'happiness', 10);
        journal(c.s, `Champions! (${SPORTS[c.me.sport!].label})`, 'major');
        return ch === 'take' ? 'It went in. The crowd poured onto the field.' : 'Your teammate came through. You lifted them onto your shoulders.';
      }
      stat(c.me, 'happiness', -4);
      return 'So close. The bus ride home was very quiet.';
    },
  },
  {
    // Scheduled by sportsYear for the player.
    id: 'sports_injury',
    stage: 'any',
    major: false,
    severe: true,
    cooldown: 0,
    build: (c) => {
      const covered = isPro(c.me);
      return {
        title: 'Injured',
        text: `You went down hard during ${sportName(c.me)} and couldn't get back up. The doctor says it's a torn ligament.`,
        choices: [
          { id: 'surgery', label: covered ? 'Surgery (the team pays)' : `Surgery and rehab (${money(8000)})`, hint: covered ? 'The best shot at a full recovery' : coverHint(wallet(c), 8000, 'The best shot at a full recovery'), disabled: !covered && !canCover(wallet(c), 8000) },
          { id: 'rest', label: 'Rest and hope it heals', hint: 'Cheaper; you may lose a step' },
        ],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'surgery') {
        if (!isPro(c.me)) payEmergency(wallet(c), 8000);
        c.me.skills.sports = clamp(skill(c.me) - 4, 0, 100);
        stat(c.me, 'health', -4);
        return 'Months of rehab, then back in the game, a little wiser.';
      }
      c.me.skills.sports = clamp(skill(c.me) - 12, 0, 100);
      stat(c.me, 'health', -8);
      if (isPro(c.me) && age(c) >= 30 && c.rng.chance(0.3)) {
        retireFromPro(c.s, c.me);
        return 'It never healed right. The injury ended your pro career.';
      }
      return 'It healed, mostly. You are not quite as quick as you were.';
    },
  },
  {
    id: 'pro_draft',
    stage: 'any',
    major: true,
    cooldown: 0,
    candidates: (c) => one(athlete(c.me) && !isPro(c.me) && age(c) >= 18 && age(c) <= 24 && skill(c.me) >= PRO_SKILL && c.me.flags.draft_year !== c.s.year, 20, true),
    build: (c) => {
      const pay = CAREER_BY_ID[`pro_${c.me.sport}`].levelPay![0];
      return {
        title: 'Draft day',
        text: `A professional ${sportName(c.me)} team wants to sign you. A rookie contract pays ${money(pay)} a year.`,
        choices: [
          { id: 'sign', label: 'Sign the contract', hint: c.me.studyingUntil ? 'You would leave school' : 'Go pro' },
          ...(c.me.studyingUntil ? [{ id: 'school', label: 'Finish school first', hint: 'Maybe they ask again next year' }] : []),
          { id: 'no', label: 'Not for me' },
        ],
      };
    },
    resolve: (c, ch) => {
      c.me.flags.draft_year = c.s.year;
      if (ch !== 'sign') return ch === 'school' ? 'You stayed in school. The scouts said they would be watching.' : 'You chose a different life. It still feels good to be asked.';
      goPro(c.s, c.me);
      stat(c.me, 'happiness', 15);
      journal(c.s, `You were drafted into professional ${sportName(c.me)}!`, 'major');
      return 'You signed in front of the cameras. Your family cried. So did you.';
    },
  },
  {
    id: 'contract_year',
    major: false,
    cooldown: 3,
    candidates: (c) => one(isPro(c.me) && c.me.jobLevel >= 2 && c.me.jobYears >= 3 && c.me.flags.hired_year !== c.s.year, 2),
    build: (c) => {
      const pay = CAREER_BY_ID[c.me.jobId!].levelPay![c.me.jobLevel - 1];
      return {
        title: 'Contract year',
        text: `Your contract is up. Your team offers a ${money(Math.round(pay * 0.2))} signing bonus to stay.`,
        choices: [
          { id: 'stay', label: 'Re-sign with your team', hint: 'Familiar faces; family stays put' },
          { id: 'free', label: 'Test free agency', hint: 'A bigger payday, maybe; could mean moving' },
        ],
      };
    },
    resolve: (c, ch) => {
      const pay = CAREER_BY_ID[c.me.jobId!].levelPay![c.me.jobLevel - 1];
      if (ch === 'stay') {
        credit(wallet(c), Math.round(pay * 0.2));
        return 'Handshakes, a press conference, and the same locker.';
      }
      if (c.rng.chance(0.6)) {
        credit(wallet(c), Math.round(pay * 0.45));
        stat(c.me, 'happiness', 6);
        return 'A bidding war! You signed a much bigger deal.';
      }
      return 'The market was quiet. You re-signed for less than you hoped.';
    },
  },
  {
    // Scheduled by sportsYear when a pro reaches the end of the road.
    id: 'pro_retirement',
    major: true,
    cooldown: 0,
    build: (c) => ({
      title: 'Time to hang it up?',
      text: `Your body is telling you something after ${c.me.jobYears} pro seasons.`,
      choices: [
        { id: 'retire', label: 'Retire on your own terms', hint: 'You can coach after this' },
        { id: 'one_more', label: 'One more season', hint: 'Higher injury risk' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'one_more' && isPro(c.me) && age(c) < (SPORTS[c.me.sport!].retireAge + 4)) {
        c.me.skills.sports = clamp(skill(c.me) - 4, 0, 100);
        if (c.rng.chance(0.2)) stat(c.me, 'health', -10);
        return 'One more season. Every game feels precious now.';
      }
      if (isPro(c.me)) retireFromPro(c.s, c.me);
      stat(c.me, 'happiness', 4);
      return 'A farewell ceremony, your jersey framed, and a lot more time with family.';
    },
  },
];

