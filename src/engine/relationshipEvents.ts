/**
 * Relationship arcs (Stage 2) and close people's own initiatives (Stage 3). Every choice here offers support, a
 * compromise, and disagreement where that makes sense; outcomes depend on trust and how the person likes to be cared
 * for, not on a trait alone. Scheduled follow-ups check that they still make sense when they come up.
 */
import { CITY_IDS } from '../content/cities';
import { local, type Ctx, type EventDef } from './eventKit';
import { moveOut } from './family';
import { cityName, cityOf } from './location';
import { charge, hasCash } from './money';
import { connectionOf, forget, harmFrom, harmText, receiverFactor, remember, stableHash } from './relationships';
import type { Person } from './types';
import { adjustBond, ageOf, alive, flag, getBond, journal, kidsAtHome, partnerOf, stat } from './util';

const they = (p: Person) => (p.sex === 'F' ? 'she' : 'he');
const them = (p: Person) => (p.sex === 'F' ? 'her' : 'him');
const adult = (c: Ctx) => ageOf(c.me, c.s.year) >= 18;
/** A city other than theirs, stable for this person and year. */
const awayCity = (c: Ctx, p: Person) => {
  const here = cityOf(c.s, p);
  const pool = CITY_IDS.filter((x) => x !== here);
  return pool[stableHash(`${p.id}:${c.s.year}:city`) % pool.length];
};

