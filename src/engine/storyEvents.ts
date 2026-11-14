/**
 * Story follow-ups: events that only happen because of something recorded years earlier (see threads.ts).
 *
 * Every event here is eligible only while its thread is open and its conditions still hold, quotes only what the
 * thread recorded (years, hobbies, programs, places), and closes or marks its thread when resolved, so it can never
 * repeat or contradict itself. They are ordinary minor events marked `story`: at most one comes up a year, and they
 * share the yearly cap with everything else. None of them are only bad news: each offers a way to respond.
 */
import { grandchildrenOf, grandchildThread, noteGrandchild, yearsWith } from './grandchildren';
import { connectionOf } from './relationships';
import { carries, carryTradition, CARRY_TAKES, liveTraditions, MAX_TRADITIONS, REVIVE_YEARS, takes, TRADITION_NOUN, TRADITIONS } from './traditions';
import { HOBBY_BY_ID } from '../content/actions';
import { CAREER_BY_ID, PROGRAMS, requiredBlocks, salaryOf, titleOf } from '../content/careers';
import { playerStruggling } from './agency';
import { age, local, one, settledInJob, wallet, type Ctx, type EventDef } from './eventKit';
import { ASPIRATION_INFO } from './fulfillment';
import { cityName, cityOf, isNear } from './location';
import { charge, hasCash } from './money';
import { forget, harmFrom, harmText, remember, stableHash } from './relationships';
import { answersSince, closeThread, noteThread, openThread, threadsOf } from './threads';
import type { CityId } from '../content/cities';
import type { Person, Thread } from './types';
import { adjustBond, alive, childrenOf, getBond, journal, kidsAtHome, membersOf, money, parentsOf, partnerOf, stat } from './util';
import { canPromote } from './workEvents';

const they = (p: Person) => (p.sex === 'F' ? 'she' : 'he');
const them = (p: Person) => (p.sex === 'F' ? 'her' : 'him');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** "2031", "2031 and 2034", "2031, 2033 and 2035". */
export const yearList = (ys: number[]) => (ys.length <= 1 ? String(ys[0] ?? '') : `${ys.slice(0, -1).join(', ')} and ${ys[ys.length - 1]}`);
const hobbyName = (h: string) => (h === 'sports' ? 'sports' : HOBBY_BY_ID[h as keyof typeof HOBBY_BY_ID]?.label.toLowerCase() ?? h);
/** Not raised again within this many years of the last time. */
const RAISE_GAP = 5;
/** Distinct years of showing up, after the last hurt, that mend a strain (one apology is not enough). */
export const MEND_YEARS = 3;
const notRaised = (c: Ctx, t: Thread) => t.shown === undefined || c.s.year - t.shown >= RAISE_GAP;
const open = (c: Ctx, kind: Thread['kind']) => threadsOf(c.s, c.me.id, kind).filter((t) => t.closed === undefined);
const subjectOf = (c: Ctx, t: Thread) => (t.subjectId ? c.s.people[t.subjectId] : undefined);
/** The thread behind an event with a subject (or without one). */
const threadFor = (c: Ctx, kind: Thread['kind'], sub?: Person) => openThread(c.s, kind, c.me.id, sub?.id);

