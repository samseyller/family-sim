/**
 * Choosing what you want from life, and noticing when something's missing. Low fulfillment opens choices; it is
 * never a spiral: refocusing, talking it over, or choosing a new aspiration (with a grace period) all help.
 */
import { local, type EventDef } from './eventKit';
import { ASPIRATION_INFO, ASPIRATIONS, aspirationOf, REFLECT_REASONS, setAspiration, suggestAspiration } from './fulfillment';
import { charge, hasCash } from './money';
import type { Aspiration, Person } from './types';
import { adjustBond, ageOf, alive, childrenOf, flag, getBond, journal, kidsAtHome, partnerOf, stat } from './util';

const label = (a: Aspiration) => ASPIRATION_INFO[a].label.toLowerCase();
const grandkidsAndKids = (s: Parameters<typeof childrenOf>[0], p: Person) => [...childrenOf(s, p.id), ...childrenOf(s, p.id).flatMap((k) => childrenOf(s, k.id))].filter(alive);

/** Years after choosing a new aspiration during which a weak year can't lower fulfillment. */
export const ASPIRATION_GRACE = 2;
/** Fulfillment below this (for a while) brings up "something's missing". */
export const LOW_FULFILLMENT = 32;

export const ASPIRATION_EVENTS: EventDef[] = [
  {
    // Scheduled when the active character is an adult without an aspiration (coming of age, an heir, an older save).
    id: 'choose_aspiration',
    stage: 'any',
    major: false,
    cooldown: 0,
    build: (c) => {
      const current = c.me.aspiration;
      const suggested = current ? undefined : suggestAspiration(c.me);
      const order = [...(suggested ? [suggested] : []), ...ASPIRATIONS.filter((a) => a !== suggested)];
      return {
        title: current ? 'A new direction' : 'What do you want from life?',
        text: current
          ? `For years you’ve aimed for ${ASPIRATION_INFO[current].label.toLowerCase()}. Is that still what matters most?`
          : 'Looking ahead, what would make your life feel well spent? (You can change your mind later.)',
        choices: order.map((a) => ({
          id: a,
          label: `${ASPIRATION_INFO[a].icon} ${ASPIRATION_INFO[a].label}${a === suggested ? ' (suggested)' : a === current ? ' (keep it)' : ''}`,
          hint: ASPIRATION_INFO[a].desc,
        })),
      };
    },
    resolve: (c, ch) => {
      const a = ch as Aspiration;
      const changed = !!c.me.aspiration && c.me.aspiration !== a;
      setAspiration(c.me, a, c.s.year, ASPIRATION_GRACE);
      journal(c.s, `${changed ? 'A new direction' : 'You set your sights on'}: ${ASPIRATION_INFO[a].label.toLowerCase()}.`, 'info');
      return changed
        ? `${ASPIRATION_INFO[a].desc} A change of course isn’t a failure; you’re giving yourself time to settle in.`
        : `${ASPIRATION_INFO[a].desc} Fulfillment grows when your years serve it.`;
    },
  },
  {
    id: 'something_missing',
    major: false,
    cooldown: 4,
    candidates: (c) => (ageOf(c.me, c.s.year) >= 20 && (c.me.fulfillment ?? 50) < LOW_FULFILLMENT ? [{ weight: 1.5 }] : []),
    build: (c) => {
      const a = ASPIRATION_INFO[aspirationOf(c.me)];
      return {
        title: 'Something’s missing',
        text: `Lately the years blur together. You wanted ${a.label.toLowerCase()} from life, and it hasn’t been happening.`,
        choices: [
          { id: 'refocus', label: 'Make room for what matters next year', hint: a.desc },
          { id: 'talk', label: 'Talk it over with someone close' },
          { id: 'change', label: 'Maybe you want something different now', hint: 'Choose a new aspiration, with time to settle in' },
          { id: 'accept', label: 'It’s just a phase' },
        ],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'refocus') { c.me.flags.refocus_year = c.s.year + 1; return 'You wrote down what you want next year to look like. Now plan for it.'; }
      if (ch === 'talk') {
        const p = partnerOf(c.s, c.me.id);
        if (p) adjustBond(c.s, c.me.id, p.id, 4, 4);
        c.me.fulfillment = Math.min(100, (c.me.fulfillment ?? 50) + 5);
        return p ? `${p.firstName} listened, and had a few good ideas. You feel less alone in it.` : 'An old friend listened for an hour. It helped more than you expected.';
      }
      if (ch === 'change') {
        c.s.scheduled.push({ dueYear: c.s.year + 1, eventId: 'choose_aspiration', subjectId: c.me.id });
        return 'You’ll think about what you really want. (You’ll choose next year.)';
      }
      stat(c.me, 'stress', -2);
      return 'You decided not to dwell on it.';
    },
  },
  {
    id: 'aspiration_reflection',
    stage: 'any',
    major: false,
    cooldown: 0,
    build: (c) => {
      const reason = REFLECT_REASONS[c.me.flags.reflect_reason ?? 4];
      const suggest = (c.me.flags.reflect_suggest ?? -1) >= 0 ? ASPIRATIONS[c.me.flags.reflect_suggest!] : undefined;
      const now = aspirationOf(c.me);
      const why = {
        parenthood: 'A new baby has turned everything upside down.',
        loss: 'Losing someone close has you thinking about what really matters.',
        move: 'A new city, a fresh start: it’s a natural time to take stock.',
        plateau: 'Ten years in the same job. You’ve done well, and you wonder what’s next.',
        drift: `For a few years now, your time has gone to ${suggest ? label(suggest) : 'something else'} more than ${label(now)}.`,
      }[reason];
      return {
        title: 'Taking stock',
        text: `${why} You set out wanting ${label(now)}. Is that still it?`,
        choices: [
          { id: 'keep', label: `${ASPIRATION_INFO[now].icon} Yes: ${ASPIRATION_INFO[now].label} still matters most` },
          { id: 'adapt', label: 'Keep it, but go about it differently', hint: 'A fresh start toward it next year' },
          ...(suggest ? [{ id: `to:${suggest}`, label: `${ASPIRATION_INFO[suggest].icon} Now it’s ${label(suggest)}`, hint: ASPIRATION_INFO[suggest].desc }] : []),
          { id: 'other', label: 'Something else entirely', hint: 'Choose next year, with time to settle in' },
        ],
      };
    },
    resolve: (c, ch) => {
      if (ch === 'keep') { stat(c.me, 'stress', -2); return 'Some things don’t change. That’s a comfort.'; }
      if (ch === 'adapt') { c.me.flags.refocus_year = c.s.year + 1; return 'Same destination, a new route. You’ll plan next year around it.'; }
      if (ch === 'other') { c.s.scheduled.push({ dueYear: c.s.year + 1, eventId: 'choose_aspiration', subjectId: c.me.id }); return 'You’ll give it some thought.'; }
      const a = ch.slice(3) as Aspiration;
      const from = aspirationOf(c.me);
      setAspiration(c.me, a, c.s.year, ASPIRATION_GRACE);
      journal(c.s, `You used to want ${label(from)} most; now it’s ${label(a)}.`, 'major');
      return 'Admitting it felt like setting something heavy down. Everything you learned along the way comes with you.';
    },
  },
  {
    id: 'work_family_crossroads',
    major: true,
    cooldown: 0,
    candidates: (c) => {
      const young = kidsAtHome(c.s, c.me).filter((k) => ageOf(k, c.s.year) < 12);
      const driven = aspirationOf(c.me) === 'achievement' || c.me.traits.includes('ambitious');
      return driven && young.length && c.me.jobId && (c.s.plan.alloc.work ?? 0) >= 6 && !c.me.flags.crossroads ? [{ weight: 2 }] : [];
    },
    build: (c) => ({
      title: 'A crossroads',
      text: 'A big promotion is in reach if you keep up the pace. Your kids are growing up fast, and you miss bedtime most nights.',
      choices: [
        { id: 'push', label: 'Go for it: this is the moment', hint: 'Career first for a few years' },
        { id: 'scale', label: 'Step back while they’re small', hint: 'Family first for a few years' },
        { id: 'help', label: `Get help at home so you can do both (${'$' + local(c, 6000).toLocaleString()})`, disabled: !hasCash(c.s.households[c.me.householdId], local(c, 6000)) },
      ],
    }),
    resolve: (c, ch) => {
      flag(c.me, 'crossroads');
      c.s.scheduled.push({ dueYear: c.s.year + 3, eventId: 'crossroads_followup', subjectId: c.me.id });
      if (ch === 'push') { c.me.workPerf = Math.min(100, c.me.workPerf + 10); stat(c.me, 'stress', 4); return 'You leaned in. The next few years will tell what it cost.'; }
      if (ch === 'help') { charge(c.s.households[c.me.householdId], local(c, 6000)); stat(c.me, 'stress', -4); return 'A nanny two days a week. You still make it to bedtime, most nights.'; }
      c.me.workPerf = Math.max(0, c.me.workPerf - 8);
      for (const k of kidsAtHome(c.s, c.me)) adjustBond(c.s, c.me.id, k.id, 4, 3);
      return 'You told your boss you’d be leaving at five. The kids noticed right away.';
    },
  },
  {
    id: 'crossroads_followup',
    major: false,
    cooldown: 0,
    build: (c) => {
      const kids = kidsAtHome(c.s, c.me);
      const close = kids.length ? kids.reduce((n, k) => n + getBond(c.s, c.me.id, k.id).affinity, 0) / kids.length : 50;
      return {
        title: 'Looking back',
        text: close >= 40 ? 'Three years on from that crossroads, the kids still race to the door when you get home.' : 'Three years on from that crossroads, the kids have their own lives, and you’re not always in them.',
        choices: [{ id: 'ok', label: close >= 40 ? 'It was the right call' : 'There’s still time to change that' }],
      };
    },
    resolve: (c) => {
      c.me.flags.crossroads = 2;
      const kids = kidsAtHome(c.s, c.me);
      const close = kids.length ? kids.reduce((n, k) => n + getBond(c.s, c.me.id, k.id).affinity, 0) / kids.length : 50;
      if (close >= 40) { stat(c.me, 'happiness', 4); return 'Whatever the career brought, this part you got right.'; }
      stat(c.me, 'stress', 3);
      return 'It’s not too late. Time together this year would be a start.';
    },
  },
  {
    id: 'creative_crossroads',
    major: false,
    cooldown: 0,
    candidates: (c) => {
      if (ageOf(c.me, c.s.year) < 30) return [];
      const kid = kidsAtHome(c.s, c.me).find((k) => { const a = ageOf(k, c.s.year); return a >= 15 && a <= 17 && !k.flags.creative_path && (k.traits.includes('creative') || (!!k.hobby && ['art', 'music'].includes(k.hobby) && (k.skills[k.hobby] ?? 0) >= 25)); });
      return kid ? [{ weight: 1.2, subject: kid }] : [];
    },
    build: (_c, k) => ({
      title: `${k!.firstName}’s big question`,
      text: `${k!.firstName} lives for ${k!.hobby ? k!.hobby : 'making things'}, but everyone keeps saying to pick something practical. ${k!.firstName} asks what you think.`,
      choices: [
        { id: 'craft', label: 'Follow your passion', hint: 'More practice, a craft-first path' },
        { id: 'practical', label: 'Something steady first; your art on the side', hint: 'Security first' },
        { id: 'decide', label: 'It’s your call, and I’ll back you', hint: 'They decide' },
      ],
    }),
    resolve: (c, ch, k) => {
      flag(k!, 'creative_path');
      if (ch === 'craft') { setAspiration(k!, 'mastery', c.s.year); if (k!.hobby) k!.skills[k!.hobby] = Math.min(100, (k!.skills[k!.hobby] ?? 0) + 6); adjustBond(c.s, c.me.id, k!.id, 6, 4); return `${k!.firstName} practically glowed. The practice hours doubled overnight.`; }
      if (ch === 'practical') { setAspiration(k!, 'security', c.s.year); adjustBond(c.s, c.me.id, k!.id, k!.traits.includes('stubborn') ? -5 : 0, 2); return `${k!.firstName} nodded slowly. ${k!.traits.includes('stubborn') ? 'You could tell it stung.' : 'Maybe it’s the sensible thing.'}`; }
      adjustBond(c.s, c.me.id, k!.id, 5, 6);
      return `${k!.firstName} hugged you. Whatever ${k!.sex === 'F' ? 'she' : 'he'} chooses, ${k!.sex === 'F' ? 'she' : 'he'}’ll know you meant it.`;
    },
  },
  {
    id: 'retirement_purpose',
    major: false,
    cooldown: 0,
    candidates: (c) => (c.me.retired && !c.me.flags.purpose_found && c.s.year - (c.me.flags.retired_year ?? c.s.year) >= 1 && (c.me.fulfillment ?? 50) < 55 ? [{ weight: 1.5 }] : []),
    build: () => ({
      title: 'What now?',
      text: 'Retirement was supposed to feel like freedom. Some days it just feels long.',
      choices: [
        { id: 'service', label: '🤝 Give back: volunteer, mentor, help out', hint: 'Service' },
        { id: 'mastery', label: '🎯 Finally get good at something', hint: 'Mastery' },
        { id: 'connection', label: '💞 Be there for family: kids and grandkids', hint: 'Connection' },
      ],
    }),
    resolve: (c, ch) => {
      flag(c.me, 'purpose_found');
      setAspiration(c.me, ch as Aspiration, c.s.year);
      if (ch === 'mastery' && c.me.hobby) c.me.skills[c.me.hobby] = Math.min(100, (c.me.skills[c.me.hobby] ?? 0) + 5);
      if (ch === 'connection') for (const k of grandkidsAndKids(c.s, c.me)) adjustBond(c.s, c.me.id, k.id, 5, 3);
      if (ch === 'service') stat(c.me, 'happiness', 4);
      journal(c.s, `In retirement you found a new purpose: ${label(ch as Aspiration)}.`, 'major');
      return 'The days have a shape again.';
    },
  },
  {
    id: 'sibling_rivalry',
    major: false,
    cooldown: 5,
    candidates: (c) => {
      const kids = kidsAtHome(c.s, c.me).filter((k) => { const a = ageOf(k, c.s.year); return a >= 7 && a <= 17; });
      return ageOf(c.me, c.s.year) >= 25 && kids.length >= 2 ? [{ weight: 0.5, subject: kids[0] }] : [];
    },
    build: (c, k) => {
      const other = kidsAtHome(c.s, c.me).find((x) => x.id !== k!.id && ageOf(x, c.s.year) >= 7)!;
      return {
        title: 'Sibling rivalry',
        text: `${k!.firstName} and ${other.firstName} haven’t stopped fighting all week: over the bathroom, the TV, and who you love more.`,
        choices: [
          { id: 'mediate', label: 'Sit them down together', hint: 'Takes patience; usually helps' },
          { id: 'separate', label: 'Give each of them one-on-one time', hint: 'Some kids need that most' },
          { id: 'sort', label: 'Let them sort it out', hint: 'They might, or not' },
        ],
      };
    },
    resolve: (c, ch, k) => {
      const other = kidsAtHome(c.s, c.me).find((x) => x.id !== k!.id && ageOf(x, c.s.year) >= 7);
      const both = [k!, ...(other ? [other] : [])];
      if (ch === 'sort') {
        if (c.rng.chance(0.5)) return 'Two days of silence, then they were building a fort together. Kids.';
        for (const x of both) stat(x, 'happiness', -3);
        return 'It simmered for weeks.';
      }
      for (const x of both) { adjustBond(c.s, c.me.id, x.id, ch === 'separate' ? 5 : 3, 3); stat(x, 'happiness', 3); }
      adjustBond(c.s, k!.id, other?.id ?? k!.id, 6, 4);
      stat(c.me, 'stress', 2);
      return ch === 'separate' ? 'Each of them got an afternoon with you. The fighting faded.' : 'Tears, then a truce, then an apology you didn’t have to prompt.';
    },
  },
];
