/** Work and learning: promotions, burnout, layoffs, retirement, night school and new credentials. */
import { careerNote } from './narrative';
import { noteThread } from './threads';
import { workplace } from './careerEvents';
import { HOBBY_BY_ID, TIME_BUDGET } from '../content/actions';
import { readiness } from './retirement';
import { FULL_RETIREMENT_AGE } from '../content/retirement';
import { CAREERS, CAREER_BY_ID, PROGRAMS, qualifies, requiredBlocks, salaryOf, titleOf } from '../content/careers';
import { hasLadder, promoSkillFor } from './hobbies';
import { assignJob } from './generate';
import { retire } from './family';
import type { Person } from './types';
import { adjustBond, flag, journal, kidsAtHome, money, stat } from './util';
import { age, one, settledInJob, wallet, type Ctx, type EventDef } from './eventKit';
import { charge, credit } from './money';

/**
 * Promotions: after PROMO.years at a level with good performance (65+), or PROMO.stressedYears if
 * stress is high (70+). Overdue (5 years, or 7 when stressed) the offer comes ahead of other news.
 */
export const PROMO = { years: 2, overdue: 5, stressedAt: 70, stressedYears: 4, stressedOverdue: 7 };

const childBlocks = (c: Ctx, k: Person) =>
  (c.s.plan.alloc[`child_time:${k.id}`] ?? 0) + (c.s.plan.alloc[`homework:${k.id}`] ?? 0);

/** Ready for the next rank: the career has one, and any hobby skill it needs is there. */
export function canPromote(p: Person) {
  const job = p.jobId ? CAREER_BY_ID[p.jobId] : undefined;
  if (!job || !hasLadder(job) || job.military || job.pro) return false; // military ranks come with tours; pro ranks with play
  const need = promoSkillFor(job, p.jobLevel);
  return !need || (job.skill ? p.skills[job.skill] ?? 0 : 0) >= need;
}

/** The best-paying new career a fresh credential unlocks, if it beats the current job. */
function bestNewJob(c: Ctx) {
  const current = c.me.jobId ? salaryOf(CAREER_BY_ID[c.me.jobId], c.me.jobLevel) : 0;
  return CAREERS.filter((j) => j.hours === 'full' && j.id !== c.me.jobId && (j.requires ? !!c.me.flags[j.requires] : false) && qualifies(c.me, j) && j.salary > current)
    .sort((a, b) => b.salary - a.salary)[0];
}

export const WORK_EVENTS: EventDef[] = [
  // ── Arc: work vs. life ─────────────────────────────────────────────
  {
    id: 'promotion_offer',
    major: true,
    cooldown: 3,
    // Hobby-based careers also need enough skill for the next rank; flat-pay businesses don't promote.
    candidates: (c) => {
      const p = c.me;
      if (!settledInJob(c) || p.jobLevel >= 3 || p.workPerf < 65 || !canPromote(p)) return [];
      // Burned-out, stressed workers are passed over longer, but steady good work is never
      // ignored forever: once overdue, the offer is urgent (it can't be crowded out by other news).
      const stressed = p.stats.stress >= PROMO.stressedAt;
      if (p.jobYears < (stressed ? PROMO.stressedYears : PROMO.years)) return [];
      const overdue = p.jobYears >= (stressed ? PROMO.stressedOverdue : PROMO.overdue);
      return [{ weight: overdue ? 8 : stressed ? 2 : 4, urgent: overdue, overdue, subject: undefined }];
    },
    build: (c) => {
      const job = CAREER_BY_ID[c.me.jobId!];
      const lvl = c.me.jobLevel + 1;
      return {
        title: 'A promotion on the table',
        text: `You're offered the ${titleOf(job, lvl)} role. Pay rises to ${money(salaryOf(job, lvl))}, but it expects ${requiredBlocks(job, lvl)} blocks of your time each year instead of ${requiredBlocks(job, c.me.jobLevel)}.${c.me.aspiration === 'achievement' ? ' It’s the kind of step you’ve been working toward.' : ''}`,
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
      noteThread(c.s, 'missed_chance', c.me, undefined, { detail: `${c.me.jobId}:${c.me.jobLevel}` });
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
        charge(wallet(c), job ? Math.round(salaryOf(job, c.me.jobLevel) / 2) : 0);
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
      charge(wallet(c), 8000);
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
    candidates: (c) => one(settledInJob(c), c.me.workPerf < 35 ? 3 : 0.4),
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
        credit(wallet(c), Math.round(sal / 2));
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
    candidates: (c) => one(settledInJob(c) && age(c, c.me) >= FULL_RETIREMENT_AGE, 5, true),
    build: (c) => {
      const a = age(c, c.me);
      const r = readiness(c.s, c.me, a);
      const verdict = r.status === 'ready' ? 'Your numbers say you can afford it.' : r.status === 'tight' ? 'It would be tight.' : 'Money would be a struggle.';
      return {
      title: 'Time to retire?',
      text: `${careerNote(c.s, c.me) ? `${careerNote(c.s, c.me)} ` : ''}Your coworkers keep asking about your plans. Retiring now: employer pension ${money(r.pension)}, state pension ${money(r.state)}, and about ${money(r.savingsIncome)} a year from savings, against a budget of ${money(r.need)}. ${verdict}`,
      choices: [
        { id: 'retire', label: 'Retire', hint: 'All your time is your own' },
        { id: 'stay', label: 'Keep working', hint: 'Full salary, for now' },
      ],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'retire') {
        noteThread(c.s, 'retired', c.me, undefined, { detail: c.me.jobId ?? '' });
        retire(c.me, c.s.year);
        stat(c.me, 'happiness', 8);
        stat(c.me, 'stress', -15);
        return 'Cake, a card everyone signed, and a very quiet Monday morning.';
      }
      return 'Not yet. There is still work you want to do.';
    },
  },

];

export const LEARNING_EVENTS: EventDef[] = [
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
      c.me.flags.hired_year = c.s.year;
      c.me.retired = false;
      journal(c.s, `You started a new career as a ${job.name}.`, 'major');
      return `New badge, new desk, new title: ${job.name}.`;
    },
  },
  {
    id: 'workplace_credit',
    major: false,
    work: true,
    cooldown: 6,
    // Office politics: offices only.
    candidates: (c) => one(workplace(c) === 'office', 0.5),
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
