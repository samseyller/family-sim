import { HOBBY_BY_ID } from '../content/actions';
import { DEBT_RATE, LIFESTYLES, SAVINGS_RATE } from '../content/economy';
import { CAREER_BY_ID, PART_TIME_MAX, PROGRAMS, TWO_JOB_STRESS, qualifies, requiredBlocks } from '../content/careers';
import { assignJob, canWorkFullTime, homeParents, makeAdultStranger, makeBaby, pickCareer } from './generate';
import { fullTimePay, householdBudget, partTimePay } from './budget';
import { capacityOf, loanPayment } from './finance';
import { INVEST_RETURN, INVEST_VOLATILITY } from '../content/finance';
import { autoComeOfAge, die, isCloseKin, marry, moveOut, receptiveness, retire } from './family';
import type { Rng } from './rng';
import type { GameState, Hobby, Person } from './types';
import {
  active, adjustBond, ageOf, alive, childrenOf, clamp, flag, fullName, getBond, journal, kidsAtHome,
  livingPeople, membersOf, money, partnerOf, stat,
} from './util';

/** Diminishing returns: each extra block on the same action is worth 70% of the previous. */
export const dim = (n: number) => {
  let t = 0;
  for (let i = 0; i < n; i++) t += Math.pow(0.7, i);
  return t;
};

