import { HOBBY_BY_ID, TIME_BUDGET } from '../content/actions';
import { CHILD_EVENTS } from './childhood';
import { FEMALE_NAMES, MALE_NAMES } from '../content/names';
import { annuityPayment, HOMES, MORTGAGE_RATE, MORTGAGE_YEARS, SCRAP_VALUE } from '../content/finance';
import { breakdownChance, carAge, conditionOf, garagedIds, repairCost, shakiestCar } from './cars';
import type { Asset } from './types';
import { homeUpfront } from './finance';

/** A highway breakdown costs several times a routine repair. */
const bigRepair = (car: Asset) => repairCost(car) * 3;
import { readiness } from './retirement';
import { guidedPerson, scriptedPhase, severeGuard } from './tutorial';
import { FULL_RETIREMENT_AGE } from '../content/retirement';
import { CAREERS, CAREER_BY_ID, LEVEL_TITLES, PROGRAMS, qualifies, requiredBlocks, salaryOf } from '../content/careers';
import { assignJob, makeAdultStranger, makePerson, pickCareer } from './generate';
import {
  breakUp, divorce, homeEquityShare, marry, mergeHouseholds, moveOut, partnerInHome, preferredPath, receptiveness,
  receptivenessLabel, reconcile, retire, separate, separatedFrom, startDating, startPath, type LifePath,
} from './family';
import type { Rng } from './rng';
import type { GameState, PendingChoice, PendingEvent, Person } from './types';
import {
  active, activePartnership, adjustBond, ageOf, alive, childrenOf, cleanName, flag, fullName, getBond, journal, kidsAtHome, NAME_MAX,
  membersOf, money, newId, parentsOf, partnerOf, stat,
} from './util';

export interface Ctx {
  s: GameState;
  rng: Rng;
  me: Person;
}

interface Built {
  title: string;
  text: string;
  choices: PendingChoice[];
}

interface Candidate {
  subject?: Person;
  weight: number;
  /** Circumstance-driven: fires before the pacing timer is considered. */
  urgent?: boolean;
}

export interface EventDef {
  id: string;
  major: boolean;
  cooldown: number;
  candidates?: (c: Ctx) => Candidate[];
  build: (c: Ctx, sub?: Person) => Built;
  resolve: (c: Ctx, choice: string, sub?: Person, text?: string) => string;
  /** Who can get this event: adults (default), children (under 18), or anyone. */
  stage?: 'adult' | 'child' | 'any';
  /** Harsh events, held back early in the guided first playthrough. */
  severe?: boolean;
}

const wallet = (c: Ctx) => c.s.households[c.me.householdId];
const age = (c: Ctx, p: Person) => ageOf(p, c.s.year);
const one = (cond: boolean, weight: number, urgent = false, subject?: Person): Candidate[] =>
  cond ? [{ weight, urgent, subject }] : [];
const childBlocks = (c: Ctx, k: Person) =>
  (c.s.plan.alloc[`child_time:${k.id}`] ?? 0) + (c.s.plan.alloc[`homework:${k.id}`] ?? 0);

