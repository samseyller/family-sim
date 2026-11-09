import { CAREERS, PART_TIME_MAX, PROGRAMS, qualifies, requiredBlocks, CAREER_BY_ID, type Career, type JobSlot } from '../content/careers';
import { FEMALE_NAMES, LAST_NAMES, MALE_NAMES } from '../content/names';
import { TIME_BUDGET, defaultChildPlan } from '../content/actions';
import { makeRng, type Rng } from './rng';
import { inheritLooks, randomLooks } from './genome';
import type { GameState, Household, Looks, Person, Plan, Trait } from './types';
import { adjustBond, ageOf, alive, kidsAtHome, newId, partnerOf, active } from './util';

export const SCHEMA_VERSION = 5;
export const RULES_VERSION = '0.4.0';
export const START_YEAR = 2026;

const TRAITS: Trait[] = ['ambitious', 'kind', 'stubborn', 'curious', 'anxious', 'easygoing', 'creative', 'athletic'];
const OPPOSITES: [Trait, Trait][] = [['anxious', 'easygoing']];

function pickTraits(rng: Rng): Trait[] {
  const a = rng.pick(TRAITS);
  let b = rng.pick(TRAITS);
  while (b === a || OPPOSITES.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) b = rng.pick(TRAITS);
  return [a, b];
}

export { inheritLooks, randomLooks };

export function makeHousehold(s: GameState, wallet: number): Household {
  const h: Household = { id: newId(s, 'h'), wallet: Math.round(wallet), assets: [], settled: false };
  s.households[h.id] = h;
  return h;
}

interface PersonOpts {
  sex?: 'F' | 'M';
  birthYear: number;
  lastName: string;
  householdId: string;
  generation: number;
  parents?: string[];
  looks?: Looks;
}

export function makePerson(s: GameState, rng: Rng, o: PersonOpts): Person {
  const sex = o.sex ?? (rng.chance(0.5) ? 'F' : 'M');
  const p: Person = {
    id: newId(s, 'p'),
    firstName: rng.pick(sex === 'F' ? FEMALE_NAMES : MALE_NAMES),
    lastName: o.lastName,
    sex,
    birthYear: o.birthYear,
    generation: o.generation,
    stats: {
      health: rng.int(70, 90),
      happiness: rng.int(50, 70),
      smarts: rng.int(35, 70),
      fitness: rng.int(35, 65),
      stress: rng.int(20, 40),
    },
    traits: pickTraits(rng),
    skills: {},
    flags: {},
    jobLevel: 1,
    jobYears: 0,
    workPerf: 50,
    partPerf: 50,
    partYears: 0,
    retired: false,
    pension: 0,
    fund: 0,
    householdId: o.householdId,
    biologicalParents: o.parents ?? [],
    adoptiveParents: [],
    looks: o.looks ?? randomLooks(rng),
  };
  s.people[p.id] = p;
  return p;
}

export function giveEducation(rng: Rng, p: Person) {
  const r = rng.next();
  if (r < 0.45 && p.stats.smarts >= 50) p.flags.degree = 1;
  else if (r < 0.75) p.flags.trade_cert = 1;
}

export function pickCareer(rng: Rng, p: Person, slot: JobSlot = 'full'): Career | undefined {
  const opts = CAREERS.filter((c) => c.hours === slot && qualifies(p, c)).sort((a, b) => b.salary - a.salary);
  if (!opts.length) return undefined;
  return rng.chance(0.7) ? opts[0] : rng.pick(opts.slice(0, 3));
}

/** Puts the person in the job's slot (full-time or part-time), replacing what was there. */
export function assignJob(p: Person, c: Career) {
  if (c.hours === 'part') {
    p.partJobId = c.id;
    p.partYears = 0;
    p.partPerf = 50;
    return;
  }
  p.jobId = c.id;
  p.jobLevel = 1;
  p.jobYears = 0;
  p.workPerf = 50;
}

export const canWorkFullTime = (p: Person) => !!p.jobId && !p.retired && !p.studyingUntil;
export const canWorkPartTime = (p: Person) => !!p.partJobId;

/** An adult who could become someone's partner, living in their own new household. */
export function makeAdultStranger(s: GameState, rng: Rng, near: Person): Person {
  const hh = makeHousehold(s, rng.int(3000, 20000));
  const sex = rng.chance(0.9) ? (near.sex === 'F' ? 'M' : 'F') : near.sex;
  const p = makePerson(s, rng, {
    sex,
    birthYear: near.birthYear + rng.int(-4, 4),
    lastName: rng.pick(LAST_NAMES),
    householdId: hh.id,
    generation: near.generation,
  });
  p.flags.came_of_age = 1;
  giveEducation(rng, p);
  const c = pickCareer(rng, p);
  if (c) assignJob(p, c);
  return p;
}