/** Step 1: apply the active character's plan. Returns this year's pay for the active character. */
export function applyPlan(s: GameState, rng: Rng): number {
  const me = active(s);
  const plan = s.plan;
  const g = (k: string) => Math.max(0, plan.alloc[k] ?? 0);

  // Job intents take effect this year (one per slot).
  for (const it of plan.jobIntents) {
    if (it.kind === 'quit') {
      const id = it.slot === 'full' ? me.jobId : me.partJobId;
      if (!id) continue;
      journal(s, `You quit your ${it.slot === 'part' ? 'part-time ' : ''}job as a ${CAREER_BY_ID[id].name}.`, 'info');
      if (it.slot === 'full') me.jobId = undefined;
      else me.partJobId = undefined;
      continue;
    }
    const c = CAREER_BY_ID[it.careerId];
    if (c && qualifies(me, c) && rng.chance(c.hours === 'part' ? 0.9 : 0.75)) {
      assignJob(me, c);
      if (c.hours === 'full') me.retired = false;
      journal(s, `You were hired as a ${c.name}${c.hours === 'part' ? ' (part-time)' : ''}!`, 'good');
    } else if (c) {
      journal(s, `Your application for ${c.name} was turned down.`, 'bad');
    }
  }
  plan.jobIntents = [];

  let pay = 0;
  const c = canWorkFullTime(me) ? CAREER_BY_ID[me.jobId!] : undefined;
  if (c) {
    const work = g('work');
    const req = requiredBlocks(c, me.jobLevel);
    pay = fullTimePay(c, me.jobLevel, work);
    me.workPerf = Math.round(clamp(me.workPerf + (work - req) * 12 + (work >= req ? 4 : -8) + rng.int(-5, 5), 0, 100));
    stat(me, 'stress', (c.stress * work) / req + Math.max(0, work - req) * 4);
    me.jobYears++;
    if (me.workPerf < 10) {
      journal(s, `You were let go from your job as a ${c.name}.`, 'bad');
      me.jobId = undefined;
      pay *= 0.5;
    }
  }

  // Part-time: 1–4 blocks, 2 is good standing, extra blocks pay at the normal rate.
  const pc = me.partJobId ? CAREER_BY_ID[me.partJobId] : undefined;
  if (pc) {
    const work = Math.min(g('parttime'), PART_TIME_MAX);
    const req = pc.blocks;
    pay += partTimePay(pc, work);
    me.partPerf = Math.round(clamp(me.partPerf + (work - req) * 6 + (work >= req ? 4 : -10) + rng.int(-4, 4), 0, 100));
    stat(me, 'stress', (pc.stress * work) / req);
    me.partYears++;
    if (work === 0 || me.partPerf < 10) {
      journal(s, `You lost your part-time job as a ${pc.name}.`, 'bad');
      me.partJobId = undefined;
    }
  }
  if (c && me.partJobId) stat(me, 'stress', TWO_JOB_STRESS);

  const ex = g('exercise');
  if (ex) {
    const m = dim(ex) * (me.flags.health_vow ? 1.5 : 1);
    stat(me, 'fitness', 6 * m);
    stat(me, 'health', 3 * m);
    stat(me, 'stress', -4 * m);
  }
  const rx = g('relax');
  if (rx) {
    stat(me, 'stress', -10 * dim(rx));
    stat(me, 'happiness', 4 * dim(rx));
  }
  const ln = g('learn');
  if (ln) stat(me, 'smarts', 3 * dim(ln));

  // Hobby practice (kids and adults alike).
  const pr = g('practice');
  if (pr && me.hobby) {
    me.skills[me.hobby] = Math.round(clamp((me.skills[me.hobby] ?? 0) + 4 * dim(pr), 0, 100));
    stat(me, 'happiness', 2 * dim(pr));
  }

  // Time with parents who live at home (as a kid, a grown child who stayed, or a parent who moved in).
  for (const parent of homeParents(s, me)) {
    const n = g(`parent_time:${parent.id}`);
    if (n) {
      adjustBond(s, me.id, parent.id, 7 * dim(n), 6 * dim(n));
      stat(parent, 'happiness', 3 * dim(n));
    }
  }

  const soc = g('socialize');
  if (soc) {
    stat(me, 'happiness', 3 * dim(soc));
    stat(me, 'stress', -2 * dim(soc));
  }

  // Night school: enroll/drop take effect now; each study block is 1 progress.
  const edu = plan.eduIntent;
  plan.eduIntent = undefined;
  if (edu?.kind === 'drop' && me.education) {
    journal(s, `You dropped out of night school (${PROGRAMS[me.education.program].short}).`, 'info');
    me.education = undefined;
    flag(me, 'dropped_out');
  } else if (edu?.kind === 'enroll' && !me.education) {
    const prog = PROGRAMS[edu.program];
    me.education = { program: prog.id, progress: 0, required: prog.required, startYear: s.year };
    journal(s, `You enrolled in night school: ${prog.short}.`, 'good');
  }
  if (me.education) {
    const st = g('study');
    me.education.progress += st;
    stat(me, 'stress', st * 2);
    if (me.education.progress >= me.education.required) {
      const prog = PROGRAMS[me.education.program];
      me.flags[prog.id] = 1;
      me.flags.fresh_credential = s.year;
      stat(me, 'smarts', prog.id === 'degree' ? 6 : 3);
      stat(me, 'happiness', 8);
      journal(s, `You earned your ${prog.short.toLowerCase()}!`, 'major');
      me.education = undefined;
    } else if (!st) {
      // Two idle years in a row and the school drops you, so tuition can't silently drain the wallet.
      flag(me, 'idle_study');
      if (me.flags.idle_study >= 2) {
        journal(s, `You stopped showing up to night school and were withdrawn from the ${PROGRAMS[me.education.program].short.toLowerCase()} program.`, 'bad');
        me.education = undefined;
        flag(me, 'dropped_out');
        delete me.flags.idle_study;
      } else {
        journal(s, 'You made no progress at night school this year. Plan some Night school blocks or drop out.', 'bad');
      }
    } else {
      delete me.flags.idle_study;
    }
  }

  const outing = g('family_outing');
  if (outing) {
    for (const m of membersOf(s, me.householdId)) {
      if (m.id === me.id) continue;
      adjustBond(s, me.id, m.id, 4 * dim(outing), 2 * dim(outing));
      stat(m, 'happiness', 4 * dim(outing));
    }
    stat(me, 'happiness', 3 * dim(outing));
    stat(me, 'stress', -3 * dim(outing));
  }

  const partner = partnerOf(s, me.id);
  if (partner) {
    const n = g('partner_time');
    const together = partner.householdId === me.householdId;
    if (n) {
      adjustBond(s, me.id, partner.id, 8 * dim(n), 5 * dim(n));
      stat(me, 'happiness', 2 * dim(n));
      stat(partner, 'happiness', 3 * dim(n));
    } else if (!outing || !together) {
      adjustBond(s, me.id, partner.id, -9, -4);
      journal(s, `${partner.firstName} felt you were never around this year.`, 'bad');
    }
  }

  for (const kid of kidsAtHome(s, me)) {
    const t = g(`child_time:${kid.id}`);
    const h = ageOf(kid, s.year) >= 5 ? g(`homework:${kid.id}`) : 0;
    if (t) {
      adjustBond(s, me.id, kid.id, 8 * dim(t), 6 * dim(t));
      stat(kid, 'happiness', 3 * dim(t));
    }
    if (h) {
      stat(kid, 'smarts', 3 * dim(h));
      adjustBond(s, me.id, kid.id, dim(h), 2 * dim(h));
    }
    if (!t && !h && !outing) {
      adjustBond(s, me.id, kid.id, -10, -6);
      flag(kid, 'neglected');
      stat(kid, 'happiness', -4);
      journal(s, `${kid.firstName} barely saw you this year.`, 'bad');
    }
  }

  // Crowding: more people than the home fits wears on everyone.
  const home = s.households[me.householdId];
  const crowd = membersOf(s, me.householdId).length - capacityOf(home);
  if (crowd > 0) {
    for (const m of membersOf(s, me.householdId)) {
      stat(m, 'happiness', -Math.min(6, 3 * crowd));
      stat(m, 'stress', 2);
    }
    journal(s, 'The home feels cramped. A bigger place would help.', 'bad');
  }

  // Lifestyle: how the household lives this year shows in everyone's mood.
  const ls = LIFESTYLES[plan.lifestyle ?? 'comfortable'];
  if (ls.happiness || ls.stress) {
    for (const m of membersOf(s, me.householdId)) {
      stat(m, 'happiness', ls.happiness);
      stat(m, 'stress', ls.stress);
    }
  }

  // Baseline life pressure.
  stat(me, 'stress', 5);
  if (me.stats.stress > 70) {
    stat(me, 'happiness', -5);
    stat(me, 'health', -3);
  }
  return Math.round(pay);
}