const EVENTS: EventDef[] = [
  // ── Arc: work vs. life ─────────────────────────────────────────────
  {
    id: 'promotion_offer',
    major: true,
    cooldown: 3,
    candidates: (c) => one(!!c.me.jobId && c.me.jobLevel < 3 && c.me.workPerf >= 65 && c.me.jobYears >= 2, 4),
    build: (c) => {
      const job = CAREER_BY_ID[c.me.jobId!];
      const lvl = c.me.jobLevel + 1;
      return {
        title: 'A promotion on the table',
        text: `Your manager offers you the ${LEVEL_TITLES[lvl]} ${job.name} role. Pay rises to ${money(salaryOf(job, lvl))}, but it expects ${requiredBlocks(job, lvl)} blocks of your time each year instead of ${requiredBlocks(job, c.me.jobLevel)}.`,
        choices: [
          { id: 'accept', label: 'Accept the promotion', hint: 'More money, less time for everything else' },
          { id: 'decline', label: 'Decline politely', hint: 'Keep your current balance' },
        ],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'accept') {
        c.me.jobLevel++;
        c.me.jobYears = 0;
        c.me.workPerf = 50;
        stat(c.me, 'happiness', 5);
        return 'You accepted. The new title feels good. The calendar feels fuller.';
      }
      flag(c.me, 'declined_promotion');
      stat(c.me, 'happiness', 2);
      return 'You declined. Your manager seemed surprised, but you went home on time.';
    },
  },
  {
    id: 'missed_recital',
    major: false,
    cooldown: 2,
    candidates: (c) =>
      !c.me.jobId && !c.me.partJobId ? [] : kidsAtHome(c.s, c.me)
        .filter((k) => k.hobby && age(c, k) >= 6 && childBlocks(c, k) < 2)
        .map((k) => ({ subject: k, weight: 3 })),
    build: (_c, k) => {
      const ev = HOBBY_BY_ID[k!.hobby!].event;
      return {
        title: `${k!.firstName}'s ${ev}`,
        text: `${k!.firstName}'s ${ev} is tonight, but you're buried in a deadline at work.`,
        choices: [
          { id: 'go', label: 'Leave work early', hint: 'Your career takes a hit' },
          { id: 'stay', label: 'Stay and finish the work', hint: `${k!.firstName} will notice` },
        ],
      };
    },
    resolve: (c, ch, k) => {
      if (ch === 'go') {
        c.me.workPerf = Math.max(0, c.me.workPerf - 10);
        adjustBond(c.s, c.me.id, k!.id, 8, 8);
        flag(k!, 'parent_showed_up');
        return `You slipped into the back row just in time. ${k!.firstName} spotted you and beamed.`;
      }
      c.me.workPerf = Math.min(100, c.me.workPerf + 5);
      adjustBond(c.s, c.me.id, k!.id, -4, -10);
      flag(k!, 'parent_missed_events');
      return `The work got done. ${k!.firstName} didn't mention the empty seat, which was worse.`;
    },
  },
  {
    id: 'burnout',
    severe: true,
    major: true,
    cooldown: 4,
    candidates: (c) => one(c.me.stats.stress >= 80, 5, true),
    build: () => ({
      title: 'Running on empty',
      text: "You can't remember the last full night of sleep. Your body is sending clear signals.",
      choices: [
        { id: 'sabbatical', label: 'Take unpaid leave', hint: 'Lose half a year of pay, recover fully' },
        { id: 'cutback', label: 'Ask to cut back', hint: 'Your career takes a hit' },
        { id: 'push', label: 'Push through', hint: 'No cost now…' },
      ],
    }),
    resolve: (c, ch) => {
      const job = c.me.jobId ? CAREER_BY_ID[c.me.jobId] : undefined;
      if (ch === 'sabbatical') {
        wallet(c).wallet -= job ? Math.round(salaryOf(job, c.me.jobLevel) / 2) : 0;
        stat(c.me, 'stress', -35);
        stat(c.me, 'happiness', 6);
        return 'Months of rest. You came back with color in your face and some lost savings.';
      }
      if (ch === 'cutback') {
        c.me.workPerf = Math.max(0, c.me.workPerf - 20);
        if (c.me.jobLevel > 1) c.me.jobLevel--;
        stat(c.me, 'stress', -15);
        return 'You stepped back a rung. It stung, but you can breathe again.';
      }
      stat(c.me, 'health', -10);
      flag(c.me, 'pushed_through');
      c.s.scheduled.push({ dueYear: c.s.year + c.rng.int(2, 4), eventId: 'health_scare', subjectId: c.me.id });
      return 'You pushed through. Nobody noticed anything was wrong. Not even you, for now.';
    },
  },
  {
    id: 'health_scare',
    severe: true,
    major: true,
    cooldown: 3,
    candidates: (c) => one(age(c, c.me) > 45 && c.me.stats.health < 35, 5, true),
    build: () => ({
      title: 'Chest pains',
      text: 'A tightness in your chest sends you to the ER. The doctors say it was a warning. The bill is $8,000.',
      choices: [
        { id: 'vow', label: 'Commit to a healthier life', hint: 'Exercise is far more effective from now on' },
        { id: 'ignore', label: 'Get back to normal', hint: 'Back to the routine' },
      ],
    }),
    resolve: (c, ch) => {
      wallet(c).wallet -= 8000;
      if (ch === 'vow') {
        c.me.flags.health_vow = 1;
        stat(c.me, 'stress', -10);
        stat(c.me, 'health', 10);
        return 'You bought running shoes and meant it this time.';
      }
      stat(c.me, 'health', -5);
      return 'You filed the discharge papers in a drawer and went back to work.';
    },
  },
  {
    id: 'layoff',
    severe: true,
    major: true,
    cooldown: 5,
    candidates: (c) => one(!!c.me.jobId, c.me.workPerf < 35 ? 3 : 0.4),
    build: (c) => ({
      title: 'Cuts at work',
      text: `Your company is cutting staff. HR offers a severance package of ${money(salaryOf(CAREER_BY_ID[c.me.jobId!], c.me.jobLevel) / 2)}, or you can try to keep your spot.`,
      choices: [
        { id: 'take', label: 'Take the severance', hint: 'Guaranteed money, no job' },
        { id: 'fight', label: 'Fight for your spot', hint: `Odds depend on your performance (${c.me.workPerf}/100)` },
      ],
    }),
    resolve: (c, ch) => {
      const sal = salaryOf(CAREER_BY_ID[c.me.jobId!], c.me.jobLevel);
      if (ch === 'take') {
        wallet(c).wallet += Math.round(sal / 2);
        c.me.jobId = undefined;
        return 'You signed the papers and cleared out your desk. Time to look for something new.';
      }
      if (c.rng.chance(0.2 + c.me.workPerf / 100)) {
        c.me.workPerf = Math.min(100, c.me.workPerf + 10);
        stat(c.me, 'stress', 8);
        return 'You made your case and survived the cut.';
      }
      c.me.jobId = undefined;
      stat(c.me, 'happiness', -8);
      return 'It did not go your way, and now there is no severance either.';
    },
  },
  {
    id: 'retirement',
    major: true,
    cooldown: 3,
    candidates: (c) => one(!!c.me.jobId && age(c, c.me) >= FULL_RETIREMENT_AGE, 5, true),
    build: (c) => {
      const a = age(c, c.me);
      const r = readiness(c.s, c.me, a);
      const verdict = r.status === 'ready' ? 'Your numbers say you can afford it.' : r.status === 'tight' ? 'It would be tight.' : 'Money would be a struggle.';
      return {
      title: 'Time to retire?',
      text: `Your coworkers keep asking about your plans. Retiring now: employer pension ${money(r.pension)}, state pension ${money(r.state)}, and about ${money(r.savingsIncome)} a year from savings, against a budget of ${money(r.need)}. ${verdict}`,
      choices: [
        { id: 'retire', label: 'Retire', hint: 'All your time is your own' },
        { id: 'stay', label: 'Keep working', hint: 'Full salary, for now' },
      ],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'retire') {
        retire(c.me, c.s.year);
        stat(c.me, 'happiness', 8);
        stat(c.me, 'stress', -15);
        return 'Cake, a card everyone signed, and a very quiet Monday morning.';
      }
      return 'Not yet. There is still work you want to do.';
    },
  },

  // ── Arc: raising a child ───────────────────────────────────────────
  {
    id: 'child_talent',
    major: false,
    cooldown: 3,
    candidates: (c) =>
      kidsAtHome(c.s, c.me)
        .filter((k) => k.hobby && (k.skills[k.hobby] ?? 0) >= 35 && !k.flags.advanced)
        .map((k) => ({ subject: k, weight: 3 })),
    build: (_c, k) => ({
      title: 'A coach notices',
      text: `${k!.firstName}'s ${HOBBY_BY_ID[k!.hobby!].label.toLowerCase()} instructor says they have real talent and should train seriously.`,
      choices: [
        { id: 'advanced', label: 'Pay for advanced training', hint: '$5,000/year until they are 18' },
        { id: 'casual', label: 'Keep it a hobby', hint: 'Less pressure on everyone' },
      ],
    }),
    resolve: (c, ch, k) => {
      if (ch === 'advanced') {
        k!.flags.advanced = 1;
        k!.skills[k!.hobby!] = (k!.skills[k!.hobby!] ?? 0) + 5;
        adjustBond(c.s, c.me.id, k!.id, 5, 2);
        return `${k!.firstName} lit up. Practice is now four days a week.`;
      }
      if (k!.traits.includes('ambitious')) {
        adjustBond(c.s, c.me.id, k!.id, -5, -3);
        return `${k!.firstName} nodded, but you could tell they wanted more.`;
      }
      stat(k!, 'happiness', 2);
      return `${k!.firstName} is happy to keep it fun.`;
    },
  },
  {
    id: 'child_struggling',
    major: false,
    cooldown: 2,
    candidates: (c) =>
      kidsAtHome(c.s, c.me)
        .filter((k) => age(c, k) >= 8 && k.stats.smarts < 40 && !c.s.plan.children[k.id]?.tutoring)
        .map((k) => ({ subject: k, weight: 3 })),
    build: (_c, k) => ({
      title: 'A note from school',
      text: `${k!.firstName}'s teacher writes that they are falling behind in class.`,
      choices: [
        { id: 'tutor', label: 'Hire a tutor', hint: '$3,000/year (you can cancel it in your plan)' },
        { id: 'self', label: 'Sit with them yourself', hint: 'Costs you stress, builds trust' },
        { id: 'leave', label: "They'll figure it out", hint: 'No cost now' },
      ],
    }),
    resolve: (c, ch, k) => {
      if (ch === 'tutor') {
        const cp = c.s.plan.children[k!.id];
        if (cp) cp.tutoring = true;
        return `A tutor starts next week. ${k!.firstName} groaned, but went.`;
      }
      if (ch === 'self') {
        stat(k!, 'smarts', 4);
        stat(c.me, 'stress', 5);
        adjustBond(c.s, c.me.id, k!.id, 3, 6);
        return `Long evenings at the kitchen table. ${k!.firstName} started to get it.`;
      }
      flag(k!, 'struggled');
      stat(k!, 'happiness', -3);
      return `${k!.firstName} kept struggling, quietly.`;
    },
  },
  {
    id: 'teen_rebellion',
    major: true,
    cooldown: 3,
    candidates: (c) =>
      kidsAtHome(c.s, c.me)
        .filter((k) => age(c, k) >= 13)
        .map((k) => {
          const b = getBond(c.s, c.me.id, k.id);
          const tense = b.trust < -5 || (k.flags.resents ?? 0) >= 2 || (k.flags.parent_missed_events ?? 0) >= 2;
          return { subject: k, weight: tense ? 4 : 0.5, urgent: tense };
        }),
    build: (c, k) => {
      const why = (k!.flags.parent_missed_events ?? 0) >= 2
        ? '"You never show up anyway," they shout.'
        : (k!.flags.resents ?? 0) >= 2 ? '"You never let me choose anything!"' : 'They broke curfew. Again.';
      return {
        title: `${k!.firstName} slams the door`,
        text: `${k!.firstName} came home at 2 a.m. ${why}`,
        choices: [
          { id: 'rules', label: 'Set firm rules', hint: k!.traits.includes('stubborn') ? 'They are stubborn…' : 'Structure helps some kids' },
          { id: 'talk', label: 'Have a heart-to-heart', hint: `Works better with trust (${receptivenessLabel(receptiveness(c.s, c.me, k!)).toLowerCase()})` },
          { id: 'space', label: 'Give them space', hint: 'Avoid a fight' },
        ],
      };
    },
    resolve: (c, ch, k) => {
      if (ch === 'rules') {
        if (k!.traits.includes('stubborn')) {
          adjustBond(c.s, c.me.id, k!.id, -15, -10);
          flag(k!, 'resents');
          return `${k!.firstName} dug in. The house got very quiet.`;
        }
        adjustBond(c.s, c.me.id, k!.id, -5, -2);
        stat(k!, 'smarts', 3);
        return `${k!.firstName} grumbled, but the grades came back up.`;
      }
      if (ch === 'talk') {
        const b = getBond(c.s, c.me.id, k!.id);
        if (c.rng.chance(0.3 + (b.affinity + b.trust) / 250)) {
          adjustBond(c.s, c.me.id, k!.id, 10, 20);
          k!.flags.resents = 0;
          return `You talked until dawn. For the first time in a while, ${k!.firstName} really listened, and so did you.`;
        }
        adjustBond(c.s, c.me.id, k!.id, -5, 0);
        return `${k!.firstName} put their headphones back on mid-sentence.`;
      }
      stat(k!, 'happiness', 5);
      stat(k!, 'smarts', -2);
      adjustBond(c.s, c.me.id, k!.id, 0, 3);
      return 'You let it go. The tension eased, for now.';
    },
  },
  {
    id: 'coming_of_age',
    major: true,
    cooldown: 0,
    candidates: (c) =>
      childrenOf(c.s, c.me.id)
        .filter((k) => alive(k) && k.householdId === c.me.householdId && age(c, k) >= 18 && !k.flags.came_of_age)
        .map((k) => ({ subject: k, weight: 10, urgent: true })),
    build: (c, k) => {
      const kid = k!;
      const skill = kid.hobby ? kid.skills[kid.hobby] ?? 0 : 0;
      const r = receptiveness(c.s, c.me, kid);
      const memory = (kid.flags.parent_missed_events ?? 0) >= 2
        ? ` They haven't forgotten the ${HOBBY_BY_ID[kid.hobby ?? 'music'].event}s you missed.`
        : (kid.flags.resents ?? 0) >= 3 ? ' They are tired of being told what to do.' : '';
      return {
        title: `${kid.firstName} turns 18`,
        text: `${kid.firstName} is graduating high school. Smarts ${kid.stats.smarts}${kid.hobby ? `, ${HOBBY_BY_ID[kid.hobby].label.toLowerCase()} skill ${skill}` : ''}, college fund ${money(kid.fund)}. ${receptivenessLabel(r)}.${memory}`,
        choices: [
          { id: 'university', label: 'Encourage university', hint: '4 years of study; the best-paid careers' },
          { id: 'trade', label: 'Suggest trade school', hint: '2 years; steady skilled work' },
          { id: 'passion', label: kid.hobby ? `Back their ${HOBBY_BY_ID[kid.hobby].label.toLowerCase()} dream` : 'Back their passion', hint: 'Only realistic with strong skill', disabled: skill < 40 },
          { id: 'decide', label: "It's their call", hint: 'They choose; they will appreciate the trust' },
        ],
      };
    },
    resolve: (c, ch, k) => {
      const kid = k!;
      const own = preferredPath(kid);
      let path: LifePath;
      let text: string;
      if (ch === 'decide') {
        path = own;
        adjustBond(c.s, c.me.id, kid.id, 5, 8);
        text = `${kid.firstName} chose for themselves`;
      } else if (ch === own || c.rng.chance(receptiveness(c.s, c.me, kid))) {
        path = ch as LifePath;
        text = ch === own ? `${kid.firstName} was already set on it` : `${kid.firstName} took your advice`;
      } else {
        path = own;
        adjustBond(c.s, c.me.id, kid.id, -3, -3);
        text = `${kid.firstName} heard you out, then did what they wanted`;
      }
      startPath(c.s, kid, path);
      const label = path === 'university' ? 'university' : path === 'trade' ? 'trade school' : `a life in ${kid.hobby ?? 'their passion'}`;
      journal(c.s, `${kid.firstName} set off toward ${label}.`, 'major');
      enqueue(c, 'leaving_home', kid);
      return `${text}: ${label}.`;
    },
  },
  {
    id: 'leaving_home',
    major: false,
    cooldown: 0,
    build: (c, k) => ({
      title: `${k!.firstName} moves out`,
      text: `${k!.firstName} is ready to start out on their own. They take their college fund (${money(k!.fund)}). Will you add a gift, or ask them to stay a while?`,
      choices: [
        { id: '0', label: 'A hug and good luck', hint: 'No money' },
        { id: '5000', label: 'Give $5,000', disabled: wallet(c).wallet < 5000 },
        { id: '15000', label: 'Give $15,000', disabled: wallet(c).wallet < 15000 },
        { id: 'stay', label: 'Stay home for now', hint: 'They live with you; their living costs stay with your household' },
      ],
    }),
    resolve: (c, ch, k) => {
      if (ch === 'stay') {
        k!.flags.lives_at_home = 1;
        adjustBond(c.s, c.me.id, k!.id, 5, 3);
        return `${k!.firstName} unpacked the boxes. Their room stays theirs a little longer.`;
      }
      const gift = Number(ch);
      wallet(c).wallet -= gift;
      adjustBond(c.s, c.me.id, k!.id, gift >= 15000 ? 10 : gift > 0 ? 5 : 0, gift > 0 ? 3 : 0);
      moveOut(c.s, k!, gift);
      return gift ? `${k!.firstName} hugged you tight at the door.` : `${k!.firstName} waved from the car. The house feels bigger now.`;
    },
  },

  // ── Arc: partnership ───────────────────────────────────────────────
  {
    id: 'anniversary',
    major: false,
    cooldown: 3,
    candidates: (c) => {
      const p = partnerInHome(c.s, c.me);
      return one(!!p && getBond(c.s, c.me.id, p.id).affinity >= 10, 2, false, p);
    },
    build: (c, p) => ({
      title: 'Anniversary',
      text: `Your anniversary with ${p!.firstName} is coming up.`,
      choices: [
        { id: 'trip', label: 'A weekend away ($2,000)', disabled: wallet(c).wallet < 2000 },
        { id: 'dinner', label: 'Dinner at home', hint: 'Simple and sweet' },
      ],
    }),
    resolve: (c, ch, p) => {
      if (ch === 'trip') {
        wallet(c).wallet -= 2000;
        adjustBond(c.s, c.me.id, p!.id, 10, 4);
        stat(c.me, 'happiness', 5);
        return 'Two days without alarms. You remembered why you fell for each other.';
      }
      adjustBond(c.s, c.me.id, p!.id, 3, 2);
      return 'Candles, takeout, and an old playlist.';
    },
  },
  {
    id: 'drifting_apart',
    severe: true,
    major: true,
    cooldown: 3,
    candidates: (c) => {
      const p = partnerInHome(c.s, c.me);
      return one(!!p && getBond(c.s, c.me.id, p.id).affinity < -5, 5, true, p);
    },
    build: (c, p) => ({
      title: 'Strangers at dinner',
      text: `You and ${p!.firstName} have barely talked in months. One night, ${p!.firstName} asks if this is still working.`,
      choices: [
        { id: 'counsel', label: 'Couples counseling ($3,000)', hint: 'Usually helps', disabled: wallet(c).wallet < 3000 },
        { id: 'talk', label: 'Talk it out tonight', hint: 'Depends on the trust you have left' },
        { id: 'separate', label: 'Separate', hint: `${p!.firstName} moves out with half the savings; divorce is decided later` },
      ],
    }),
    resolve: (c, ch, p) => {
      if (ch === 'counsel') {
        wallet(c).wallet -= 3000;
        const ok = c.rng.chance(0.65);
        adjustBond(c.s, c.me.id, p!.id, ok ? 25 : 6, ok ? 15 : 3);
        return ok ? 'It was hard work, but you found your way back to each other.' : 'Progress was slow. At least you are talking again.';
      }
      if (ch === 'talk') {
        const ok = c.rng.chance(0.3 + getBond(c.s, c.me.id, p!.id).trust / 200);
        adjustBond(c.s, c.me.id, p!.id, ok ? 15 : -10, ok ? 10 : -5);
        return ok ? 'You talked until the candles burned out. Something shifted.' : 'It turned into an argument about everything.';
      }
      separate(c.s, c.me, p!);
      c.me.flags.separated_year = c.s.year;
      for (const k of kidsAtHome(c.s, c.me)) {
        flag(k, 'parents_divorced');
        adjustBond(c.s, c.me.id, k.id, -5, -5);
        stat(k, 'happiness', -10);
      }
      journal(c.s, `You and ${p!.firstName} separated.`, 'major');
      return `${p!.firstName} moved out. The kids are staying with you.`;
    },
  },
  {
    id: 'partner_job_offer',
    severe: true,
    major: true,
    cooldown: 6,
    candidates: (c) => {
      const p = partnerInHome(c.s, c.me);
      return one(!!p && !!p.jobId && p.jobLevel < 3 && age(c, p) < 55, 1, false, p);
    },
    build: (c, p) => {
      const job = CAREER_BY_ID[p!.jobId!];
      const now = salaryOf(job, p!.jobLevel);
      const next = salaryOf(job, p!.jobLevel + 1);
      const mine = [c.me.jobId, c.me.partJobId].filter(Boolean).map((id) => CAREER_BY_ID[id!]);
      const myPay = mine.reduce((sum, j) => sum + salaryOf(j, j.hours === 'full' ? c.me.jobLevel : 1), 0);
      const myJobs = mine.map((j) => j.name).join(' and ');
      return {
        title: 'An offer in another city',
        text: `${p!.firstName} has been offered a promotion to ${LEVEL_TITLES[p!.jobLevel + 1]} ${job.name}, but it means moving across the country. `
          + `${p!.firstName} makes ${money(now)} now; the new role pays ${money(next)} (+${money(next - now)} a year). `
          + (mine.length ? `You make ${money(myPay)} as a ${myJobs}, and would have to leave ${mine.length > 1 ? 'both jobs' : 'it'}.` : 'You have no job to leave behind.'),
        choices: [
          { id: 'move', label: 'Move together', hint: mine.length ? `Household pay changes by ${next - now - myPay >= 0 ? '+' : '−'}${money(Math.abs(next - now - myPay))} until you find work; the kids change schools` : 'The kids change schools' },
          { id: 'stay', label: 'Ask them to turn it down', hint: `${p!.firstName} will remember this` },
        ],
      };
    },
    resolve: (c, ch, p) => {
      if (ch === 'move') {
        p!.jobLevel = Math.min(3, p!.jobLevel + 1);
        c.me.jobId = undefined;
        c.me.partJobId = undefined;
        for (const k of kidsAtHome(c.s, c.me)) {
          flag(k, 'moved');
          stat(k, 'happiness', -5);
        }
        adjustBond(c.s, c.me.id, p!.id, 12, 8);
        journal(c.s, 'The family moved to a new city.', 'major');
        return `New city, new routines. ${p!.firstName} is thriving. You will need to find work.`;
      }
      flag(p!, 'sacrificed');
      adjustBond(c.s, c.me.id, p!.id, -12, -5);
      return `${p!.firstName} turned it down. They said it was fine. It was not entirely fine.`;
    },
  },
  {
    id: 'meet_someone',
    major: true,
    cooldown: 2,
    candidates: (c) => {
      const a = age(c, c.me);
      // Being single and getting out there makes meeting someone likelier.
      const social = c.s.plan.alloc.socialize ?? 0;
      const free = !partnerOf(c.s, c.me.id) && !separatedFrom(c.s, c.me.id);
      return one(free && a >= 18 && a <= 60, (a <= 40 ? 2 : 1) * (1 + social), a <= 38 && social > 0);
    },
    build: () => ({
      title: 'Someone new',
      text: "At a friend's party you end up talking with someone for hours. They ask if you'd like to see them again.",
      choices: [
        { id: 'yes', label: 'Start dating', hint: 'You each keep your own place for now' },
        { id: 'no', label: 'Focus on yourself for now' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch !== 'yes') return 'You went home alone, and that was alright.';
      const sp = makeAdultStranger(c.s, c.rng, c.me);
      startDating(c.s, c.me, sp);
      stat(c.me, 'happiness', 8);
      journal(c.s, `You started dating ${fullName(sp)}.`, 'major');
      return `You and ${sp.firstName}${sp.jobId ? `, a ${CAREER_BY_ID[sp.jobId].name.toLowerCase()},` : ''} have a second date, then a third. Spend time together to see where it goes.`;
    },
  },
  {
    id: 'proposal',
    major: true,
    cooldown: 2,
    candidates: (c) => {
      const p = partnerOf(c.s, c.me.id);
      const ps = activePartnership(c.s, c.me.id);
      if (!p || ps?.status !== 'dating' || c.s.year - ps.startYear < 1) return [];
      const aff = getBond(c.s, c.me.id, p.id).affinity;
      return one(aff >= 30, aff >= 60 ? 6 : 3, aff >= 60, p);
    },
    build: (c, p) => {
      const b = getBond(c.s, c.me.id, p!.id);
      const odds = b.affinity >= 70 ? 'They light up around you.' : b.affinity >= 45 ? 'Things are good between you.' : 'You are fairly sure they care.';
      const savings = c.s.households[p!.householdId].wallet;
      return {
        title: `Forever with ${p!.firstName}?`,
        text: `You've been dating ${p!.firstName} for ${c.s.year - activePartnership(c.s, c.me.id)!.startYear} year(s). ${odds} Marrying means moving in together and combining finances (${p!.firstName} has ${money(savings)}).`,
        choices: [
          { id: 'propose', label: 'Propose', hint: 'They might say no if the bond is weak' },
          { id: 'wait', label: 'Not yet', hint: 'Keep dating' },
          { id: 'end', label: 'End it', hint: 'This is not the one' },
        ],
      };
    },
    resolve: (c, ch, p) => {
      if (ch === 'wait') return 'You decided there was no rush.';
      if (ch === 'end') {
        breakUp(c.s, c.me, p!);
        stat(c.me, 'happiness', -4);
        return `You and ${p!.firstName} parted ways.`;
      }
      const b = getBond(c.s, c.me.id, p!.id);
      // In the guided first playthrough, the answer is always yes.
      if (guidedPerson(c.s)?.id === c.me.id || c.rng.chance(0.3 + (b.affinity + b.trust) / 200)) {
        marry(c.s, c.me, p!);
        stat(c.me, 'happiness', 12);
        journal(c.s, `You married ${fullName(p!)}.`, 'major');
        return `${p!.firstName} said yes! A small wedding, a big party, and one shared address.`;
      }
      adjustBond(c.s, c.me.id, p!.id, -10, -5);
      stat(c.me, 'happiness', -8);
      return `${p!.firstName} said they need more time. The car ride home was very quiet.`;
    },
  },
  {
    id: 'dating_rocky',
    severe: true,
    major: true,
    cooldown: 2,
    candidates: (c) => {
      const p = partnerOf(c.s, c.me.id);
      if (!p || activePartnership(c.s, c.me.id)?.status !== 'dating') return [];
      return one(getBond(c.s, c.me.id, p.id).affinity < 0, 5, true, p);
    },
    build: (_c, p) => ({
      title: 'Cancelled plans',
      text: `${p!.firstName} has cancelled on you three times this month, and you've barely made time either.`,
      choices: [
        { id: 'try', label: 'Make it work', hint: 'Plan more time together next year' },
        { id: 'end', label: 'Call it off' },
      ],
    }),
    resolve: (c, ch, p) => {
      if (ch === 'try') {
        adjustBond(c.s, c.me.id, p!.id, 12, 5);
        return `You promised each other a real effort. Time will tell.`;
      }
      breakUp(c.s, c.me, p!);
      return `You and ${p!.firstName} agreed it had run its course.`;
    },
  },
  {
    id: 'divorce_or_reconcile',
    severe: true,
    major: true,
    cooldown: 2,
    candidates: (c) => {
      const ex = separatedFrom(c.s, c.me.id);
      return one(!!ex && c.s.year > (c.me.flags.separated_year ?? 0), 8, true, ex);
    },
    build: (c, ex) => {
      const share = homeEquityShare(c.s, c.me);
      const b = getBond(c.s, c.me.id, ex!.id);
      return {
        title: 'Papers on the table',
        text: `You and ${ex!.firstName} have lived apart for a year. Time to decide.${share ? ` A divorce means paying ${ex!.firstName} ${money(share)}, half the equity in the house.` : ''}`,
        choices: [
          { id: 'divorce', label: 'Finalize the divorce', hint: share ? `Pay ${money(share)}` : 'A clean break' },
          { id: 'reconcile', label: 'Try again together', hint: b.affinity + b.trust > 0 ? 'There is still something there' : 'A long shot' },
          { id: 'wait', label: 'Stay separated for now' },
        ],
      };
    },
    resolve: (c, ch, ex) => {
      if (ch === 'wait') return 'Neither of you is ready to sign anything yet.';
      if (ch === 'reconcile') {
        const b = getBond(c.s, c.me.id, ex!.id);
        if (c.rng.chance(0.3 + (b.affinity + b.trust) / 300)) {
          reconcile(c.s, c.me, ex!);
          delete c.me.flags.separated_year;
          for (const k of kidsAtHome(c.s, c.me)) stat(k, 'happiness', 8);
          journal(c.s, `You and ${ex!.firstName} got back together.`, 'major');
          return `${ex!.firstName} moved back home. It's fragile, but it's yours.`;
        }
        adjustBond(c.s, c.me.id, ex!.id, -5, -5);
        return `${ex!.firstName} wasn't ready. You're still separated.`;
      }
      const paid = divorce(c.s, c.me, ex!);
      delete c.me.flags.separated_year;
      journal(c.s, `You and ${ex!.firstName} divorced.`, 'major');
      return paid ? `It's final. You paid ${money(paid)} to settle the house.` : "It's final. A new chapter begins.";
    },
  },
  {
    // Scheduled by a romantic night (see romance.ts). The subject is the partner.
    id: 'unplanned_pregnancy',
    major: true,
    cooldown: 0,
    build: (c, p) => {
      const carrierIsMe = c.me.sex === 'F';
      const wants = !!p!.flags.wants_baby;
      const together = p!.householdId === c.me.householdId;
      return {
        title: 'A surprise',
        text: `${carrierIsMe ? "You're" : `${p!.firstName} is`} pregnant. It wasn't planned. ${p!.firstName} ${wants ? 'would love to have the baby' : "isn't sure they're ready"}. What do you two decide?`,
        choices: [
          { id: 'keep', label: 'Have the baby', hint: 'Due next year; the baby lives with you' },
          { id: 'keep_together', label: 'Have the baby and move in together', hint: together ? 'You already live together' : `${p!.firstName}'s household joins yours`, disabled: together },
          { id: 'adoption', label: 'Place the baby for adoption', hint: 'With a family who has been hoping for a child' },
          { id: 'not_continue', label: 'Decide not to continue the pregnancy', hint: 'A private decision' },
        ],
      };
    },
    resolve: (c, ch, p) => {
      const wants = !!p!.flags.wants_baby;
      delete p!.flags.wants_baby;
      const carrier = c.me.sex === 'F' ? c.me : p!;
      const other = carrier === c.me ? p! : c.me;
      if (ch === 'keep' || ch === 'keep_together') {
        if (ch === 'keep_together' && p!.householdId !== c.me.householdId) {
          mergeHouseholds(c.s, p!.householdId, c.me.householdId);
          journal(c.s, `${p!.firstName} moved in with you.`, 'major');
        }
        wallet(c).pendingBirth = { year: c.s.year + 1, parents: [carrier.id, other.id] };
        flag(c.me, 'surprise_baby');
        adjustBond(c.s, c.me.id, p!.id, wants ? 8 : -2, wants ? 5 : 0);
        stat(c.me, 'stress', 4);
        return ch === 'keep_together'
          ? `Nervous, excited, and suddenly sharing a closet. The baby is due next year.`
          : `Ready or not, a baby is on the way, due next year.`;
      }
      if (ch === 'adoption') {
        adjustBond(c.s, c.me.id, p!.id, wants ? -8 : 3, wants ? -6 : 2);
        stat(c.me, 'happiness', -3);
        stat(c.me, 'stress', 3);
        flag(c.me, 'placed_for_adoption');
        journal(c.s, 'A baby was born and placed with an adoptive family.', 'info');
        return 'Next year the baby goes home with a family who had waited a long time. You hope they have a wonderful life.';
      }
      adjustBond(c.s, c.me.id, p!.id, wants ? -10 : 3, wants ? -8 : 2);
      stat(c.me, 'stress', 4);
      journal(c.s, `You and ${p!.firstName} decided not to continue the pregnancy.`, 'info');
      return `It was a hard conversation, and a private one. You and ${p!.firstName} made the choice that felt right for you.`;
    },
  },
  {
    id: 'baby',
    major: true,
    cooldown: 2,
    candidates: (c) => {
      const p = partnerInHome(c.s, c.me);
      if (!p || age(c, c.me) > 55 || wallet(c).pendingBirth || activePartnership(c.s, c.me.id)?.status !== 'married') return [];
      if (c.s.pending.some((x) => x.eventId === 'unplanned_pregnancy')) return [];
      const kids = childrenOf(c.s, c.me.id).length;
      if (kids >= 4) return [];
      return [{ subject: p, weight: kids === 0 ? 5 : 2, urgent: kids === 0 && age(c, c.me) <= 40 }];
    },
    build: (c, p) => {
      const canBirth = age(c, c.me) <= 44 && age(c, p!) <= 44 && c.me.sex !== p!.sex;
      return {
        title: 'A bigger family?',
        text: `${p!.firstName} asks whether it's time to grow your family.`,
        choices: [
          { id: 'yes', label: 'Start trying for a baby', hint: canBirth ? 'A baby costs time and money' : 'Not possible for you two', disabled: !canBirth },
          { id: 'adopt', label: 'Adopt a child ($10,000)', hint: 'Usually a young child, 0–6', disabled: wallet(c).wallet < 10000 },
          { id: 'no', label: 'Not right now' },
        ],
      };
    },
    resolve: (c, ch, p) => {
      if (ch === 'no') return 'You agreed to talk about it again later.';
      if (ch === 'adopt') {
        wallet(c).wallet -= 10000;
        const kid = makePerson(c.s, c.rng, {
          birthYear: c.s.year - c.rng.int(0, 6),
          lastName: c.me.lastName,
          householdId: c.me.householdId,
          generation: c.me.generation + 1,
        });
        kid.biologicalParents = [];
        kid.adoptiveParents = [c.me.id, p!.id];
        kid.stats.smarts = c.rng.int(25, 45);
        kid.stats.stress = 25;
        for (const parent of [c.me, p!]) adjustBond(c.s, parent.id, kid.id, 30, 15);
        journal(c.s, `You adopted ${kid.firstName}, age ${ageOf(kid, c.s.year)}.`, 'birth');
        return `${kid.firstName} came home with one small suitcase. Trust will take time to build.`;
      }
      if (guidedPerson(c.s)?.id === c.me.id || c.rng.chance(0.8)) {
        wallet(c).pendingBirth = { year: c.s.year + 1, parents: [c.me.id, p!.id] };
        adjustBond(c.s, c.me.id, p!.id, 6, 3);
        return 'Good news: a baby is on the way, due next year.';
      }
      return "It didn't happen this year.";
    },
  },

  // ── Arc: home and money ────────────────────────────────────────────
  {
    id: 'house_for_sale',
    major: true,
    cooldown: 4,
    candidates: (c) => one(!wallet(c).assets.some((a) => a.kind === 'house') && wallet(c).wallet >= homeUpfront('family', 0.1), 3),
    build: () => {
      const h = HOMES.family;
      const loan = h.price * 0.9;
      return {
        title: 'A house for sale',
        text: `A ${h.label.toLowerCase()} in a good school district is for sale: ${money(h.price)}, with ${money(homeUpfront('family', 0.1))} up front. No more rent, but a mortgage of ${money(annuityPayment(loan, MORTGAGE_RATE, MORTGAGE_YEARS))} a year. (You can also shop for homes any time in the Money tab.)`,
        choices: [
          { id: 'buy', label: 'Buy it', hint: 'Builds wealth over time' },
          { id: 'rent', label: 'Keep renting', hint: 'Keep your savings liquid' },
        ],
      };
    },
    resolve: (c, ch) => {
      if (ch !== 'buy') return 'You kept renting. The savings stay in the bank.';
      const h = HOMES.family;
      const loan = Math.round(h.price * 0.9);
      wallet(c).wallet -= homeUpfront('family', 0.1);
      wallet(c).assets.push({
        id: newId(c.s, 'a'), kind: 'house', name: h.label, value: h.price, upkeep: h.upkeep, capacity: h.capacity, garage: h.garage,
        mortgage: loan, rate: MORTGAGE_RATE, payment: annuityPayment(loan, MORTGAGE_RATE, MORTGAGE_YEARS),
      });
      for (const m of [c.me, ...kidsAtHome(c.s, c.me)]) stat(m, 'happiness', 6);
      journal(c.s, 'You bought a family home.', 'major');
      return 'You got the keys. The kids raced to claim bedrooms.';
    },
  },
  {
    id: 'car_trouble',
    major: false,
    cooldown: 3,
    // Older and less reliable cars break down far more often.
    candidates: (c) => {
      const car = shakiestCar(wallet(c));
      return one(!!car, car ? 0.5 + 8 * breakdownChance(car, garagedIds(wallet(c)).has(car.id)) : 0);
    },
    build: (c) => {
      const car = shakiestCar(wallet(c));
      const cost = car ? bigRepair(car) : 0;
      const old = car ? conditionOf(car).tone === 'bad' : false;
      return {
        title: 'Car trouble',
        text: car
          ? `The ${car.name} (${carAge(car)} years old) makes a horrible noise and dies on the highway. The repair will cost ${money(cost)}.${old ? ' The mechanic says it may not be worth it.' : ''}`
          : 'The car makes a horrible noise and dies on the highway.',
        choices: [
          { id: 'fix', label: `Pay for the repair (${money(cost)})`, disabled: !car || wallet(c).wallet < cost, hint: old ? 'It may not last much longer' : undefined },
          { id: 'scrap', label: 'Scrap it', hint: car ? `Get ${money(SCRAP_VALUE)}; buy another in the Money tab` : undefined, disabled: !car },
          { id: 'bus', label: 'Take the bus for a while', hint: 'Stress up, late to work' },
        ],
      };
    },
    resolve: (c, ch) => {
      const hh = wallet(c);
      const car = shakiestCar(hh);
      if (ch === 'fix' && car) {
        hh.wallet -= bigRepair(car);
        return 'Fixed. Your wallet is lighter.';
      }
      if (ch === 'scrap' && car) {
        hh.assets = hh.assets.filter((a) => a !== car);
        hh.wallet += SCRAP_VALUE;
        journal(c.s, `You scrapped the ${car.name}.`, 'info');
        return 'The tow truck hauled it away. Time to go car shopping.';
      }
      stat(c.me, 'stress', 6);
      c.me.workPerf = Math.max(0, c.me.workPerf - 5);
      return 'The bus is slow, but you got through a lot of podcasts.';
    },
  },

  // ── Arc: a full house ──────────────────────────────────────────────
  {
    id: 'kid_moves_back',
    major: false,
    cooldown: 4,
    candidates: (c) =>
      childrenOf(c.s, c.me.id)
        .filter((k) => alive(k) && k.householdId !== c.me.householdId && age(c, k) >= 19 && age(c, k) <= 35
          && !partnerOf(c.s, k.id) && membersOf(c.s, k.householdId).length === 1 && c.s.households[k.householdId].wallet < -8000)
        .map((k) => ({ subject: k, weight: 4 })),
    build: (c, k) => {
      const debt = -c.s.households[k!.householdId].wallet;
      return {
        title: `${k!.firstName} calls home`,
        text: `${k!.firstName} is ${money(debt)} in debt and can't make rent. They ask, quietly, whether they could move back home.`,
        choices: [
          { id: 'home', label: 'Of course, come home', hint: `Their debt (${money(debt)}) becomes your household's` },
          { id: 'help', label: 'Send $5,000 instead', disabled: wallet(c).wallet < 5000 },
          { id: 'no', label: 'They need to figure it out', hint: 'Tough love' },
        ],
      };
    },
    resolve: (c, ch, k) => {
      if (ch === 'home') {
        mergeHouseholds(c.s, k!.householdId, c.me.householdId);
        k!.flags.lives_at_home = 1;
        adjustBond(c.s, c.me.id, k!.id, 10, 10);
        journal(c.s, `${k!.firstName} moved back home.`, 'info');
        return `${k!.firstName}'s old room fills up with boxes again.`;
      }
      if (ch === 'help') {
        wallet(c).wallet -= 5000;
        c.s.households[k!.householdId].wallet += 5000;
        adjustBond(c.s, c.me.id, k!.id, 6, 4);
        return `${k!.firstName} thanked you three times on the phone.`;
      }
      adjustBond(c.s, c.me.id, k!.id, -8, -6);
      flag(k!, 'tough_love');
      return `${k!.firstName} said they understood. They didn't call for a while.`;
    },
  },
  {
    id: 'adult_kid_idle',
    major: false,
    cooldown: 3,
    candidates: (c) =>
      membersOf(c.s, c.me.householdId)
        .filter((k) => (k.biologicalParents.includes(c.me.id) || k.adoptiveParents.includes(c.me.id))
          && age(c, k) >= 20 && !k.jobId && !k.partJobId && !k.studyingUntil)
        .map((k) => ({ subject: k, weight: 3 })),
    build: (c, k) => ({
      title: 'Still on the couch',
      text: `${k!.firstName} is ${age(c, k!)}, living at home, and hasn't found work.`,
      choices: [
        { id: 'push', label: 'Push them to find a job', hint: 'Likely works; they may resent it' },
        { id: 'school', label: 'Pay for trade school ($6,000)', hint: '2 years, then steady work', disabled: wallet(c).wallet < 6000 },
        { id: 'patience', label: 'Be patient', hint: 'Everyone moves at their own pace' },
      ],
    }),
    resolve: (c, ch, k) => {
      if (ch === 'push') {
        const job = pickCareer(c.rng, k!) ?? pickCareer(c.rng, k!, 'part');
        adjustBond(c.s, c.me.id, k!.id, -6, -3);
        if (job) {
          assignJob(k!, job);
          return `${k!.firstName} grumbled, then started as a ${job.name.toLowerCase()} the next month.`;
        }
        return `${k!.firstName} applied everywhere. Nothing yet.`;
      }
      if (ch === 'school') {
        wallet(c).wallet -= 6000;
        startPath(c.s, k!, 'trade');
        adjustBond(c.s, c.me.id, k!.id, 6, 6);
        return `${k!.firstName} started trade school with real energy.`;
      }
      stat(k!, 'happiness', 3);
      return `You let it be. ${k!.firstName} seemed relieved.`;
    },
  },
  {
    id: 'parent_needs_care',
    major: true,
    cooldown: 4,
    candidates: (c) =>
      parentsOf(c.s, c.me)
        .filter((p) => alive(p) && age(c, p) >= 75 && p.stats.health < 55 && p.householdId !== c.me.householdId
          && !p.flags.care_home && membersOf(c.s, p.householdId).length === 1)
        .map((p) => ({ subject: p, weight: 5, urgent: p.stats.health < 40 })),
    build: (c, p) => {
      const theirs = c.s.households[p!.householdId].wallet;
      return {
        title: `${p!.firstName} can't live alone`,
        text: `After a fall, ${p!.firstName}'s doctor says living alone isn't safe anymore. ${p!.firstName} has ${money(theirs)} saved.`,
        choices: [
          { id: 'move_in', label: 'Move in with us', hint: `Their savings join your household; more stress for you` },
          { id: 'care_help', label: 'Care home, and you help pay', hint: '$15,000/yr from you toward $35,000/yr' },
          { id: 'care', label: 'Care home on their own savings', hint: '$35,000/yr from their money' },
          { id: 'no', label: 'They will manage', hint: 'Risky' },
        ],
      };
    },
    resolve: (c, ch, p) => {
      if (ch === 'move_in') {
        mergeHouseholds(c.s, p!.householdId, c.me.householdId);
        adjustBond(c.s, c.me.id, p!.id, 12, 10);
        stat(c.me, 'stress', 8);
        stat(p!, 'happiness', 10);
        journal(c.s, `${p!.firstName} moved in with you.`, 'major');
        return `The guest room became ${p!.firstName}'s room. Dinners got louder and longer.`;
      }
      if (ch === 'care' || ch === 'care_help') {
        p!.flags.care_home = 1;
        if (ch === 'care_help') p!.flags.care_support = 1;
        adjustBond(c.s, c.me.id, p!.id, ch === 'care_help' ? 6 : 0, 3);
        stat(p!, 'health', 10);
        journal(c.s, `${p!.firstName} moved into a care home.`, 'info');
        return `The staff are kind. ${p!.firstName} already has opinions about the food.`;
      }
      adjustBond(c.s, c.me.id, p!.id, -10, -8);
      stat(p!, 'happiness', -10);
      stat(p!, 'health', -8);
      return `${p!.firstName} insisted they were fine. You hope they're right.`;
    },
  },

  // ── Arc: never too late to learn ───────────────────────────────────
  {
    id: 'night_school_flyer',
    major: false,
    cooldown: 5,
    candidates: (c) => {
      const a = age(c, c.me);
      const stuck = !c.me.jobId || c.me.jobId === 'retail' || (c.me.jobLevel === 1 && c.me.jobYears >= 4);
      const missing = !c.me.flags.degree || !c.me.flags.trade_cert;
      return one(a >= 22 && a <= 55 && !c.me.education && !c.me.studyingUntil && missing && stuck, 3);
    },
    build: (c) => ({
      title: 'A flyer for night school',
      text: 'The community college down the road runs evening programs for working adults. Each year takes some of your time and tuition.',
      choices: [
        { id: 'degree', label: `Enroll: ${PROGRAMS.degree.short}`, hint: `${PROGRAMS.degree.required} study blocks total · ${money(PROGRAMS.degree.tuition)}/yr`, disabled: !!c.me.flags.degree || c.me.stats.smarts < PROGRAMS.degree.minSmarts },
        { id: 'trade_cert', label: `Enroll: ${PROGRAMS.trade_cert.short}`, hint: `${PROGRAMS.trade_cert.required} study blocks total · ${money(PROGRAMS.trade_cert.tuition)}/yr`, disabled: !!c.me.flags.trade_cert },
        { id: 'no', label: 'Not now' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'no') return 'You stuck the flyer on the fridge. Maybe someday.';
      const prog = PROGRAMS[ch as 'degree' | 'trade_cert'];
      c.me.education = { program: prog.id, progress: 0, required: prog.required, startYear: c.s.year };
      // Pencil study time into next year's plan, taken from relaxing first.
      const alloc = c.s.plan.alloc;
      const fromRelax = Math.min(3, alloc.relax ?? 0);
      alloc.relax = (alloc.relax ?? 0) - fromRelax;
      if (!alloc.relax) delete alloc.relax;
      const unused = Math.max(0, TIME_BUDGET - Object.values(alloc).reduce((a, b) => a + b, 0));
      const blocks = fromRelax + Math.min(3 - fromRelax, unused);
      if (blocks) alloc.study = (alloc.study ?? 0) + blocks;
      return alloc.study ? `You're enrolled. ${alloc.study} Night school blocks are in next year's plan; ${prog.required} in total gets you there.` : `You're enrolled. Free up time for Night school blocks next year; ${prog.required} in total gets you there.`;
    },
  },
  {
    id: 'new_credential_job',
    major: true,
    cooldown: 0,
    candidates: (c) => {
      if (!c.me.flags.fresh_credential || c.s.year - c.me.flags.fresh_credential > 1) return [];
      return one(!!bestNewJob(c), 8, true);
    },
    build: (c) => {
      const job = bestNewJob(c)!;
      const now = c.me.jobId ? salaryOf(CAREER_BY_ID[c.me.jobId], c.me.jobLevel) : 0;
      return {
        title: 'Your new credential pays off',
        text: `A recruiter saw your new qualification. They offer you a job as a ${job.name} at ${money(job.salary)} a year${now ? ` (you make ${money(now)} now)` : ''}.`,
        choices: [
          { id: 'take', label: `Become a ${job.name}`, hint: `Expects ${job.blocks} blocks a year` },
          { id: 'stay', label: c.me.jobId ? 'Stay where you are' : 'Not right now' },
        ],
      };
    },
    resolve: (c, ch) => {
      const job = bestNewJob(c)!;
      delete c.me.flags.fresh_credential;
      if (ch !== 'take') return 'You thanked them and kept their number.';
      assignJob(c.me, job);
      c.me.retired = false;
      journal(c.s, `You started a new career as a ${job.name}.`, 'major');
      return `New badge, new desk, new title: ${job.name}.`;
    },
  },
  {
    id: 'workplace_credit',
    major: false,
    cooldown: 4,
    candidates: (c) => one(!!c.me.jobId, 1),
    build: () => ({
      title: 'Stolen credit',
      text: 'A coworker presents your idea in a meeting as their own.',
      choices: [
        { id: 'confront', label: 'Speak up in the meeting', hint: 'Bold; could go either way' },
        { id: 'boss', label: 'Talk to your manager later', hint: 'Slower, safer' },
        { id: 'let', label: 'Let it go', hint: 'Keep the peace' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'confront') {
        const ok = c.rng.chance(0.5);
        c.me.workPerf = Math.max(0, Math.min(100, c.me.workPerf + (ok ? 10 : -8)));
        return ok ? 'The room turned to you. The idea, and the credit, are yours.' : 'It came off as petty. The meeting moved on.';
      }
      if (ch === 'boss') {
        c.me.workPerf = Math.min(100, c.me.workPerf + 4);
        return 'Your manager nodded slowly. They noticed.';
      }
      stat(c.me, 'stress', 5);
      return 'You let it slide. It still bothers you at night.';
    },
  },
];

/** The best-paying new career a fresh credential unlocks, if it beats the current job. */
function bestNewJob(c: Ctx) {
  const current = c.me.jobId ? salaryOf(CAREER_BY_ID[c.me.jobId], c.me.jobLevel) : 0;
  return CAREERS.filter((j) => j.hours === 'full' && j.id !== c.me.jobId && (j.requires ? !!c.me.flags[j.requires] : false) && qualifies(c.me, j) && j.salary > current)
    .sort((a, b) => b.salary - a.salary)[0];
}

/** Queued (via `scheduled`) when the player's baby is born: pick a suggested name or type one. */
const NAME_BABY: EventDef = {
  id: 'name_baby',
  stage: 'any',
  major: false,
  cooldown: 0,
  build: (c, baby) => {
    const pool = (baby!.sex === 'F' ? FEMALE_NAMES : MALE_NAMES).filter((n) => n !== baby!.firstName);
    const alt1 = pool[c.rng.int(0, pool.length - 1)];
    const alt2 = pool.filter((n) => n !== alt1)[c.rng.int(0, pool.length - 2)];
    return {
      title: `Welcome, little ${baby!.sex === 'F' ? 'girl' : 'boy'}!`,
      text: `The newest ${baby!.lastName} has arrived. What will you call ${baby!.sex === 'F' ? 'her' : 'him'}?`,
      choices: [
        { id: `n:${baby!.firstName}`, label: baby!.firstName },
        { id: `n:${alt1}`, label: alt1 },
        { id: `n:${alt2}`, label: alt2 },
        { id: 'custom', label: 'Choose my own name', input: { label: 'Baby\'s first name', maxLength: NAME_MAX, placeholder: 'Type a name' } },
      ],
    };
  },
  resolve: (c, ch, baby, text) => {
    const old = baby!.firstName;
    const name = ch === 'custom' ? cleanName(text) || old : ch.slice(2);
    baby!.firstName = name;
    // Keep the birth announcement in the journal consistent with the chosen name.
    const entry = [...c.s.journal].reverse().find((j) => j.kind === 'birth' && j.text.startsWith(`${old} ${baby!.lastName}`));
    if (entry) entry.text = entry.text.replace(`${old} ${baby!.lastName}`, `${name} ${baby!.lastName}`);
    return `${name} ${baby!.lastName}. It suits ${baby!.sex === 'F' ? 'her' : 'him'} perfectly.`;
  },
};

/** Guided playthrough safety net: a child arrives before 30 no matter how things went. */
const GUIDED_KID: EventDef = {
  id: 'guided_kid',
  stage: 'any',
  major: true,
  cooldown: 0,
  candidates: (c) => {
    if (guidedPerson(c.s)?.id !== c.me.id) return [];
    const a = ageOf(c.me, c.s.year);
    const hasKid = childrenOf(c.s, c.me.id).length > 0 || !!c.s.households[c.me.householdId].pendingBirth;
    return a >= 27 && a <= 29 && !hasKid ? [{ weight: 100, urgent: true, subject: partnerInHome(c.s, c.me) }] : [];
  },
  build: (c, partner) =>
    partner
      ? {
          title: 'A surprise',
          text: `${partner.firstName} sits you down with a grin and a pregnancy test. You're going to be a parent!`,
          choices: [
            { id: 'joy', label: 'This is wonderful!' },
            { id: 'nervous', label: 'Ready or not…', hint: 'Nervous, but in' },
          ],
        }
      : {
          title: 'A child who needs a home',
          text: `Your cousin can no longer care for her toddler. The family is asking whether you could take ${c.me.sex === 'F' ? 'him' : 'her'} in and raise ${c.me.sex === 'F' ? 'him' : 'her'} as your own.`,
          choices: [{ id: 'adopt', label: 'Of course. Bring them home.' }],
        },
  resolve: (c, ch, partner) => {
    if (ch === 'adopt' || !partner) {
      const kid = makePerson(c.s, c.rng, {
        birthYear: c.s.year - c.rng.int(2, 3),
        lastName: c.me.lastName,
        householdId: c.me.householdId,
        generation: c.me.generation + 1,
      });
      kid.adoptiveParents = [c.me.id];
      kid.stats.smarts = c.rng.int(30, 45);
      adjustBond(c.s, c.me.id, kid.id, 35, 20);
      journal(c.s, `You welcomed ${kid.firstName} into your home.`, 'birth');
      return `${kid.firstName} clutched a stuffed rabbit and, after a week, started calling your place home.`;
    }
    c.s.households[c.me.householdId].pendingBirth = { year: c.s.year + 1, parents: [c.me.id, partner.id] };
    adjustBond(c.s, c.me.id, partner.id, 8, 4);
    return ch === 'joy' ? 'You both cried a little. The good kind.' : 'Deep breaths. You are going to be great at this.';
  },
};

const ALL_EVENTS: EventDef[] = [...EVENTS, ...CHILD_EVENTS, NAME_BABY, GUIDED_KID];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));

function pushPending(c: Ctx, def: EventDef, subject?: Person) {
  const built = def.build(c, subject);
  const ev: PendingEvent = {
    uid: `${c.s.year}-${def.id}-${newId(c.s, 'e')}`,
    eventId: def.id,
    subjectId: subject?.id,
    major: def.major,
    ...built,
  };
  c.s.pending.push(ev);
  c.s.lastFired[def.id] = c.s.year;
  if (def.major) c.s.lastMajorYear = c.s.year;
}

/** Immediately queue a follow-up event in the current decision phase. */
export function enqueue(c: Ctx, id: string, subject?: Person) {
  pushPending(c, EVENT_BY_ID[id], subject);
}

const MAX_MINOR = 2;

/**
 * Step 7: decide this year's events. Scheduled consequences first, then
 * circumstance-driven (urgent) majors, then the pacing timer, then minors.
 */
export function generateEvents(s: GameState, rng: Rng) {
  const c: Ctx = { s, rng, me: active(s) };
  const due = s.scheduled.filter((x) => x.dueYear <= s.year);
  s.scheduled = s.scheduled.filter((x) => x.dueYear > s.year);
  for (const sch of due) {
    const def = EVENT_BY_ID[sch.eventId];
    if (!def) continue; // unknown (older-rules) event: never crash, just skip it
    let sub = sch.subjectId ? s.people[sch.subjectId] : undefined;
    if (sub && (!alive(sub) || (sch.eventId === 'health_scare' && sub.id !== s.activeId))) continue;
    if (def.severe && severeGuard(s)) continue; // held back early in the guided playthrough
    // Scripted beats only happen if they still make sense (e.g. a proposal needs someone to propose to).
    if (def.candidates && !sch.subjectId) {
      const cands = def.candidates(c).filter((x) => x.weight > 0);
      if (!cands.length) continue;
      sub = cands[0].subject;
    }
    pushPending(c, def, sub);
  }

  const eligible: { def: EventDef; cand: Candidate }[] = [];
  const childActive = ageOf(c.me, s.year) < 18;
  for (const def of ALL_EVENTS) {
    if (!def.candidates) continue;
    // Children only get childhood events; adults never do. "any" events check age themselves.
    const stage = def.stage ?? 'adult';
    if (stage !== 'any' && (stage === 'child') !== childActive) continue;
    if (def.severe && severeGuard(s)) continue;
    const last = s.lastFired[def.id];
    if (last !== undefined && s.year - last < Math.max(1, def.cooldown)) continue;
    for (const cand of def.candidates(c)) if (cand.weight > 0) eligible.push({ def, cand });
  }

  if (!s.pending.some((p) => p.major)) {
    const urgent = eligible.filter((e) => e.def.major && e.cand.urgent);
    let pick = rng.weighted(urgent.map((e) => [e, e.cand.weight] as const));
    // Random majors wait until the guided playthrough opens up; scripted and life-stage beats still happen.
    if (!pick && !scriptedPhase(s)) {
      const since = s.year - s.lastMajorYear;
      const chance = since < 3 ? 0 : Math.min(0.9, (since - 2) * 0.3);
      if (rng.chance(chance)) {
        pick = rng.weighted(eligible.filter((e) => e.def.major).map((e) => [e, e.cand.weight] as const));
      }
    }
    if (pick) pushPending(c, pick.def, pick.cand.subject);
  }

  let minors = eligible.filter((e) => !e.def.major);
  let count = 0;
  while (minors.length && count < MAX_MINOR) {
    const pick = rng.weighted(minors.map((e) => [e, e.cand.weight] as const))!;
    minors = minors.filter((e) => e.def !== pick.def);
    if (!rng.chance(0.55)) continue;
    pushPending(c, pick.def, pick.cand.subject);
    count++;
  }
}

export function resolveEvent(s: GameState, rng: Rng, pe: PendingEvent, choiceId: string, text?: string): string {
  const def = EVENT_BY_ID[pe.eventId];
  if (!def) return "This moment has passed.";
  const c: Ctx = { s, rng, me: active(s) };
  const sub = pe.subjectId ? s.people[pe.subjectId] : undefined;
  if (pe.subjectId && (!sub || !alive(sub))) return 'Circumstances changed before you could act.';
  const before = s.journal.length;
  const outcome = def.resolve(c, choiceId, sub, text);
  // If the event already wrote its own headline, log the outcome as a normal entry so highlights don't repeat.
  const headlined = s.journal.slice(before).some((j) => j.kind === 'major' || j.kind === 'birth');
  journal(s, `${pe.title}: ${outcome}`, pe.major && !headlined ? 'major' : 'info');
  return outcome;
}
