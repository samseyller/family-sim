import { HOBBY_BY_ID } from '../content/actions';
import { CAREER_BY_ID, LEVEL_TITLES, requiredBlocks, salaryOf } from '../content/careers';
import { makeAdultStranger } from './generate';
import {
  marry, moveOut, partnerInHome, preferredPath, receptiveness, receptivenessLabel, retire, separate,
  startPath, type LifePath,
} from './family';
import type { Rng } from './rng';
import type { GameState, PendingChoice, PendingEvent, Person } from './types';
import {
  active, adjustBond, ageOf, alive, childrenOf, flag, getBond, journal, kidsAtHome, money, newId, stat,
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
  resolve: (c: Ctx, choice: string, sub?: Person) => string;
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
    candidates: (c) => one(!!c.me.jobId && age(c, c.me) >= 62, 5, true),
    build: () => ({
      title: 'Time to retire?',
      text: 'Your coworkers keep asking about your plans. You could retire now on a pension of 40% of your salary.',
      choices: [
        { id: 'retire', label: 'Retire', hint: 'All your time is your own' },
        { id: 'stay', label: 'Keep working', hint: 'Full salary, for now' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'retire') {
        retire(c.me);
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
      text: `${k!.firstName} is packing boxes. They take their college fund (${money(k!.fund)}). Will you add a gift to help them start out?`,
      choices: [
        { id: '0', label: 'A hug and good luck', hint: 'No money' },
        { id: '5000', label: 'Give $5,000', disabled: wallet(c).wallet < 5000 },
        { id: '15000', label: 'Give $15,000', disabled: wallet(c).wallet < 15000 },
      ],
    }),
    resolve: (c, ch, k) => {
      const gift = Number(ch);
      wallet(c).wallet -= gift;
      adjustBond(c.s, c.me.id, k!.id, gift >= 15000 ? 10 : gift > 0 ? 5 : 0, gift > 0 ? 3 : 0);
      moveOut(c.s, k!, k!.fund + gift);
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
        { id: 'separate', label: 'Separate', hint: `${p!.firstName} moves out with half the savings` },
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
      return one(!partnerInHome(c.s, c.me) && a >= 20 && a <= 55 && !c.me.studyingUntil, a <= 40 ? 4 : 2, a <= 38);
    },
    build: () => ({
      title: 'Someone new',
      text: "At a friend's party you end up talking with someone for hours. They ask if you'd like to see them again.",
      choices: [
        { id: 'yes', label: 'Say yes, and see where it goes', hint: 'Could become a life together' },
        { id: 'no', label: 'Focus on yourself for now' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch !== 'yes') return 'You went home alone, and that was alright.';
      const sp = makeAdultStranger(c.s, c.rng, c.me);
      const theirSavings = c.s.households[sp.householdId].wallet;
      marry(c.s, c.me, sp);
      stat(c.me, 'happiness', 10);
      journal(c.s, `You married ${sp.firstName} ${sp.lastName}.`, 'major');
      return `A year later you married ${sp.firstName} ${sp.lastName}${sp.jobId ? `, a ${CAREER_BY_ID[sp.jobId].name.toLowerCase()}` : ''}. They brought ${money(theirSavings)} in savings into the household.`;
    },
  },
  {
    id: 'baby',
    major: true,
    cooldown: 2,
    candidates: (c) => {
      const p = partnerInHome(c.s, c.me);
      if (!p || age(c, c.me) > 44 || age(c, p) > 44 || wallet(c).pendingBirth) return [];
      const kids = childrenOf(c.s, c.me.id).length;
      if (kids >= 4) return [];
      return [{ subject: p, weight: kids === 0 ? 5 : 2, urgent: kids === 0 && age(c, c.me) <= 40 }];
    },
    build: (_c, p) => ({
      title: 'A bigger family?',
      text: `${p!.firstName} asks whether it's time to have a child together.`,
      choices: [
        { id: 'yes', label: 'Start trying', hint: 'A baby costs time and money' },
        { id: 'no', label: 'Not right now' },
      ],
    }),
    resolve: (c, ch, p) => {
      if (ch !== 'yes') return 'You agreed to talk about it again later.';
      if (c.rng.chance(0.8)) {
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
    candidates: (c) => one(!wallet(c).assets.some((a) => a.kind === 'house') && wallet(c).wallet >= 30000, 3),
    build: () => ({
      title: 'A house for sale',
      text: 'A three-bedroom house in a good school district is for sale: $300,000 with $30,000 down. No more rent, but a mortgage of $18,000 a year.',
      choices: [
        { id: 'buy', label: 'Buy it', hint: 'Builds wealth over time' },
        { id: 'rent', label: 'Keep renting', hint: 'Keep your savings liquid' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch !== 'buy') return 'You kept renting. The savings stay in the bank.';
      const h = wallet(c);
      h.wallet -= 30000;
      h.assets.push({ id: newId(c.s, 'a'), kind: 'house', name: 'Family home', value: 300000, upkeep: 4000, mortgage: 270000 });
      for (const m of [c.me, ...kidsAtHome(c.s, c.me)]) stat(m, 'happiness', 6);
      journal(c.s, 'You bought a family home.', 'major');
      return 'You got the keys. The kids raced to claim bedrooms.';
    },
  },
  {
    id: 'car_trouble',
    major: false,
    cooldown: 3,
    candidates: () => [{ weight: 1 }],
    build: (c) => ({
      title: 'Car trouble',
      text: 'The car makes a horrible noise and dies on the highway. The repair will cost $3,000.',
      choices: [
        { id: 'fix', label: 'Pay for the repair', disabled: wallet(c).wallet < 3000 },
        { id: 'bus', label: 'Take the bus for a while', hint: 'Stress up, late to work' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'fix') {
        wallet(c).wallet -= 3000;
        return 'Fixed. Your wallet is lighter.';
      }
      stat(c.me, 'stress', 6);
      c.me.workPerf = Math.max(0, c.me.workPerf - 5);
      return 'The bus is slow, but you got through a lot of podcasts.';
    },
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

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
    const sub = sch.subjectId ? s.people[sch.subjectId] : undefined;
    if (sub && (!alive(sub) || (sch.eventId === 'health_scare' && sub.id !== s.activeId))) continue;
    pushPending(c, EVENT_BY_ID[sch.eventId], sub);
  }

  const eligible: { def: EventDef; cand: Candidate }[] = [];
  for (const def of EVENTS) {
    if (!def.candidates) continue;
    const last = s.lastFired[def.id];
    if (last !== undefined && s.year - last < Math.max(1, def.cooldown)) continue;
    for (const cand of def.candidates(c)) if (cand.weight > 0) eligible.push({ def, cand });
  }

  if (!s.pending.some((p) => p.major)) {
    const urgent = eligible.filter((e) => e.def.major && e.cand.urgent);
    let pick = rng.weighted(urgent.map((e) => [e, e.cand.weight] as const));
    if (!pick) {
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

export function resolveEvent(s: GameState, rng: Rng, pe: PendingEvent, choiceId: string): string {
  const def = EVENT_BY_ID[pe.eventId];
  const c: Ctx = { s, rng, me: active(s) };
  const sub = pe.subjectId ? s.people[pe.subjectId] : undefined;
  if (pe.subjectId && (!sub || !alive(sub))) return 'Circumstances changed before you could act.';
  const outcome = def.resolve(c, choiceId, sub);
  journal(s, `${pe.title}: ${outcome}`, pe.major ? 'major' : 'info');
  return outcome;
}