export const STORY_EVENTS: EventDef[] = [
  // ── Relationships: strain that builds, and showing up that mends it ──
  {
    id: 'growing_distance',
    major: false,
    story: true,
    cooldown: 2,
    candidates: (c) => open(c, 'strain').flatMap((t) => {
      const p = subjectOf(c, t);
      return one(!!p && alive(p) && t.hits.length >= 3 && answersSince(t) === 0 && c.s.year - t.hits[t.hits.length - 1] <= 2 && notRaised(c, t), 2, false, p);
    }),
    build: (c, p) => {
      const t = threadFor(c, 'strain', p)!;
      const harm = harmFrom(p!, c.me.id);
      return {
        title: `Drifting from ${p!.firstName}`,
        text: `${p!.firstName} has gone quiet around you. It isn’t one bad year anymore: ${yearList(t.hits.slice(-3))}.${harm ? ` ${cap(they(p!))} still remembers you ${harmText(harm)}.` : ''}`,
        choices: [
          { id: 'reach_out', label: 'Make real time for them this year', hint: 'Words help a little. Showing up, year after year, is what counts.' },
          { id: 'room', label: 'Give them some room', hint: 'Things may cool, but the pressure eases' },
        ],
      };
    },
    resolve: (c, ch, p) => {
      const t = threadFor(c, 'strain', p);
      if (t) t.shown = c.s.year;
      if (ch === 'room') {
        adjustBond(c.s, c.me.id, p!.id, -2, 0);
        if (t) closeThread(t, c.s.year, 'drifted');
        return `You stopped pushing. ${p!.firstName} seemed relieved, and a little further away.`;
      }
      adjustBond(c.s, c.me.id, p!.id, 3, 2);
      // A partner or a child at home holds you to it next year (kept or broken, and remembered either way).
      if (partnerOf(c.s, c.me.id)?.id === p!.id || (p!.householdId === c.me.householdId && kidsAtHome(c.s, c.me).some((k) => k.id === p!.id))) p!.flags.promised_time = c.s.year + 1;
      return `You told ${p!.firstName} you’d do better. ${cap(they(p!))} said ${they(p!)}’d believe it when ${they(p!)} saw it.`;
    },
  },
  {
    id: 'kept_showing_up',
    major: false,
    story: true,
    cooldown: 0,
    candidates: (c) => open(c, 'strain').flatMap((t) => {
      const p = subjectOf(c, t);
      return one(!!p && alive(p) && t.hits.length >= 2 && answersSince(t) >= MEND_YEARS, 3, false, p);
    }),
    build: (c, p) => {
      const t = threadFor(c, 'strain', p)!;
      return {
        title: `${p!.firstName} noticed`,
        text: `After ${yearList(t.hits.slice(-2))}, it would have been easy for you and ${p!.firstName} to drift apart. Instead you kept showing up: ${answersSince(t)} years of it now. ${cap(they(p!))} wants you to know it mattered.`,
        choices: [{ id: 'ok', label: 'It mattered to me too' }],
      };
    },
    resolve: (c, _ch, p) => {
      for (const k of ['missed', 'pressure', 'promise_broken'] as const) forget(p!, k, c.me.id);
      adjustBond(c.s, c.me.id, p!.id, 10, 10);
      remember(p!, 'support', c.me.id, c.s.year);
      const t = threadFor(c, 'strain', p);
      if (t) closeThread(t, c.s.year, 'reconciled');
      journal(c.s, `You and ${p!.firstName} found your way back to each other.`, 'good');
      return 'No big speech. Just a long hug, and the old ease coming back.';
    },
  },
  {
    // Someone you stood by stands by you (or by your heir, if you stood by them and are gone).
    id: 'gratitude',
    major: false,
    story: true,
    cooldown: 3,
    candidates: (c) => open(c, 'supported').flatMap((t) => {
      const p = subjectOf(c, t);
      const ok = !!p && alive(p) && age(c, p) >= 16 && c.s.year - t.since >= 3 && getBond(c.s, c.me.id, p.id).affinity >= 0
        && (!!playerStruggling(c.s, c.me) || t.hits.length >= 3 || !!t.inherited);
      return one(ok, 2, false, p);
    }),
    build: (c, p) => {
      const t = threadFor(c, 'supported', p)!;
      const prev = t.inherited ? c.s.people[t.inherited] : undefined;
      const hard = playerStruggling(c.s, c.me);
      return {
        title: `${p!.firstName} remembers`,
        text: prev
          ? `${p!.firstName} came by. “${prev.firstName} was there for me when I needed it, back in ${yearList(t.hits.slice(-2))}. I never got the chance to repay that. Let me be there for you.”`
          : `${p!.firstName} came by${hard ? ' when things were hard' : ''}. “You were there for me in ${yearList(t.hits.slice(-3))}. I haven’t forgotten.”`,
        choices: [{ id: 'ok', label: 'Thank them' }],
      };
    },
    resolve: (c, _ch, p) => {
      stat(c.me, 'stress', -6);
      stat(c.me, 'happiness', 4);
      adjustBond(c.s, c.me.id, p!.id, 6, 6);
      remember(c.me, 'support', p!.id, c.s.year);
      const t = threadFor(c, 'supported', p);
      if (t) closeThread(t, c.s.year, 'grateful');
      return `${p!.firstName} stayed for dinner and fixed the thing you’d been meaning to fix for months.`;
    },
  },

  // ── Family: a child's interest, a child pushed too hard, siblings grown up ──
  {
    id: 'encouragement_remembered',
    major: false,
    story: true,
    cooldown: 0,
    candidates: (c) => open(c, 'encouraged').flatMap((t) => {
      const k = subjectOf(c, t);
      return one(!!k && alive(k) && age(c, k) >= 18 && age(c, k) <= 40 && t.hits.length >= 3 && k.hobby === t.detail && (k.skills[k.hobby!] ?? 0) >= 40, 3, false, k);
    }),
    build: (c, k) => {
      const t = threadFor(c, 'encouraged', k)!;
      const h = hobbyName(t.detail!);
      const job = k!.jobId ? CAREER_BY_ID[k!.jobId] : undefined;
      const career = job?.skill === t.detail ? ` Now it’s ${k!.sex === 'F' ? 'her' : 'his'} job.` : '';
      return {
        title: `${k!.firstName} hasn’t forgotten`,
        text: `${k!.firstName} called about ${h}.${career} “When I wanted to get serious about ${h}, you backed me, year after year. I haven’t forgotten that.”`,
        choices: [{ id: 'ok', label: 'I’m proud of you' }],
      };
    },
    resolve: (c, _ch, k) => {
      adjustBond(c.s, c.me.id, k!.id, 6, 4);
      stat(k!, 'happiness', 3);
      stat(c.me, 'happiness', 4);
      const t = threadFor(c, 'encouraged', k);
      if (t) closeThread(t, c.s.year, 'thanked');
      return `You hung up smiling. Some of the best money and evenings you ever spent.`;
    },
  },
  {
    id: 'pushed_too_hard',
    major: false,
    story: true,
    cooldown: 3,
    candidates: (c) => open(c, 'pushed').flatMap((t) => {
      const k = subjectOf(c, t);
      return one(!!k && alive(k) && age(c, k) >= 18 && age(c, k) <= 35 && t.hits.length >= 3 && notRaised(c, t), 2, false, k);
    }),
    build: (c, k) => {
      const t = threadFor(c, 'pushed', k)!;
      return {
        title: `${k!.firstName} brings it up`,
        text: `Over dinner, ${k!.firstName} brings up the years you pushed ${them(k!)} (${yearList(t.hits.slice(-3))}). “I know you meant well. It didn’t feel like it then.”`,
        choices: [
          { id: 'apologize', label: 'You’re right. I’m sorry', hint: 'It costs you some pride' },
          { id: 'explain', label: 'I wanted the best for you', hint: 'They may understand, or not yet' },
        ],
      };
    },
    resolve: (c, ch, k) => {
      const t = threadFor(c, 'pushed', k);
      if (ch === 'apologize') {
        forget(k!, 'pressure', c.me.id);
        adjustBond(c.s, c.me.id, k!.id, 6, 6);
        if (t) closeThread(t, c.s.year, 'apologized');
        return `${k!.firstName} went quiet, then reached across the table for your hand.`;
      }
      const understands = k!.traits.includes('kind') || getBond(c.s, c.me.id, k!.id).affinity >= 20;
      if (understands) {
        adjustBond(c.s, c.me.id, k!.id, 2, 2);
        if (t) closeThread(t, c.s.year, 'understood');
        return `“I know,” ${k!.firstName} said. “I think I get it now.”`;
      }
      adjustBond(c.s, c.me.id, k!.id, -2, 0);
      if (t) closeThread(t, c.s.year, 'unresolved');
      return `${k!.firstName} changed the subject. Maybe another time.`;
    },
  },
  {
    id: 'siblings_grown',
    major: false,
    story: true,
    cooldown: 0,
    candidates: (c) => open(c, 'siblings').filter((t) => siblingsReady(c, t)).flatMap((t) => one(true, 2, false, subjectOf(c, t))),
    build: (c, a) => {
      const t = readySiblingsOf(c, a)!;
      const b = c.s.people[t.detail!];
      const close = getBond(c.s, a!.id, b.id).affinity;
      const clashes = t.answers?.length ?? 0;
      const bonded = t.hits.length - clashes;
      const past = clashes > bonded ? `spent their teens arguing` : `spent their teens ${a!.hobby && a!.hobby === b.hobby ? `doing ${hobbyName(a!.hobby)} together` : 'thick as thieves'}`;
      return {
        title: `${a!.firstName} and ${b.firstName}, grown up`,
        text: close >= 30
          ? `${a!.firstName} and ${b.firstName} ${past}. Now they’re both adults, and they still talk every week.`
          : `${a!.firstName} and ${b.firstName} ${past}. Now they’re both adults, and they barely talk.`,
        choices: close >= 30
          ? [{ id: 'ok', label: 'Some things last' }]
          : [
            { id: 'host', label: 'Have them both over for dinner', hint: 'It might help' },
            { id: 'let', label: 'Let them find their own way' },
          ],
      };
    },
    resolve: (c, ch, a) => {
      const t = readySiblingsOf(c, a);
      const b = t?.detail ? c.s.people[t.detail] : undefined;
      if (ch === 'host' && b) {
        adjustBond(c.s, a!.id, b.id, 8, 4);
        stat(c.me, 'happiness', 2);
        if (t) closeThread(t, c.s.year, 'mended');
        return 'It was awkward for an hour, then they started telling stories about you. It was worth it.';
      }
      if (t) closeThread(t, c.s.year, ch === 'ok' ? 'close' : 'apart');
      return ch === 'ok' ? 'You raised them to have each other. That part you got right.' : 'They’re adults now. It’s theirs to work out.';
    },
  },

  // ── Career: training that pays off later, a chance that comes back ──
  {
    id: 'training_pays_off',
    major: false,
    story: true,
    work: true,
    cooldown: 0,
    candidates: (c) => open(c, 'trained').flatMap((t) =>
      one(c.s.year - t.since >= 3 && settledInJob(c) && c.me.jobLevel < 3 && canPromote(c.me), 3)),
    build: (c) => {
      const t = open(c, 'trained')[0];
      const job = CAREER_BY_ID[c.me.jobId!];
      const lvl = c.me.jobLevel + 1;
      return {
        title: 'That credential paid off',
        text: `The ${PROGRAMS[t.detail as keyof typeof PROGRAMS]?.short.toLowerCase() ?? 'training'} you earned in ${t.since} caught someone’s eye: you’re offered the ${titleOf(job, lvl)} role (${money(salaryOf(job, lvl))}, ${requiredBlocks(job, lvl)} blocks a year).`,
        choices: [
          { id: 'accept', label: 'Take it', hint: 'More money, more of your time' },
          { id: 'decline', label: 'Not now', hint: 'Keep your current balance' },
        ],
      };
    },
    resolve: (c, ch) => {
      const t = open(c, 'trained')[0];
      if (ch === 'accept') {
        c.me.jobLevel++;
        c.me.jobYears = 0;
        c.me.workPerf = 55;
        stat(c.me, 'happiness', 5);
        if (t) closeThread(t, c.s.year, 'paid_off');
        return 'All those nights of study, cashed in at last.';
      }
      if (t) closeThread(t, c.s.year, 'declined');
      noteThread(c.s, 'missed_chance', c.me, undefined, { detail: `${c.me.jobId}:${c.me.jobLevel}` });
      return 'You said no. The certificate stays on the wall, and you go home on time.';
    },
  },
  {
    // Only some missed chances ever come back (a stable coin flip), and only while they still make sense.
    id: 'second_chance',
    major: false,
    story: true,
    work: true,
    cooldown: 0,
    candidates: (c) => open(c, 'missed_chance').flatMap((t) =>
      one(c.s.year - t.since >= 4 && t.detail === `${c.me.jobId}:${c.me.jobLevel}` && settledInJob(c) && c.me.jobLevel < 3 && canPromote(c.me)
        && stableHash(`${c.s.seed}:${t.ownerId}:${t.since}:second`) % 2 === 0, 2)),
    build: (c) => {
      const t = open(c, 'missed_chance')[0];
      const job = CAREER_BY_ID[c.me.jobId!];
      return {
        title: 'A second chance',
        text: `Back in ${t.since} you turned down a step up. Your old manager remembers, and now runs a team across town: they want you as ${titleOf(job, c.me.jobLevel + 1)} (${money(salaryOf(job, c.me.jobLevel + 1))}).`,
        choices: [
          { id: 'accept', label: 'This time, yes', hint: 'A new employer and more responsibility' },
          { id: 'decline', label: 'I’m happy where I am' },
        ],
      };
    },
    resolve: (c, ch) => {
      const t = open(c, 'missed_chance')[0];
      if (ch === 'accept') {
        c.me.jobLevel++;
        c.me.jobYears = 0;
        c.me.workPerf = 55;
        c.me.flags.hired_year = c.s.year;
        if (t) closeThread(t, c.s.year, 'took_it');
        journal(c.s, `Years after turning it down, you took the step up after all.`, 'good');
        return 'New badge, new desk, the same you, a little braver.';
      }
      stat(c.me, 'happiness', 2);
      if (t) closeThread(t, c.s.year, 'content');
      return 'You thanked them and meant it. You’ve built the life you wanted.';
    },
  },

  // ── Aspiration: years of a life going where you wanted ──
  {
    id: 'aspiration_milestone',
    major: false,
    story: true,
    cooldown: 0,
    candidates: (c) => open(c, 'aspiration').flatMap((t) => one(t.detail === c.me.aspiration && t.hits.length >= 7, 3)),
    build: (c) => {
      const t = open(c, 'aspiration')[0];
      return {
        title: `${ASPIRATION_INFO[c.me.aspiration!].icon} Looking where you wanted to go`,
        text: `Since ${t.hits[0]}, nearly every year has felt like your life was heading where you wanted: ${ASPIRATION_INFO[c.me.aspiration!].label.toLowerCase()}.${milestoneFact(c)}`,
        choices: [{ id: 'ok', label: 'Take a moment to be proud' }],
      };
    },
    resolve: (c) => {
      const t = open(c, 'aspiration')[0];
      stat(c.me, 'happiness', 6);
      c.me.fulfillment = Math.min(100, (c.me.fulfillment ?? 50) + 3);
      if (t) closeThread(t, c.s.year, 'milestone');
      journal(c.s, `A milestone: years of a life lived for ${ASPIRATION_INFO[c.me.aspiration!].label.toLowerCase()}.`, 'major');
      return 'You don’t feel finished. You feel on your way.';
    },
  },

  // ── Family traditions (traditions.ts) ──
  {
    // Someone who came every year died last year.
    id: 'first_without_them',
    major: false,
    story: true,
    cooldown: 0,
    candidates: (c) => one(!!emptyChair(c), 3),
    build: (c) => {
      const { t, gone } = emptyChair(c)!;
      return {
        title: `The first ${TRADITION_NOUN[t.detail!].replace(/^the /, '')} without ${gone.firstName}`,
        text: `${gone.firstName} came to ${TRADITION_NOUN[t.detail!]} ${takes(t, gone.id)} times. This year there’s an empty chair.`,
        choices: [
          { id: 'keep', label: `Keep it, for ${gone.firstName}`, hint: 'Everyone together, with someone missing' },
          { id: 'skip', label: 'Not this year', hint: 'It can wait a year' },
        ],
      };
    },
    resolve: (c, ch) => {
      const chair = emptyChair(c);
      if (chair) chair.t.shown = c.s.year;
      if (ch === 'skip') return 'You let it rest this year. Nobody minded.';
      for (const p of membersOf(c.s, c.me.householdId)) if (p.id !== c.me.id) adjustBond(c.s, c.me.id, p.id, 3, 2);
      stat(c.me, 'stress', -4);
      return chair ? `Someone told the story ${chair.gone.firstName} always told. Everyone laughed, then cried, then laughed again.` : 'You kept it, and it helped.';
    },
  },
  {
    // Getting older, with a grown child nearby who grew up with it.
    id: 'passing_torch',
    major: false,
    story: true,
    cooldown: 0,
    candidates: (c) => { const x = torch(c); return one(!!x, 2, false, x?.child); },
    build: (c, k) => {
      const { t } = torch(c, k)!;
      return {
        title: 'Passing the torch',
        text: `${k!.firstName} offered to host ${TRADITION_NOUN[t.detail!]} from now on. “You’ve done it for ${t.count} years. Let me.”`,
        choices: [
          { id: 'hand', label: `Let ${k!.firstName} host it`, hint: 'You still come; it carries on in their home' },
          { id: 'keep', label: 'Not yet, I love hosting' },
        ],
      };
    },
    resolve: (c, ch, k) => {
      const x = torch(c, k);
      if (x) x.t.shown = c.s.year;
      if (ch === 'keep') return `${k!.firstName} smiled. “Next year, then.”`;
      if (x) carryTradition(c.s, c.me, k!, x.t.detail!, false);
      adjustBond(c.s, c.me.id, k!.id, 5, 3);
      stat(c.me, 'stress', -5);
      return `You brought dessert to ${k!.firstName}’s this year and didn’t wash a single dish.`;
    },
  },
  {
    // A teenager who grew up with it would rather skip it.
    id: 'too_old_for_this',
    major: false,
    story: true,
    cooldown: 3,
    candidates: (c) => liveTraditions(c.s, c.me.id).filter((t) => (t.count ?? 0) >= 3 && notRaised(c, t)).flatMap((t) =>
      kidsAtHome(c.s, c.me).filter((k) => age(c, k) >= 15 && age(c, k) <= 17 && takes(t, k.id) >= 2)
        .map((k) => ({ subject: k, weight: 1 + (connectionOf(k) === 'space' ? 1 : 0) + (k.flags.independent ? 1 : 0), urgent: false }))),
    build: (c, k) => {
      const t = teenTradition(c, k!)!;
      return {
        title: 'Too old for this?',
        text: `${k!.firstName} wants to skip ${TRADITION_NOUN[t.detail!]} this year. “It’s kind of a kid thing.”`,
        choices: [
          { id: 'skip', label: 'Let them skip it', hint: 'Room to grow up' },
          { id: 'friend', label: 'Tell them to bring a friend', hint: 'A compromise' },
          { id: 'insist', label: 'Insist: it’s a family thing', hint: 'Some teens push back' },
        ],
      };
    },
    resolve: (c, ch, k) => {
      const t = teenTradition(c, k!);
      if (t) t.shown = c.s.year;
      if (ch === 'skip') { stat(k!, 'happiness', 2); return `${k!.firstName} went to a friend’s. They came home early and caught the end of it.`; }
      if (ch === 'friend') { stat(k!, 'happiness', 3); adjustBond(c.s, c.me.id, k!.id, 2, 1); return `${k!.firstName}’s friend loved it. Now they both want to come next year.`; }
      adjustBond(c.s, c.me.id, k!.id, -3, -1);
      if (k!.traits.includes('stubborn')) remember(k!, 'pressure', c.me.id, c.s.year);
      return `${k!.firstName} came, and sulked for an hour, and then forgot to sulk.`;
    },
  },
  {
    // A tradition that faded, and a reason to bring it back: a new grandchild or a family reunion.
    id: 'bring_it_back',
    major: false,
    story: true,
    cooldown: 0,
    candidates: (c) => one(!!revivable(c), 2),
    build: (c) => {
      const { t, why } = revivable(c)!;
      return {
        title: 'Bring it back?',
        text: `${TRADITIONS[t.detail!]} faded in ${t.closed}. With ${why}, maybe it’s time to bring it back.`,
        choices: [
          { id: 'revive', label: 'Bring it back', hint: 'Do it this year or next to keep it going' },
          { id: 'rest', label: 'Let it rest' },
        ],
      };
    },
    resolve: (c, ch) => {
      const x = revivable(c);
      if (!x) return 'The moment passed.';
      x.t.shown = c.s.year;
      if (ch === 'rest') return 'Some things belong to their time.';
      delete x.t.closed;
      delete x.t.outcome;
      x.t.answers = [...(x.t.answers ?? []), c.s.year];
      return 'You dug the old things out of the closet. Next time, everyone’s coming.';
    },
  },

  // ── Grandchildren (grandchildren.ts) ──
  {
    // A grandchild you taught shows what they learned.
    id: 'what_you_taught',
    major: false,
    story: true,
    cooldown: 0,
    candidates: (c) => (c.s.threads ?? []).filter((t) => t.kind === 'grandchild' && t.ownerId === c.me.id && t.closed === undefined && !!t.detail && t.hits.length >= 3).flatMap((t) => {
      const g = subjectOf(c, t);
      return one(!!g && alive(g) && age(c, g) >= 16 && age(c, g) <= 30 && (g.skills[t.detail as keyof typeof g.skills] ?? 0) >= 30 && g.flags.taught_noted === undefined, 3, false, g);
    }),
    build: (c, g) => {
      const t = grandchildThread(c.s, c.me, g!)!;
      const [did, keepsake] = TAUGHT[t.detail!] ?? [`has gotten seriously good at ${hobbyName(t.detail!)}`, 'still tells people who taught them'];
      return {
        title: 'What you taught them',
        text: `${g!.firstName} ${did}. ${cap(they(g!))} ${keepsake}.`,
        choices: [{ id: 'ok', label: 'That makes my year' }],
      };
    },
    resolve: (c, _ch, g) => {
      g!.flags.taught_noted = c.s.year;
      adjustBond(c.s, c.me.id, g!.id, 4, 2);
      stat(c.me, 'happiness', 4);
      return `You told the story of the first time you showed ${them(g!)}, and ${g!.firstName} rolled ${g!.sex === 'F' ? 'her' : 'his'} eyes and smiled.`;
    },
  },
  {
    // A grandchild you spent years with turns 18.
    id: 'grandchild_turns_18',
    major: false,
    story: true,
    cooldown: 0,
    candidates: (c) => grandchildrenOf(c.s, c.me).filter((g) => age(c, g) === 18 && yearsWith(c.s, c.me, g) >= 5 && g.flags.gp18_noted === undefined).map((g) => ({ subject: g, weight: 3, urgent: false })),
    build: (c, g) => {
      const gift = grandchildGift(c);
      return {
        title: `${g!.firstName} turns 18`,
        text: `${g!.firstName} is grown. You spent time together in ${yearsWith(c.s, c.me, g!)} of the years since ${grandchildThread(c.s, c.me, g!)!.since}.`,
        choices: [
          { id: 'gift', label: `A gift toward their future (${money(gift)})`, hint: 'From your household, into their savings', disabled: !hasCash(wallet(c), gift) },
          { id: 'letter', label: 'Write them a letter' },
          { id: 'there', label: 'Just be there for the party' },
        ],
      };
    },
    resolve: (c, ch, g) => {
      g!.flags.gp18_noted = c.s.year;
      if (ch === 'gift') {
        const gift = grandchildGift(c);
        charge(wallet(c), gift);
        g!.fund += gift;
        adjustBond(c.s, c.me.id, g!.id, 4, 3);
        return `${g!.firstName} hugged you for a long time and promised to spend it on something boring and sensible.`;
      }
      if (ch === 'letter') {
        adjustBond(c.s, c.me.id, g!.id, 5, 4);
        stat(g!, 'happiness', 3);
        return `Two pages, in your best handwriting. ${g!.firstName} says it's going in a frame.`;
      }
      adjustBond(c.s, c.me.id, g!.id, 3, 2);
      return `You stayed until the cake was gone and ${g!.firstName}'s friends started calling you by your first name.`;
    },
  },
  {
    // A far-away grandchild you've barely seen: asked once, never again.
    id: 'barely_know_them',
    major: false,
    story: true,
    cooldown: 5, // each grandchild once, and not one after another
    candidates: (c) => (age(c, c.me) < 85 && c.me.stats.health >= 50 ? grandchildrenOf(c.s, c.me) : [])
      .filter((g) => age(c, g) >= 6 && age(c, g) <= 17 && g.householdId !== c.me.householdId && !isNear(c.s, g) && yearsWith(c.s, c.me, g) === 0 && g.flags.gp_seen === undefined && g.flags.nudged === undefined)
      .map((g) => ({ subject: g, weight: 1, urgent: false })),
    build: (c, g) => {
      const cost = local(c, 1200);
      return {
        title: `${g!.firstName}, far away`,
        text: `You’ve barely met ${g!.firstName}, who’s ${age(c, g!)} now and lives in ${cityName(cityOf(c.s, g!))}.`,
        choices: [
          { id: 'fly', label: `Fly out for a week (${money(cost)})`, disabled: !hasCash(wallet(c), cost) },
          { id: 'call', label: 'Call on their birthday from now on' },
          { id: 'later', label: 'Not now' },
        ],
      };
    },
    resolve: (c, ch, g) => {
      g!.flags.nudged = c.s.year;
      if (ch === 'fly') {
        charge(wallet(c), local(c, 1200));
        adjustBond(c.s, c.me.id, g!.id, 8, 4);
        noteGrandchild(c.s, c.me, g!);
        return `${g!.firstName} was shy for a day, then showed you everything: the school, the park, the best taco place.`;
      }
      if (ch === 'call') {
        g!.flags.birthday_calls = c.s.year;
        adjustBond(c.s, c.me.id, g!.id, 2, 1);
        return `You put ${g!.firstName}'s birthday in your calendar, in red.`;
      }
      return 'Maybe another year.';
    },
  },

  // ── Life transitions: a parent left behind (retirement: aspirationEvents retirement_purpose reads its thread) ──
  {
    id: 'hometown_pull',
    major: false,
    story: true,
    cooldown: 0,
    candidates: (c) => open(c, 'moved').flatMap((t) => {
      const parent = parentsOf(c.s, c.me).find((p) => alive(p) && cityOf(c.s, p) === t.detail && (age(c, p) >= 72 || p.stats.health < 50));
      return one(c.s.year - t.since >= 3 && !!parent, 2, false, parent);
    }),
    build: (c, p) => {
      const t = open(c, 'moved')[0];
      const cost = local(c, 1200);
      return {
        title: `${p!.firstName}, back in ${cityName(t.detail as CityId)}`,
        text: `You’ve lived away since ${t.since}. ${p!.firstName} is getting older back in ${cityName(t.detail as CityId)}, and the calls have gotten shorter.`,
        choices: [
          { id: 'visit', label: `Fly back for a week (${money(cost)})`, disabled: !hasCash(wallet(c), cost) },
          { id: 'call', label: 'Call every Sunday from now on' },
        ],
      };
    },
    resolve: (c, ch, p) => {
      const t = open(c, 'moved')[0];
      if (ch === 'visit') {
        charge(wallet(c), local(c, 1200));
        adjustBond(c.s, c.me.id, p!.id, 6, 3);
        stat(c.me, 'happiness', 3);
        if (t) closeThread(t, c.s.year, 'visited');
        return `${p!.firstName} had the guest room ready a week early.`;
      }
      adjustBond(c.s, c.me.id, p!.id, 2, 2);
      if (t) closeThread(t, c.s.year, 'called');
      return 'Sunday calls it is. Some weeks they run an hour.';
    },
  },
];