/** Step 2: income, expenses, and the household wallet for every household. */
export function runEconomy(s: GameState, activePay: number, rng?: Rng) {
  const me = active(s);
  for (const hh of Object.values(s.households)) {
    const mem = membersOf(s, hh.id);
    if (!mem.length || hh.settled) continue;
    // Totals come from the same pure function the End Year preview uses.
    const budget = householdBudget(s, hh.id, activePay);
    for (const a of hh.assets) {
      if (a.mortgage > 0) {
        const pay = loanPayment(a);
        a.mortgage = Math.max(0, Math.round(a.mortgage * (1 + (a.rate ?? 0.04)) - pay));
      }
      a.value = Math.round(a.value * (a.kind === 'house' ? 1.03 : 0.85));
    }
    if (hh.id === me.householdId) {
      for (const kid of kidsAtHome(s, me)) kid.fund += s.plan.children[kid.id]?.fundContribution ?? 0;
    }
    for (const p of mem) if (p.fund > 0) p.fund = Math.round(p.fund * 1.04);
    hh.wallet += budget.net;
    hh.wallet = Math.round(hh.wallet * (hh.wallet > 0 ? 1 + SAVINGS_RATE : 1 + DEBT_RATE));
    // Investments swing year to year around their average return.
    if (rng && (hh.investments ?? 0) > 0) {
      const r = INVEST_RETURN + (rng.next() * 2 - 1) * INVEST_VOLATILITY * 1.7;
      const before = hh.investments!;
      hh.investments = Math.max(0, Math.round(before * (1 + r)));
      if (hh.id === me.householdId && Math.abs(r) > 0.12) journal(s, `Your investments ${r > 0 ? 'jumped' : 'fell'} ${Math.round(Math.abs(r) * 100)}% this year.`, r > 0 ? 'good' : 'bad');
    }
    if (hh.wallet < 0) {
      for (const p of mem) {
        if (ageOf(p, s.year) < 18) continue;
        stat(p, 'stress', 6);
        stat(p, 'happiness', -5);
      }
      if (hh.id === me.householdId) journal(s, `The household is in debt (${money(hh.wallet)}).`, 'bad');
    }
  }
}

function traitHobby(rng: Rng, p: Person): Hobby {
  if (p.traits.includes('athletic')) return 'sports';
  if (p.traits.includes('creative')) return rng.chance(0.5) ? 'art' : 'music';
  return rng.pick<Hobby>(['music', 'sports', 'art']);
}

