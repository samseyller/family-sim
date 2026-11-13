/**
 * Work life that fits the job. Every full-time career belongs to a kind of workplace (an office, a clinic, a job site,
 * the military...), and work moments only come up where they make sense: no office politics on deployment, no lunch
 * with coworkers when you run your own shop alone. Work moments are marked `work`, and at most one comes up a year
 * (see generateEvents), so the job never crowds out the rest of life.
 */
import { CAREER_BY_ID, type Career } from '../content/careers';
import { local, settledInJob, wallet, type Ctx, type EventDef } from './eventKit';
import { canMakeFriends, makeFriend } from './friends';
import { charge, credit } from './money';
import type { Person } from './types';
import { adjustBond, alive, flag, kidsAtHome, parentsOf, partnerOf, stat } from './util';

export type Workplace = 'office' | 'clinic' | 'school' | 'site' | 'shop' | 'road' | 'responder' | 'stage' | 'base' | 'team' | 'own';

const BY_ID: Record<string, Workplace> = {
  police: 'responder', firefighter: 'responder', social_worker: 'office',
  truck_driver: 'road', pilot: 'road', charter_captain: 'road', warehouse: 'shop',
  musician: 'stage', actor: 'stage', pro_coach: 'team', film_editor: 'office', architect: 'office', journalist: 'office', designer: 'office',
  oil_rig: 'site', petroleum_engineer: 'office', landscaper: 'site',
  teacher: 'school', music_director: 'school', coach: 'school',
};
const BY_SECTOR: Partial<Record<Career['sector'], Workplace>> = {
  business: 'office', finance: 'office', tech: 'office', legal: 'office', science: 'office', government: 'office', creative: 'office',
  health: 'clinic', education: 'school', trades: 'site', energy: 'site', retail: 'shop', hospitality: 'shop', service: 'shop',
  transport: 'road', entertainment: 'stage',
};

/** The kind of workplace a career is (undefined for no job). */
export function workplaceOf(c?: Career): Workplace | undefined {
  if (!c) return undefined;
  if (c.military) return 'base';
  if (c.pro) return 'team';
  if (c.startup) return 'own';
  return BY_ID[c.id] ?? BY_SECTOR[c.sector] ?? 'office';
}

/** The active character's workplace, once they've settled into a full-time job. */
export const workplace = (c: Ctx): Workplace | undefined => (settledInJob(c) && c.me.jobId ? workplaceOf(CAREER_BY_ID[c.me.jobId]) : undefined);
/** Workplaces where you have everyday coworkers. */
export const HAS_COWORKERS: Workplace[] = ['office', 'clinic', 'school', 'site', 'shop', 'responder'];

const at = (c: Ctx, ...kinds: Workplace[]) => { const w = workplace(c); return !!w && kinds.includes(w); };
const job = (c: Ctx) => CAREER_BY_ID[c.me.jobId!];
const perf = (p: Person, d: number) => { p.workPerf = Math.max(0, Math.min(100, p.workPerf + d)); };
const W = { work: true as const, major: false };

