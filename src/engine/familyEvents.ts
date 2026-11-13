/** Family life: raising children, partnership and marriage, a full house, naming a baby, the guided child. */
import { HOBBY_BY_ID } from '../content/actions';
import { SCHOLARSHIP_SKILL } from '../content/sports';
import { FEMALE_NAMES, MALE_NAMES } from '../content/names';
import { relocate } from './finance';
import { cityName, myCity } from './location';
import { canAfford, collegeChoice, gpaText } from './school';
import { CITIES, CITY_IDS, type CityId } from '../content/cities';
import { guidedPerson } from './tutorial';
import { CAREER_BY_ID, LEVEL_TITLES, salaryOf } from '../content/careers';
import { addHobbySkill } from './hobbies';
import { assignJob, makeAdultStranger, makePerson, pickCareer } from './generate';
import { breakUp, divorce, homeEquityShare, marry, mergeHouseholds, moveOut, partnerInHome, preferredPath, receptiveness, receptivenessLabel, reconcile, separate, separatedFrom, startDating, startPath, type LifePath } from './family';
import type { GameState, Person } from './types';
import { activePartnership, adjustBond, ageOf, alive, childrenOf, cleanName, flag, fullName, getBond, journal, kidsAtHome, NAME_MAX, membersOf, money, parentsOf, partnerOf, stat } from './util';
import { LIFE_EVENTS } from './lifeEvents';
import { age, one, pushPending, wallet, type Ctx, type EventDef } from './eventKit';

/** Where a job offer would take the family (stable for the event: depends on who and when). */
function offerCity(c: { s: GameState }, p: Person): CityId {
  const pool = CITY_IDS.filter((x) => x !== myCity(c.s));
  const h = [...`${p.id}:${c.s.year}`].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return pool[h % pool.length];
}

/** Engagement rings: a better ring helps a little and is remembered fondly. */
const RINGS = [
  { id: 'ring_modest', label: 'a simple ring', cost: 2000, boost: 0.03, hint: 'Sweet and sensible', reaction: 'They love the ring.' },
  { id: 'ring_nice', label: 'a beautiful ring', cost: 6000, boost: 0.06, hint: 'A real sparkle', reaction: 'They keep staring at the ring.' },
  { id: 'ring_stunning', label: 'a stunning ring', cost: 15000, boost: 0.1, hint: 'Their friends will gasp', reaction: 'Their friends gasped at the ring.' },
];

/** Queue a follow-up decision this year (a wedding after a proposal, leaving home after coming of age). */
const enqueue = (c: Ctx, id: string, subject?: Person) =>
  pushPending(c, [...RAISING_EVENTS, ...LIFE_EVENTS].find((e) => e.id === id)!, subject);

export const RAISING_EVENTS: EventDef[] = [
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
        addHobbySkill(c.s, k!, k!.hobby!, 5);
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
        text: `${kid.firstName} is graduating high school. ${gpaText(kid)}, smarts ${kid.stats.smarts}${kid.hobby ? `, ${HOBBY_BY_ID[kid.hobby].label.toLowerCase()} skill ${skill}` : ''}, college fund ${money(kid.fund)}. ${receptivenessLabel(r)}.${memory}`,
        choices: [
          collegeChoice(kid, wallet(c), 'top', 'top_university', 'Encourage a top university'),
          collegeChoice(kid, wallet(c), 'state', 'university', 'Encourage state university'),
          { id: 'trade', label: 'Suggest trade school', hint: '2 years; steady skilled work' },
          { id: 'military', label: 'Suggest the military', hint: 'A 4-year tour, the GI Bill after; deployments carry some risk' },
          ...(kid.hobby === 'sports' && (kid.skills.sports ?? 0) >= SCHOLARSHIP_SKILL ? [{ id: 'athletic', label: 'Take the athletic scholarship', hint: 'University paid; they keep playing' }] : []),
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
      // Their own choice can be a college the family can't pay for; then they aim lower.
      if ((path === 'top_university' && !canAfford(kid, wallet(c), 'top')) || (path === 'university' && !canAfford(kid, wallet(c), 'state'))) {
        path = path === 'top_university' && canAfford(kid, wallet(c), 'state') ? 'university' : 'trade';
      }
      const label = startPath(c.s, kid, path, c.rng);
      journal(c.s, `${kid.firstName} set off toward ${label}.`, 'major');
      enqueue(c, 'graduation_gift', kid);
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

];

export const PARTNERSHIP_EVENTS: EventDef[] = [
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
      const to = offerCity(c, p!);
      return {
        title: `An offer in ${cityName(to)}`,
        text: `${p!.firstName} has been offered a promotion to ${LEVEL_TITLES[p!.jobLevel + 1]} ${job.name}, but it means moving to ${cityName(to)}, ${CITIES[to].state} (${CITIES[to].blurb.toLowerCase()}). `
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
        const to = offerCity(c, p!);
        p!.jobLevel = Math.min(3, p!.jobLevel + 1);
        const note = relocate(c.s, wallet(c), to, p!);
        adjustBond(c.s, c.me.id, p!.id, 12, 8);
        journal(c.s, `The family moved to ${cityName(to)}.${note}`, 'major');
        return `New city, new routines. ${p!.firstName} is thriving. Friends back home are a phone call away now.`;
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
          { id: 'propose', label: 'Propose (no ring, just the words)', hint: 'They might say no if the bond is weak' },
          ...RINGS.map((r) => ({ id: r.id, label: `Propose with ${r.label} (${money(r.cost)})`, hint: r.hint, disabled: wallet(c).wallet < r.cost })),
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
      const ring = RINGS.find((r) => r.id === ch);
      if (ring) wallet(c).wallet -= ring.cost; // the ring is bought either way
      // In the guided first playthrough, the answer is always yes.
      if (guidedPerson(c.s)?.id === c.me.id || c.rng.chance(0.3 + (b.affinity + b.trust) / 200 + (ring?.boost ?? 0))) {
        marry(c.s, c.me, p!);
        stat(c.me, 'happiness', 12);
        if (ring) adjustBond(c.s, c.me.id, p!.id, ring.boost * 40, 0);
        journal(c.s, `You married ${fullName(p!)}.`, 'major');
        enqueue(c, 'wedding', p!);
        return `${p!.firstName} said yes!${ring ? ` ${ring.reaction}` : ''} Time to plan a wedding.`;
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

];

export const FULL_HOUSE_EVENTS: EventDef[] = [
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
        text: `After a fall, ${p!.firstName}'s doctor says living alone isn't safe anymore. ${theirs >= 0 ? `${p!.firstName} has ${money(theirs)} saved.` : `${p!.firstName} is ${money(-theirs)} in debt.`}`,
        choices: [
          { id: 'move_in', label: 'Move in with us', hint: `${theirs >= 0 ? 'Their savings join' : 'Their debt joins'} your household; more stress for you` },
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

];

/** Queued (via `scheduled`) when the player's baby is born: pick a suggested name or type one. */
export const NAME_BABY: EventDef = {
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
export const GUIDED_KID: EventDef = {
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