function childYear(s: GameState, rng: Rng, c: Person) {
  const me = active(s);
  const a = ageOf(c, s.year);
  const mine = c.householdId === me.householdId && (c.biologicalParents.includes(me.id) || c.adoptiveParents.includes(me.id));
  const cp = mine ? s.plan.children[c.id] : undefined;
  const r = mine ? receptiveness(s, me, c) : 0.5;

  if (a >= 6 && !c.hobby && c.id !== me.id) {
    if (cp?.suggestHobby && rng.chance(r)) {
      c.hobby = cp.suggestHobby;
      journal(s, `${c.firstName} took up ${HOBBY_BY_ID[c.hobby].label.toLowerCase()} at your suggestion.`, 'good');
    } else if (rng.chance(0.5)) {
      c.hobby = traitHobby(rng, c);
      if (mine) journal(s, `${c.firstName} discovered a love of ${HOBBY_BY_ID[c.hobby].label.toLowerCase()}.`, 'info');
    }
  }
  if (a < 5) return;

  let study = 1.5 + (c.traits.includes('curious') ? 1 : 0) + (cp?.tutoring ? 3 : 0);
  let practice = c.hobby ? 2 + (cp?.lessons ? 3 : 0) + (c.flags.advanced ? 4 : 0) : 0;
  if (cp && cp.focus !== 'free') {
    if (rng.chance(r)) {
      if (cp.focus === 'studies') study += 3;
      else if (c.hobby) practice += 4;
    } else {
      flag(c, 'resents');
      adjustBond(s, me.id, c.id, -3, -4);
      stat(c, 'happiness', -3);
      journal(s, `${c.firstName} pushed back against your plans for them.`, 'bad');
    }
  } else {
    stat(c, 'happiness', 2);
    if (rng.chance(0.5)) study += 1;
    else practice += 1;
  }
  stat(c, 'smarts', study);
  if (c.hobby) c.skills[c.hobby] = Math.round(clamp((c.skills[c.hobby] ?? 0) + practice, 0, 100));
  stat(c, 'stress', (20 - c.stats.stress) * 0.3);
}

function education(s: GameState, p: Person) {
  if (p.studyingUntil && s.year >= p.studyingUntil) {
    p.flags[p.studyKind === 'university' ? 'degree' : 'trade_cert'] = 1;
    stat(p, 'smarts', p.studyKind === 'university' ? 8 : 3);
    if (isCloseKin(s, p)) {
      const who = p.id === s.activeId ? 'You' : p.firstName;
      journal(s, `${who} graduated from ${p.studyKind === 'university' ? 'university' : 'trade school'}.`, 'good');
    }
    p.studyingUntil = undefined;
    p.studyKind = undefined;
  }
}

function adultYear(s: GameState, rng: Rng, p: Person) {
  const me = active(s);
  const a = ageOf(p, s.year);
  education(s, p);
  if (!p.jobId && !p.retired && !p.studyingUntil && a < 63) {
    const c = pickCareer(rng, p);
    if (c && rng.chance(0.8)) {
      assignJob(p, c);
      p.partJobId = undefined;
      if (isCloseKin(s, p)) journal(s, `${p.firstName} started working as a ${c.name}.`, 'info');
    } else if (!p.partJobId && rng.chance(0.6)) {
      const pt = pickCareer(rng, p, 'part');
      if (pt) assignJob(p, pt);
    }
  } else if (p.jobId) {
    p.jobYears++;
    if (p.jobYears >= 3 && p.jobLevel < 3 && rng.chance(0.15)) {
      p.jobLevel++;
      p.jobYears = 0;
    }
    if (a >= 65 && rng.chance(0.5)) retire(p);
  }
  stat(p, 'stress', (35 - p.stats.stress) * 0.3);
  const pt = partnerOf(s, p.id);
  const mood = pt ? getBond(s, p.id, pt.id).affinity / 10 : 0;
  stat(p, 'happiness', (60 + mood - p.stats.happiness) * 0.3);

  // Grown children living at home eventually leave once they're working.
  const myChild = p.biologicalParents.includes(me.id) || p.adoptiveParents.includes(me.id);
  if (myChild && p.householdId === me.householdId && a >= 23 && p.jobId && !p.studyingUntil && rng.chance(0.2)) {
    moveOut(s, p, Math.max(0, p.fund));
    journal(s, `${p.firstName} found their own place and moved out.`, 'info');
    return;
  }

  // Close branches of the family live their own lives; distant branches stop
  // expanding so long family lines stay cheap to simulate.
  if (p.householdId === me.householdId || !isCloseKin(s, p)) return;
  if (!pt && a >= 22 && a <= 40 && rng.chance(0.15)) {
    const spouse = makeAdultStranger(s, rng, p);
    marry(s, p, spouse);
    if (isCloseKin(s, p)) journal(s, `${p.firstName} married ${fullName(spouse)}.`, 'good');
  }
  const hh = s.households[p.householdId];
  if (pt && pt.householdId === p.householdId && a <= 42 && ageOf(pt, s.year) <= 44 && !hh.pendingBirth
    && childrenOf(s, p.id).length < 3 && rng.chance(0.18)) {
    hh.pendingBirth = { year: s.year + 1, parents: [p.id, pt.id] };
  }
}