/** What a grandchild did with the craft you taught, and the keepsake (by hobby). */
const TAUGHT: Record<string, [string, string]> = {
  woodworking: ['entered a first piece of furniture in the county fair', 'still uses your old chisels'],
  gardening: ['planted a whole garden this spring', 'still asks you when to put the tomatoes in'],
  cooking: ['cooked dinner for the whole family last weekend', 'still makes your recipe, exactly your way'],
  music: ['played a real show, to a real crowd', 'still warms up the way you showed them'],
  fishing: ['caught a fish bigger than any of yours', 'still carries the lure you gave them'],
  mechanics: ['rebuilt an engine on their own', 'still keeps your old wrench set in the trunk'],
  art: ['had a piece hung in a real gallery', 'still signs their work the way you did'],
  sports: ['made the varsity team', 'still does the warm-up you taught them'],
  flying: ['soloed for the first time', 'still flies with your old headset'],
};
/** A gift that scales with what your household has (1% of savings and investments, $500 to $25,000). */
function grandchildGift(c: Ctx): number {
  const hh = wallet(c);
  const worth = Math.max(0, hh.wallet) + (hh.investments ?? 0);
  return Math.max(500, Math.min(25_000, Math.round((worth * 0.01) / 50) * 50));
}

/** A live tradition whose regular (CARRY_TAKES+ times) died last year, not yet marked. */
function emptyChair(c: Ctx): { t: Thread; gone: Person } | undefined {
  for (const t of liveTraditions(c.s, c.me.id)) {
    if (t.shown === c.s.year) continue;
    const gone = Object.keys(t.takers ?? {}).map((id) => c.s.people[id]).find((p) => p && p.id !== c.me.id && p.deathYear === c.s.year - 1 && takes(t, p.id) >= CARRY_TAKES);
    if (gone) return { t, gone };
  }
  return undefined;
}
/** Getting older (65+ or unwell) with a grown child nearby who could carry a tradition on. */
function torch(c: Ctx, only?: Person): { t: Thread; child: Person } | undefined {
  if (age(c, c.me) < 65 && c.me.stats.health >= 50) return undefined;
  for (const t of liveTraditions(c.s, c.me.id).filter((x) => notRaised(c, x))) {
    const child = childrenOf(c.s, c.me.id).find((k) => (!only || k.id === only.id) && alive(k) && age(c, k) >= 25 && k.householdId !== c.me.householdId
      && isNear(c.s, k) && takes(t, k.id) >= CARRY_TAKES && !carries(c.s, c.me.id, k.id, t.detail!));
    if (child) return { t, child };
  }
  return undefined;
}
const teenTradition = (c: Ctx, k: Person) => liveTraditions(c.s, c.me.id).find((t) => (t.count ?? 0) >= 3 && takes(t, k.id) >= 2 && (notRaised(c, t) || t.shown === c.s.year));
/** A tradition that lapsed in the last REVIVE_YEARS, with a new grandchild born or a reunion held this year. */
function revivable(c: Ctx): { t: Thread; why: string } | undefined {
  if (liveTraditions(c.s, c.me.id).length >= MAX_TRADITIONS) return undefined;
  const baby = childrenOf(c.s, c.me.id).flatMap((k) => childrenOf(c.s, k.id)).find((g) => g.birthYear === c.s.year);
  const reunion = (c.s.activityLog ?? []).some((x) => x.year === c.s.year && x.id === 'family_reunion');
  if (!baby && !reunion) return undefined;
  const t = threadsOf(c.s, c.me.id, 'tradition').find((x) => x.outcome === 'lapsed' && c.s.year - x.closed! <= REVIVE_YEARS && notRaised(c, x));
  return t ? { t, why: baby ? `${baby.firstName} just born` : 'the whole family together at the reunion' } : undefined;
}