export function makeBaby(s: GameState, rng: Rng, a: Person, b: Person | undefined, householdId: string): Person {
  const kid = makePerson(s, rng, {
    birthYear: s.year,
    lastName: a.lastName,
    householdId,
    generation: a.generation + 1,
    parents: b ? [a.id, b.id] : [a.id],
    looks: inheritLooks(rng, a.looks, (b ?? a).looks),
  });
  kid.stats.smarts = rng.int(20, 40);
  kid.stats.health = rng.int(85, 98);
  kid.stats.stress = 10;
  for (const parent of [a, b]) if (parent) adjustBond(s, parent.id, kid.id, 50, 40);
  return kid;
}

export function defaultPlan(s: GameState): Plan {
  const me = active(s);
  const alloc: Record<string, number> = {};
  let left = TIME_BUDGET;
  const give = (k: string, n: number) => {
    const g = Math.min(n, left);
    if (g > 0) alloc[k] = (alloc[k] ?? 0) + g;
    left -= g;
  };
  if (canWorkFullTime(me)) give('work', requiredBlocks(CAREER_BY_ID[me.jobId!], me.jobLevel));
  if (canWorkPartTime(me)) give('parttime', 2);
  if (me.education) give('study', 3);
  const partner = partnerOf(s, me.id);
  if (partner) give('partner_time', 1);
  else if (ageOf(me, s.year) >= 18) give('socialize', 1);
  const children: Plan['children'] = {};
  for (const k of kidsAtHome(s, me)) {
    give(`child_time:${k.id}`, 1);
    children[k.id] = defaultChildPlan();
  }
  give('exercise', 1);
  give('relax', left);
  return { alloc, children, jobIntents: [] };
}

/** Keeps at most one valid intent per job slot. */
function sanitizeIntents(me: Person, intents: Plan['jobIntents']): Plan['jobIntents'] {
  const out: Plan['jobIntents'] = [];
  const taken = new Set<JobSlot>();
  for (const it of intents ?? []) {
    const slot: JobSlot | undefined = it.kind === 'quit' ? it.slot : CAREER_BY_ID[it.careerId]?.hours;
    if (!slot || taken.has(slot)) continue;
    if (it.kind === 'quit' && !(slot === 'full' ? me.jobId : me.partJobId)) continue;
    if (it.kind === 'apply' && (it.careerId === me.jobId || it.careerId === me.partJobId)) continue;
    if (it.kind === 'apply' && slot === 'full' && me.studyingUntil) continue;
    taken.add(slot);
    out.push(it);
  }
  return out;
}

/** Removes invalid entries, keeps total within budget, and clears one-time intents. */
export function sanitizePlan(s: GameState, plan: Plan, keepIntent = true): Plan {
  const me = active(s);
  const kids = kidsAtHome(s, me);
  const kidIds = new Set(kids.map((k) => k.id));
  const partner = partnerOf(s, me.id);
  const intents = keepIntent ? sanitizeIntents(me, plan.jobIntents) : [];
  const applying = (slot: JobSlot) => intents.some((i) => i.kind === 'apply' && CAREER_BY_ID[i.careerId].hours === slot);
  const canWork = canWorkFullTime(me) || applying('full');
  const canPart = canWorkPartTime(me) || applying('part');
  const eduIntent = keepIntent ? sanitizeEduIntent(me, plan.eduIntent) : undefined;
  const canStudy = (!!me.education && eduIntent?.kind !== 'drop') || eduIntent?.kind === 'enroll';
  const alloc: Record<string, number> = {};
  let total = 0;
  for (const [k, raw] of Object.entries(plan.alloc)) {
    let n = Math.max(0, Math.floor(raw || 0));
    if (!n) continue;
    const [action, target] = k.split(':');
    if (target && !kidIds.has(target)) continue;
    if (action === 'work' && !canWork) continue;
    if (action === 'parttime') {
      if (!canPart) continue;
      n = Math.min(n, PART_TIME_MAX);
    }
    // Dating partners count too; they just don't live with you yet.
    if (action === 'partner_time' && !partner) continue;
    if (action === 'study' && !canStudy) continue;
    const g = Math.min(n, TIME_BUDGET - total);
    if (g > 0) alloc[k] = g;
    total += g;
  }
  const children: Plan['children'] = {};
  for (const k of kids) children[k.id] = { ...defaultChildPlan(), ...plan.children[k.id] };
  return { alloc, children, jobIntents: intents, eduIntent, lifestyle: plan.lifestyle };
}