export const RELATIONSHIP_EVENTS: EventDef[] = [
  // ── Stage 2: arcs ────────────────────────────────────────────────────
  {
    // A missed moment from an earlier year still hurts.
    id: 'still_hurt',
    major: false,
    cooldown: 3,
    candidates: (c) => {
      if (!adult(c)) return [];
      const close = [partnerOf(c.s, c.me.id), ...kidsAtHome(c.s, c.me)].filter((p): p is Person => !!p && alive(p));
      return close.filter((p) => (p.memories ?? []).some((m) => m.kind === 'missed' && m.of === c.me.id && m.year < c.s.year)).slice(0, 1).map((p) => ({ weight: 0.6, subject: p }));
    },
    build: (c, p) => ({
      title: 'Still hurt',
      text: `${p!.firstName} goes quiet whenever plans come up. ${they(p!)[0].toUpperCase() + they(p!).slice(1)}’s still hurt about the year you were never around.`,
      choices: [
        { id: 'talk', label: 'Sit down and talk it through', hint: 'Works best when there’s trust to build on' },
        { id: 'amends', label: `Make amends: plan something just for ${them(p!)} (${'$' + local(c, 250).toLocaleString()})`, disabled: !hasCash(c.s.households[c.me.householdId], local(c, 250)) },
        { id: 'let_be', label: 'Let it be', hint: 'It may fade on its own' },
      ],
    }),
    resolve: (c, ch, p) => {
      const trust = getBond(c.s, c.me.id, p!.id).trust;
      if (ch === 'let_be') { adjustBond(c.s, c.me.id, p!.id, -2, -2); return 'You let it be. The quiet lingered.'; }
      if (ch === 'amends') {
        charge(c.s.households[c.me.householdId], local(c, 250));
        forget(p!, 'missed', c.me.id);
        adjustBond(c.s, c.me.id, p!.id, 6, 6);
        return `A day built around ${p!.firstName}. Somewhere in the middle of it, the hurt eased.`;
      }
      if (trust >= 0) {
        forget(p!, 'missed', c.me.id);
        adjustBond(c.s, c.me.id, p!.id, 5, 5);
        return 'You listened more than you talked. It helped, a lot.';
      }
      adjustBond(c.s, c.me.id, p!.id, 3, 3);
      return 'It was a start. There’s more to rebuild.';
    },
  },
  {
    // Working long hours with little time for your partner.
    id: 'time_or_money',
    major: false,
    cooldown: 4,
    candidates: (c) => {
      const p = partnerOf(c.s, c.me.id);
      const alloc = c.s.plan.alloc;
      if (!adult(c) || !p || p.householdId !== c.me.householdId || !c.me.jobId) return [];
      return (alloc.work ?? 0) >= 6 && (alloc.partner_time ?? 0) <= 1 ? [{ weight: 0.5, subject: p }] : [];
    },
    build: (_c, p) => ({
      title: 'Time or money?',
      text: `${p!.firstName} wants to talk: the extra hours pay the bills, but ${they(p!)} barely sees you.`,
      choices: [
        { id: 'promise', label: 'Promise more time together next year', hint: 'Keep it, and it will mean a lot' },
        { id: 'defer', label: '“After this project, I promise”', hint: 'A small letdown' },
        { id: 'dismiss', label: 'The money matters more right now', hint: 'They may not forget it' },
      ],
    }),
    resolve: (c, ch, p) => {
      if (ch === 'promise') {
        p!.flags.promised_time = c.s.year + 1;
        adjustBond(c.s, c.me.id, p!.id, 2, 2);
        return `${p!.firstName} squeezed your hand. Next year, you'll need at least two blocks of time together to keep it.`;
      }
      if (ch === 'defer') { adjustBond(c.s, c.me.id, p!.id, -2, 0); return `${p!.firstName} nodded, not quite convinced.`; }
      adjustBond(c.s, c.me.id, p!.id, -6, -4);
      remember(p!, 'pressure', c.me.id, c.s.year);
      return `${p!.firstName} went to bed early. It sat between you for a while.`;
    },
  },
  {
    // A partner at the end of their rope: working and raising the kids while you're rarely around.
    id: 'overwhelmed_partner',
    major: false,
    cooldown: 3,
    candidates: (c) => {
      const p = partnerOf(c.s, c.me.id);
      if (!adult(c) || !p || !alive(p) || p.householdId !== c.me.householdId) return [];
      // Circumstances, not a stat: juggling a job and the kids while you're rarely around (or already at their limit).
      const alloc = c.s.plan.alloc;
      const juggling = !!p.jobId && kidsAtHome(c.s, c.me).length >= 2 && (alloc.partner_time ?? 0) + (alloc.family_outing ?? 0) <= 1;
      return juggling || p.stats.stress >= 70 ? [{ weight: 0.5, subject: p }] : [];
    },
    build: (_c, p) => ({
      title: 'Overwhelmed',
      text: `${p!.firstName} is running on empty: short temper, no sleep, and a long list ${they(p!)} won’t ask for help with.`,
      choices: [
        { id: 'support', label: 'Take things off their plate', hint: 'Your stress goes up' },
        { id: 'space', label: 'Give them room to recharge', hint: 'Some people need that most' },
        { id: 'wait', label: 'It’ll pass', hint: 'Maybe' },
      ],
    }),
    resolve: (c, ch, p) => {
      if (ch === 'wait') { adjustBond(c.s, c.me.id, p!.id, -4, -2); return 'It passed, eventually. They noticed you didn’t step in.'; }
      if (ch === 'support') {
        stat(p!, 'stress', -12);
        stat(c.me, 'stress', 6);
        adjustBond(c.s, c.me.id, p!.id, 4 * receiverFactor(p!, 'support'), 4);
        remember(p!, 'support', c.me.id, c.s.year);
        return connectionOf(p!) === 'support' ? `You took over the errands, the calls and the dishes. ${p!.firstName} will remember that.` : 'You took over what you could. It helped them breathe.';
      }
      stat(p!, 'stress', -8);
      const pref = connectionOf(p!) === 'space';
      adjustBond(c.s, c.me.id, p!.id, pref ? 6 : 2, pref ? 5 : 1);
      return pref ? `A weekend to ${them(p!)}self was exactly right. ${p!.firstName} came back lighter.` : 'They rested, though they’d have liked some company.';
    },
  },

  // ── Stage 3: close people's own initiatives (scheduled by npcIntentions) ──
  {
    id: 'distant_job',
    major: false,
    cooldown: 0,
    build: (c, k) => ({
      title: `${k!.firstName}’s big offer`,
      text: `${k!.firstName} has been offered a job in ${cityName(awayCity(c, k!))}. It’s a real step up, and ${they(k!)} wants to know what you think.`,
      choices: [
        { id: 'support', label: 'Tell them to go for it', hint: 'They move away' },
        { id: 'stay', label: 'Ask them to stay', hint: 'They might, if they trust you' },
        { id: 'disagree', label: 'Tell them it’s a mistake', hint: 'They may go anyway' },
      ],
    }),
    resolve: (c, ch, k) => {
      const city = awayCity(c, k!);
      const go = () => {
        if (k!.householdId === c.me.householdId) moveOut(c.s, k!, 0);
        c.s.households[k!.householdId].city = city;
        journal(c.s, `${k!.firstName} moved to ${cityName(city)} for a new job.`, 'info');
      };
      if (ch === 'support') { go(); adjustBond(c.s, c.me.id, k!.id, 6, 4); return `${k!.firstName} called from the new apartment, beaming.`; }
      if (ch === 'stay') {
        const odds = Math.min(0.8, Math.max(0.1, 0.3 + getBond(c.s, c.me.id, k!.id).trust / 200 + (k!.traits.includes('stubborn') ? -0.1 : 0)));
        if (c.rng.chance(odds)) { adjustBond(c.s, c.me.id, k!.id, 2, -2); flag(k!, 'stayed_for_family'); return `${k!.firstName} turned it down to stay close. ${they(k!)[0].toUpperCase() + they(k!).slice(1)} sometimes wonders what if.`; }
        go(); adjustBond(c.s, c.me.id, k!.id, -2, 0); return `${k!.firstName} thought hard about it, and went anyway.`;
      }
      go();
      adjustBond(c.s, c.me.id, k!.id, -8, -6);
      remember(k!, 'pressure', c.me.id, c.s.year);
      return `${k!.firstName} went anyway, and the goodbye was stiff.`;
    },
  },
  {
    id: 'partner_night_school',
    major: false,
    cooldown: 0,
    build: (c, p) => {
      const cost = local(c, 8000);
      return {
        title: `${p!.firstName} wants to go back to school`,
        text: `${p!.firstName} has been looking at night school: two years, about $${cost.toLocaleString()} from the family budget.`,
        choices: [
          { id: 'support', label: `Back them all the way ($${cost.toLocaleString()})`, disabled: !hasCash(c.s.households[c.me.householdId], cost) },
          { id: 'next_year', label: 'Next year, when money’s better', hint: 'A fair compromise' },
          { id: 'disagree', label: 'It’s not the right time', hint: 'A dream on hold' },
        ],
      };
    },
    resolve: (c, ch, p) => {
      if (ch === 'support') {
        charge(c.s.households[c.me.householdId], local(c, 8000));
        c.s.scheduled.push({ dueYear: c.s.year + 2, eventId: 'partner_graduates', subjectId: p!.id });
        adjustBond(c.s, c.me.id, p!.id, 6, 5);
        remember(p!, 'support', c.me.id, c.s.year);
        return `${p!.firstName} signed up that week, nervous and thrilled.`;
      }
      if (ch === 'next_year') {
        c.s.scheduled.push({ dueYear: c.s.year + 1, eventId: 'partner_night_school', subjectId: p!.id });
        adjustBond(c.s, c.me.id, p!.id, 1, 1);
        return 'You agreed to look at it again next year.';
      }
      adjustBond(c.s, c.me.id, p!.id, -6, -3);
      remember(p!, 'pressure', c.me.id, c.s.year);
      return `${p!.firstName} put the brochures away.`;
    },
  },
  {
    id: 'partner_graduates',
    major: false,
    cooldown: 0,
    build: (_c, p) => ({
      title: `${p!.firstName} graduates`,
      text: `Two years of late nights later, ${p!.firstName} walks across the stage with a certificate.`,
      choices: [{ id: 'celebrate', label: 'Celebrate together' }],
    }),
    resolve: (c, _ch, p) => {
      p!.flags.trade_cert = 1;
      stat(p!, 'happiness', 8);
      stat(p!, 'smarts', 4);
      adjustBond(c.s, c.me.id, p!.id, 4, 3);
      journal(c.s, `${p!.firstName} finished night school.`, 'good');
      return `${p!.firstName} framed it. It hangs where everyone can see it.`;
    },
  },
  {
    id: 'reaching_out',
    major: false,
    cooldown: 0,
    build: (_c, p) => ({
      title: `A message from ${p!.firstName}`,
      text: `After a long silence, ${p!.firstName} reaches out: “I miss how things used to be. Can we talk?”`,
      choices: [
        { id: 'welcome', label: 'Call back right away' },
        { id: 'cautious', label: 'Reply, but take it slowly' },
        { id: 'not_ready', label: 'You’re not ready' },
      ],
    }),
    resolve: (c, ch, p) => {
      if (ch === 'not_ready') { adjustBond(c.s, c.me.id, p!.id, -3, -2); return 'You left it unanswered for now.'; }
      const warm = ch === 'welcome';
      adjustBond(c.s, c.me.id, p!.id, warm ? 15 : 6, warm ? 10 : 5);
      return warm ? `You talked for two hours. Neither of you mentioned why it went quiet, and that was fine.` : 'A few careful messages. A door opened a little.';
    },
  },
  {
    id: 'sibling_reunion',
    major: false,
    cooldown: 0,
    build: (c, p) => ({
      title: `${p!.firstName} wants to get everyone together`,
      text: `${p!.firstName} is planning a family get-together and asks if you’ll help organize it.`,
      choices: [
        { id: 'help', label: `Help organize it ($${local(c, 400).toLocaleString()})`, disabled: !hasCash(c.s.households[c.me.householdId], local(c, 400)) },
        { id: 'attend', label: 'Just show up' },
        { id: 'decline', label: 'Skip it this time' },
      ],
    }),
    resolve: (c, ch, p) => {
      if (ch === 'decline') { adjustBond(c.s, c.me.id, p!.id, -4, -2); return `${p!.firstName} sent photos. You were missed.`; }
      const relatives = Object.values(c.s.people).filter((x) => alive(x) && x.id !== c.me.id && x.householdId !== c.me.householdId && (x.biologicalParents.some((id) => c.me.biologicalParents.includes(id)) || c.me.biologicalParents.includes(x.id)));
      const lift = ch === 'help' ? 5 : 3;
      if (ch === 'help') { charge(c.s.households[c.me.householdId], local(c, 400)); flag(c.me, 'reunion'); }
      for (const r of relatives) adjustBond(c.s, c.me.id, r.id, lift, 2);
      adjustBond(c.s, c.me.id, p!.id, lift + 2, 3);
      return ch === 'help' ? 'A full backyard, too much food, and everyone talking at once. Worth every minute.' : 'You had a lovely afternoon catching up.';
    },
  },
  {
    id: 'boundary',
    major: false,
    cooldown: 0,
    build: (c, p) => {
      const harm = harmFrom(p!, c.me.id);
      return {
        title: `${p!.firstName} sets a boundary`,
        text: `${p!.firstName} asks you, calmly, for room to make ${p!.sex === 'F' ? 'her' : 'his'} own choices${harm ? `. ${they(p!)[0].toUpperCase() + they(p!).slice(1)} hasn’t forgotten you ${harmText(harm)}` : ''}.`,
        choices: [
          { id: 'respect', label: 'Respect it' },
          { id: 'explain', label: 'Explain where you were coming from', hint: 'Depends on trust' },
          { id: 'argue', label: 'Argue the point' },
        ],
      };
    },
    resolve: (c, ch, p) => {
      const harm = harmFrom(p!, c.me.id);
      if (ch === 'respect') { if (harm) forget(p!, harm.kind, c.me.id); adjustBond(c.s, c.me.id, p!.id, 3, 8); return 'You said “okay” and meant it. Things eased between you.'; }
      if (ch === 'explain') {
        if (getBond(c.s, c.me.id, p!.id).trust >= 10) { if (harm) forget(p!, harm.kind, c.me.id); adjustBond(c.s, c.me.id, p!.id, 3, 4); return 'They understood, mostly. You understood them better too.'; }
        adjustBond(c.s, c.me.id, p!.id, -2, -2); return 'It came out as more pushing. They changed the subject.';
      }
      adjustBond(c.s, c.me.id, p!.id, -6, -6);
      return 'Voices were raised. You both regretted it.';
    },
  },
];