/** Two of your children, both grown, with a few years of shared history recorded. */
function siblingsReady(c: Ctx, t: Thread) {
  const a = subjectOf(c, t);
  const b = t.detail ? c.s.people[t.detail] : undefined;
  return !!a && !!b && alive(a) && alive(b) && age(c, a) >= 18 && age(c, b) >= 18 && t.hits.length >= 2;
}
const readySiblingsOf = (c: Ctx, a?: Person) => open(c, 'siblings').find((t) => t.subjectId === a?.id && siblingsReady(c, t));

/** One true thing that shows the aspiration was served (never invented: only what the state shows). */
function milestoneFact(c: Ctx): string {
  const me = c.me;
  switch (me.aspiration) {
    case 'mastery': {
      const [skill, lvl] = Object.entries(me.skills).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0] ?? [];
      return skill && (lvl ?? 0) >= 50 ? ` Your ${hobbyName(skill)} is something people ask you about now.` : '';
    }
    case 'achievement':
      return me.jobId ? ` You’re a ${titleOf(CAREER_BY_ID[me.jobId], me.jobLevel).toLowerCase()} now.` : '';
    case 'connection': {
      const close = Object.values(c.s.people).filter((p) => p.id !== me.id && alive(p) && getBond(c.s, me.id, p.id).affinity >= 60).length;
      return close >= 2 ? ` ${close} people would drop everything for you, and you for them.` : '';
    }
    default:
      return '';
  }
}

/** For checks in other modules: is this event a story follow-up. */
export const STORY_IDS = new Set(STORY_EVENTS.map((e) => e.id));