export const CAREER_EVENTS: EventDef[] = [
  // ── Clinic ──
  {
    id: 'double_shift', ...W, cooldown: 5,
    candidates: (c) => (at(c, 'clinic') ? [{ weight: 0.5 }] : []),
    build: () => ({
      title: 'Short-staffed',
      text: 'Two colleagues called in sick and the ward is overflowing. Your supervisor asks if you can stay for a second shift.',
      choices: [{ id: 'stay', label: 'Stay', hint: 'Exhausting; they won’t forget it' }, { id: 'home', label: 'Go home and rest', hint: 'You’re no good to anyone burned out' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'home') { stat(c.me, 'stress', -3); return 'You slept twelve hours. Someone else covered.'; }
      perf(c.me, 8); stat(c.me, 'stress', 6); stat(c.me, 'happiness', 2);
      return 'Twenty hours on your feet. A patient’s family stopped you in the hall to say thank you.';
    },
  },
  {
    id: 'grateful_patient', ...W, cooldown: 6,
    candidates: (c) => (at(c, 'clinic') ? [{ weight: 0.35 }] : []),
    build: () => ({ title: 'A thank-you card', text: 'A patient you cared for last winter sent a card: they’re home, healthy, and walking their dog again.', choices: [{ id: 'keep', label: 'Pin it above your locker' }] }),
    resolve: (c) => { stat(c.me, 'happiness', 6); stat(c.me, 'stress', -3); return 'Some days, that card is what gets you through.'; },
  },
  // ── School ──
  {
    id: 'student_breakthrough', ...W, cooldown: 5,
    candidates: (c) => (at(c, 'school') ? [{ weight: 0.5 }] : []),
    build: () => ({
      title: 'The kid in the back row',
      text: 'A student who has struggled all year finally gets it, and asks if you’ll stay after class to help with more.',
      choices: [{ id: 'stay', label: 'Stay after class', hint: 'Your evenings are already short' }, { id: 'refer', label: 'Point them to the tutoring center' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'refer') return 'They went, mostly. You hope it sticks.';
      stat(c.me, 'happiness', 5); stat(c.me, 'stress', 2); perf(c.me, 5);
      return 'By spring they were helping other kids. This is why you teach.';
    },
  },
  {
    id: 'difficult_parent', ...W, cooldown: 6,
    candidates: (c) => (at(c, 'school') ? [{ weight: 0.4 }] : []),
    build: () => ({
      title: 'An angry parent',
      text: 'A parent is furious about a grade and wants a meeting with you and the principal.',
      choices: [{ id: 'meet', label: 'Meet, with the work samples ready', hint: 'Prepared and calm' }, { id: 'principal', label: 'Let the principal handle it' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'principal') { stat(c.me, 'stress', 2); return 'It blew over, but you lost a little standing with the principal.'; }
      stat(c.me, 'stress', 4); perf(c.me, 4);
      return 'The work samples spoke for themselves. The parent left quieter than they arrived.';
    },
  },
  // ── Job site ──
  {
    id: 'safety_call', ...W, cooldown: 6,
    candidates: (c) => (at(c, 'site') ? [{ weight: 0.45 }] : []),
    build: () => ({
      title: 'Something’s not right',
      text: 'The scaffolding on today’s job looks wrong to you, and the foreman wants to push on to stay on schedule.',
      choices: [{ id: 'stop', label: 'Stop work and say something', hint: 'Unpopular today' }, { id: 'push', label: 'Keep your head down', hint: 'It’s probably fine' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'stop') { perf(c.me, 3); stat(c.me, 'stress', 3); return 'The inspector found two loose couplers. Nobody said thank you, but nobody got hurt.'; }
      if (c.rng.chance(0.2)) { stat(c.me, 'health', -10); stat(c.me, 'stress', 6); return 'A plank gave way. A sprained wrist and a few weeks off. It could have been worse.'; }
      return 'It held. You still didn’t like it.';
    },
  },
  {
    id: 'big_job', ...W, cooldown: 5,
    candidates: (c) => (at(c, 'site') ? [{ weight: 0.45 }] : []),
    build: (c) => ({
      title: 'A big job',
      text: `A rush job came in: three weeks of overtime, about ${'$' + local(c, 4000).toLocaleString()} extra.`,
      choices: [{ id: 'take', label: 'Take the overtime', hint: 'Long days' }, { id: 'pass', label: 'Pass; you need your weekends' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'pass') return 'Someone else took it. Your weekends stayed yours.';
      credit(wallet(c), local(c, 4000)); stat(c.me, 'stress', 5);
      return 'Twelve-hour days, a fat paycheck, and very sore knees.';
    },
  },
  // ── Shop floor ──
  {
    id: 'rude_customer', ...W, cooldown: 5,
    candidates: (c) => (at(c, 'shop') ? [{ weight: 0.5 }] : []),
    build: () => ({
      title: 'The customer is always…',
      text: 'A customer is yelling at you over something that isn’t your fault, in front of a line of people.',
      choices: [{ id: 'calm', label: 'Stay calm and fix what you can' }, { id: 'manager', label: 'Get the manager' }, { id: 'snap', label: 'Tell them exactly what you think', hint: 'Satisfying; risky' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'calm') { stat(c.me, 'stress', 3); perf(c.me, 4); return 'They left grumbling. The next customer in line said, “You handled that well.”'; }
      if (ch === 'manager') { stat(c.me, 'stress', 1); return 'The manager smoothed it over with a coupon.'; }
      perf(c.me, -10); stat(c.me, 'happiness', 2);
      return 'The line applauded. Your manager did not.';
    },
  },
  {
    id: 'holiday_rush', ...W, cooldown: 5,
    candidates: (c) => (at(c, 'shop') ? [{ weight: 0.4 }] : []),
    build: () => ({
      title: 'Holiday rush',
      text: 'Your boss asks you to work the whole holiday week, including the day itself. Time and a half.',
      choices: [{ id: 'work', label: 'Work it', hint: 'Money, and missing family time' }, { id: 'family', label: 'Ask for the holiday off' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'family') { const p = partnerOf(c.s, c.me.id); if (p) adjustBond(c.s, c.me.id, p.id, 3, 1); return 'You got the day off, barely. Worth it.'; }
      credit(wallet(c), local(c, 1200)); perf(c.me, 4);
      for (const k of kidsAtHome(c.s, c.me)) adjustBond(c.s, c.me.id, k.id, -3, 0);
      return 'The extra money helped. The kids opened presents without you.';
    },
  },
  // ── The road ──
  {
    id: 'long_haul', ...W, cooldown: 5,
    candidates: (c) => (at(c, 'road') ? [{ weight: 0.5 }] : []),
    build: (c) => ({
      title: 'Away from home',
      text: `Dispatch has a run that keeps you away for most of a month, with a bonus of about ${'$' + local(c, 3000).toLocaleString()}.`,
      choices: [{ id: 'go', label: 'Take it', hint: 'Money; missed moments at home' }, { id: 'stay', label: 'Turn it down' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'stay') return 'You stayed close to home this time.';
      credit(wallet(c), local(c, 3000)); stat(c.me, 'stress', 3);
      const p = partnerOf(c.s, c.me.id);
      if (p && p.householdId === c.me.householdId) adjustBond(c.s, c.me.id, p.id, -3, 0);
      return 'Sunrises in four states and a lot of gas-station coffee. Home never looked so good.';
    },
  },
  // ── First responders ──
  {
    id: 'close_call', ...W, cooldown: 6,
    candidates: (c) => (at(c, 'responder') ? [{ weight: 0.5 }] : []),
    build: () => ({
      title: 'A close call',
      text: 'A call went bad fast tonight. Everyone made it out, but it was closer than it should have been.',
      choices: [{ id: 'talk', label: 'Talk it through with the counselor' }, { id: 'push', label: 'Shake it off and keep going' }],
    }),
    resolve: (c, ch) => {
      flag(c.me, 'brave');
      if (ch === 'talk') { stat(c.me, 'stress', -2); return 'It helped to say it out loud. You slept that night.'; }
      stat(c.me, 'stress', 8);
      return 'You kept going. It comes back to you at odd moments.';
    },
  },
  {
    id: 'community_thanks', ...W, cooldown: 7,
    candidates: (c) => (at(c, 'responder') ? [{ weight: 0.3 }] : []),
    build: () => ({ title: 'A thank-you from the neighborhood', text: 'The kids at the elementary school made a banner for your station. It covers a whole wall.', choices: [{ id: 'ok', label: 'Hang it up' }] }),
    resolve: (c) => { stat(c.me, 'happiness', 5); return 'You took a picture of it for home.'; },
  },
  // ── The stage ──
  {
    id: 'opening_night', ...W, cooldown: 5,
    candidates: (c) => (at(c, 'stage') ? [{ weight: 0.5 }] : []),
    build: () => ({
      title: 'Opening night',
      text: 'Tonight’s the big one: a sold-out crowd, and stage fright like you haven’t felt in years.',
      choices: [{ id: 'all_in', label: 'Leave it all on the stage' }, { id: 'safe', label: 'Play it safe and get through it' }],
    }),
    resolve: (c, ch) => {
      const skillName = job(c).skill;
      const sk = skillName ? c.me.skills[skillName] ?? 0 : 50;
      if (ch === 'safe') { stat(c.me, 'stress', -2); return 'A solid show. Nobody will talk about it tomorrow, and that’s fine.'; }
      if (c.rng.chance(Math.min(0.85, 0.3 + sk / 150))) { stat(c.me, 'happiness', 7); perf(c.me, 6); return 'A standing ovation. You’ll remember that sound forever.'; }
      stat(c.me, 'stress', 5);
      return 'You went for it and missed. The reviews were kind; you weren’t.';
    },
  },
  // ── The military ──
  {
    id: 'care_package', ...W, cooldown: 4,
    candidates: (c) => (at(c, 'base') ? [{ weight: 0.6 }] : []),
    build: (c) => {
      const from = partnerOf(c.s, c.me.id) ?? parentsOf(c.s, c.me).find(alive);
      return {
        title: 'Mail call',
        text: from ? `A care package from ${from.firstName}: homemade cookies, socks, and a letter you read three times.` : 'A care package from home: cookies, socks, and a letter you read three times.',
        choices: [{ id: 'share', label: 'Share the cookies with your unit' }, { id: 'write', label: 'Write a long letter back' }],
      };
    },
    resolve: (c, ch) => {
      const from = partnerOf(c.s, c.me.id) ?? parentsOf(c.s, c.me).find(alive);
      stat(c.me, 'happiness', 4);
      if (ch === 'write') { if (from) adjustBond(c.s, c.me.id, from.id, 5, 3); return 'Four pages, front and back. You hope it doesn’t make them worry.'; }
      stat(c.me, 'stress', -3);
      return 'Gone in ten minutes. Your unit wants to know when the next box is coming.';
    },
  },
  {
    id: 'unit_bond', ...W, cooldown: 6,
    candidates: (c) => (at(c, 'base') && canMakeFriends(c.s, c.me) ? [{ weight: 0.4 }] : []),
    build: () => ({
      title: 'Your unit',
      text: 'After a long exercise in the rain, someone in your unit shares a thermos of coffee and a terrible joke. You laugh harder than you have in weeks.',
      choices: [{ id: 'friend', label: 'Stick together from now on' }, { id: 'keep', label: 'Keep to yourself' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'keep') return 'You kept your head down. It’s easier that way, mostly.';
      const f = makeFriend(c.s, c.rng, c.me, 'from your unit');
      return f ? `${f.firstName} became the friend you’d trust with anything.` : 'A good night, and a few good stories.';
    },
  },
  // ── Your own business ──
  {
    id: 'cash_crunch', ...W, cooldown: 5,
    candidates: (c) => (at(c, 'own') ? [{ weight: 0.5 }] : []),
    build: (c) => ({
      title: 'Cash-flow crunch',
      text: `A big client is paying late and payroll is due. You’re about ${'$' + local(c, 8000).toLocaleString()} short this month.`,
      choices: [
        { id: 'cover', label: 'Cover it from family savings', hint: 'Your employees get paid on time' },
        { id: 'cut', label: 'Cut hours for a few weeks', hint: 'Your staff won’t love it' },
        { id: 'chase', label: 'Chase the client hard', hint: 'Could lose them' },
      ],
    }),
    resolve: (c, ch) => {
      if (ch === 'cover') { charge(wallet(c), local(c, 8000)); perf(c.me, 4); return 'Payroll went out on time. The client paid six weeks later, and you paid yourself back.'; }
      if (ch === 'cut') { perf(c.me, -6); stat(c.me, 'stress', 4); return 'A lean month. Two employees started looking for other work.'; }
      if (c.rng.chance(0.6)) { stat(c.me, 'stress', 3); return 'They paid within the week, a little embarrassed.'; }
      perf(c.me, -8); stat(c.me, 'stress', 6);
      return 'They paid, and took their business elsewhere.';
    },
  },
  // ── The office ──
  {
    id: 'deadline_crunch', ...W, cooldown: 5,
    candidates: (c) => (at(c, 'office') ? [{ weight: 0.5 }] : []),
    build: () => ({
      title: 'Crunch time',
      text: 'A project is due Friday and it’s nowhere near done. The team is planning to work through the weekend.',
      choices: [{ id: 'all_in', label: 'Pull the all-nighters with them' }, { id: 'boundary', label: 'Do your part, then go home' }],
    }),
    resolve: (c, ch) => {
      if (ch === 'boundary') { stat(c.me, 'stress', 1); return 'You did your part. The project shipped a day late; nobody blamed you, quite.'; }
      perf(c.me, 7); stat(c.me, 'stress', 6);
      return 'It shipped on time. Pizza at 2 a.m. never tasted so good.';
    },
  },
];