/** Night-school intents must make sense for the person's situation. */
function sanitizeEduIntent(me: Person, it: Plan['eduIntent']): Plan['eduIntent'] {
  if (!it) return undefined;
  if (it.kind === 'drop') return me.education ? it : undefined;
  if (me.education || me.studyingUntil || me.flags[it.program]) return undefined;
  return me.stats.smarts >= PROGRAMS[it.program].minSmarts ? it : undefined;
}

export function newGame(seed: number): GameState {
  const s: GameState = {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    seed,
    rngState: seed,
    nextId: 1,
    year: START_YEAR,
    phase: 'PLANNING',
    activeId: '',
    lineage: [],
    people: {},
    partnerships: [],
    bonds: {},
    households: {},
    plan: { alloc: {}, children: {}, jobIntents: [] },
    pending: [],
    resolvedEventUids: [],
    scheduled: [],
    lastFired: {},
    lastMajorYear: START_YEAR - 2,
    journal: [],
  };
  const rng = makeRng(seed);
  const hh = makeHousehold(s, rng.int(8000, 20000));
  const lastName = rng.pick(LAST_NAMES);
  const me = makePerson(s, rng, { birthYear: s.year - rng.int(32, 38), lastName, householdId: hh.id, generation: 1 });
  me.flags.came_of_age = 1;
  giveEducation(rng, me);
  const job = pickCareer(rng, me);
  if (job) {
    assignJob(me, job);
    me.jobYears = rng.int(1, 4);
  }
  s.activeId = me.id;
  s.lineage.push(me.id);

  // Your parents: retired, in their own home. Sometimes only one is still living.
  const parentsHh = makeHousehold(s, rng.int(20000, 90000));
  const parentBirth = me.birthYear - rng.int(26, 32);
  const mom = makePerson(s, rng, { sex: 'F', birthYear: parentBirth + rng.int(-2, 2), lastName, householdId: parentsHh.id, generation: 0 });
  const dad = makePerson(s, rng, { sex: 'M', birthYear: parentBirth + rng.int(-2, 2), lastName, householdId: parentsHh.id, generation: 0 });
  for (const p of [mom, dad]) {
    p.flags.came_of_age = 1;
    p.retired = ageOf(p, s.year) >= 64;
    if (!p.retired) assignJob(p, pickCareer(rng, p) ?? CAREERS[0]);
    else p.pension = rng.int(14000, 26000);
    p.stats.health = rng.int(50, 80);
    adjustBond(s, me.id, p.id, rng.int(20, 50), rng.int(20, 50));
  }
  s.partnerships.push({ id: newId(s, 'r'), a: mom.id, b: dad.id, status: 'married', startYear: parentBirth + 25, merged: true });
  if (rng.chance(0.3)) {
    const gone = rng.chance(0.5) ? mom : dad;
    gone.deathYear = s.year - rng.int(1, 8);
    gone.deathCause = 'illness';
    s.partnerships[s.partnerships.length - 1].status = 'widowed';
  }
  me.biologicalParents = [mom.id, dad.id];
  me.looks = inheritLooks(rng, mom.looks, dad.looks);

  const partner = makeAdultStranger(s, rng, me);
  delete s.households[partner.householdId];
  partner.householdId = hh.id;
  partner.lastName = lastName;
  s.partnerships.push({ id: newId(s, 'r'), a: me.id, b: partner.id, status: 'married', startYear: s.year - rng.int(6, 12), merged: true });
  adjustBond(s, me.id, partner.id, 40, 40);

  const kidAge = rng.int(7, 9);
  const kid = makePerson(s, rng, {
    birthYear: s.year - kidAge,
    lastName,
    householdId: hh.id,
    generation: 2,
    parents: [me.id, partner.id],
    looks: inheritLooks(rng, me.looks, partner.looks),
  });
  kid.stats.smarts = rng.int(30, 50);
  kid.stats.stress = 15;
  adjustBond(s, me.id, kid.id, 45, 40);
  adjustBond(s, partner.id, kid.id, 45, 40);

  if (rng.chance(0.5)) {
    const kid2 = makePerson(s, rng, {
      birthYear: s.year - rng.int(3, 5),
      lastName,
      householdId: hh.id,
      generation: 2,
      parents: [me.id, partner.id],
      looks: inheritLooks(rng, me.looks, partner.looks),
    });
    kid2.stats.smarts = rng.int(25, 40);
    kid2.stats.stress = 10;
    adjustBond(s, me.id, kid2.id, 50, 45);
    adjustBond(s, partner.id, kid2.id, 50, 45);
  }

  s.journal.push({ year: s.year, text: `Your story begins as ${me.firstName} ${lastName}, age ${ageOf(me, s.year)}.`, kind: 'major', who: me.id });
  s.plan = defaultPlan(s);
  s.rngState = rng.state();
  return s;
}

export const isLiving = alive;