/** Step 3: births, children growing up, and everyone else's decisions. */
export function runPeople(s: GameState, rng: Rng) {
  const me = active(s);
  for (const hh of Object.values(s.households)) {
    if (!hh.pendingBirth || hh.pendingBirth.year > s.year) continue;
    const [a, b] = hh.pendingBirth.parents.map((id) => s.people[id]);
    hh.pendingBirth = undefined;
    if (!a || !alive(a)) continue;
    const baby = makeBaby(s, rng, a, b, hh.id);
    if (isCloseKin(s, baby)) journal(s, `${baby.firstName} ${baby.lastName} was born!`, 'birth');
    // The player names their own babies (a naming event this same year).
    if (baby.biologicalParents.includes(me.id)) s.scheduled.push({ dueYear: s.year, eventId: 'name_baby', subjectId: baby.id });
  }
  for (const p of livingPeople(s)) {
    const a = ageOf(p, s.year);
    if (a < 18) {
      childYear(s, rng, p);
      continue;
    }
    if (!p.flags.came_of_age) {
      const theirParentIsMe = p.biologicalParents.includes(me.id) || p.adoptiveParents.includes(me.id);
      // The player's own children get a coming-of-age decision instead.
      // The player's own coming of age is an event; the player's own children get one too.
      if (p.id !== me.id && !(theirParentIsMe && p.householdId === me.householdId)) autoComeOfAge(s, rng, p, p.householdId === me.householdId ? false : true);
    }
    if (p.id === me.id) education(s, p);
    else adultYear(s, rng, p);
  }
}

/** Step 4: relationships drift toward neutral-warm without attention. */
export function driftBonds(s: GameState) {
  for (const [k, b] of Object.entries(s.bonds)) {
    const [x, y] = k.split('|');
    if (!alive(s.people[x]) || !alive(s.people[y])) continue;
    b.affinity = Math.round(b.affinity + (10 - b.affinity) * 0.05);
    b.trust = Math.round(b.trust + (0 - b.trust) * 0.03);
  }
}

export function deathChance(age: number, health: number) {
  const base = age < 1 ? 0.004 : age < 40 ? 0.0008 : age < 50 ? 0.002 : age < 60 ? 0.006 : age < 70 ? 0.015
    : age < 80 ? 0.045 : age < 90 ? 0.12 : 0.3;
  const mult = health < 30 ? 2.5 : health < 50 ? 1.5 : health > 75 ? 0.7 : 1;
  return base * mult;
}

/** Step 6: aging effects on health, then death checks (deaths happen at year end). */
export function runHealth(s: GameState, rng: Rng) {
  for (const p of livingPeople(s)) {
    const a = ageOf(p, s.year);
    let d = 0;
    if (a > 50) d -= 1;
    if (a > 65) d -= 1.5;
    if (a > 75) d -= 2;
    if (p.stats.fitness > 60) d += 1;
    if (p.stats.stress > 75) d -= 2;
    if (a < 40) d += (80 - p.stats.health) * 0.1;
    stat(p, 'health', d);
    if (a > 35) stat(p, 'fitness', -1.5);
    if (rng.chance(deathChance(a, p.stats.health))) {
      die(s, p, a >= 75 ? 'old age' : p.stats.health < 40 ? 'illness' : 'a sudden accident');
    }
  }
}
