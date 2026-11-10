/**
 * Runtime schema for GameState. Imported saves are migrated, then validated
 * here (shape + referential integrity) before they can replace anything.
 */
import { z } from 'zod';
import { CARS, type CarKind } from '../content/finance';
import { BREEDS, type DogBreed } from '../content/dogs';
import { CITY_IDS, type CityId } from '../content/cities';
import type { GameState } from '../engine/types';

const num = z.number().finite();
const int = z.number().int();
const id = z.string().min(1);

const Stats = z.object({ health: num, happiness: num, smarts: num, fitness: num, stress: num });
const Hobby = z.enum(['music', 'sports', 'art']);
const Trait = z.enum(['ambitious', 'kind', 'stubborn', 'curious', 'anxious', 'easygoing', 'creative', 'athletic']);

const Person = z.object({
  id,
  firstName: z.string(),
  lastName: z.string(),
  sex: z.enum(['F', 'M']),
  birthYear: int,
  deathYear: int.optional(),
  deathCause: z.string().optional(),
  generation: int,
  stats: Stats,
  traits: z.array(Trait),
  skills: z.partialRecord(Hobby, num),
  hobby: Hobby.optional(),
  flags: z.record(z.string(), num),
  jobId: z.string().optional(),
  jobLevel: int,
  jobYears: int,
  workPerf: num,
  partJobId: z.string().optional(),
  partPerf: num,
  partYears: int,
  retired: z.boolean(),
  pension: num,
  studyingUntil: int.optional(),
  studyKind: z.enum(['university', 'trade', 'top']).optional(),
  grades: z.record(z.string(), num).optional(),
  fund: num,
  education: z.object({ program: z.enum(['degree', 'trade_cert']), progress: num, required: num, startYear: int }).optional(),
  careerYears: int.optional(),
  pensionYears: int.optional(),
  pensionSalary: num.optional(),
  retirementSavings: num.optional(),
  stake: num.optional(),
  householdId: id,
  biologicalParents: z.array(id),
  adoptiveParents: z.array(id),
  looks: z.object({ skin: int, hairColor: int, hairStyle: int, eyes: int, face: int, nose: int, facialHair: int, glasses: int, freckles: int }),
});

const Partnership = z.object({
  id,
  a: id,
  b: id,
  status: z.enum(['dating', 'married', 'separated', 'divorced', 'widowed', 'ended']),
  startYear: int,
  endYear: int.optional(),
  merged: z.boolean(),
});

const Asset = z.object({
  id,
  kind: z.enum(['house', 'car']),
  name: z.string(),
  value: num,
  upkeep: num,
  mortgage: num,
  payment: num.optional(),
  rate: num.optional(),
  capacity: int.optional(),
  garage: int.optional(),
  model: z.enum(Object.keys(CARS) as [CarKind, ...CarKind[]]).optional(),
  age: int.optional(),
  broken: z.boolean().optional(),
});

const Dog = z.object({
  id,
  name: z.string().max(40),
  breed: z.enum(Object.keys(BREEDS) as [DogBreed, ...DogBreed[]]),
  coat: int,
  birthYear: int,
  deathYear: int.optional(),
  bond: num,
  health: num,
  ownerId: id.optional(),
  trained: z.boolean().optional(),
  rescued: z.boolean().optional(),
  lastWalkYear: int.optional(),
});
const Household = z.object({
  id,
  wallet: num,
  assets: z.array(Asset),
  pendingBirth: z.object({ year: int, parents: z.tuple([id, id]) }).optional(),
  settled: z.boolean(),
  investments: num.optional(),
  rentTier: z.enum(['small', 'apartment', 'house']).optional(),
  headId: id.optional(),
  dogs: z.array(Dog).optional(),
  city: z.enum(CITY_IDS as [CityId, ...CityId[]]).optional(),
});

const ChildPlan = z.object({
  focus: z.enum(['free', 'studies', 'hobby']),
  suggestHobby: Hobby.optional(),
  tutoring: z.boolean(),
  lessons: z.boolean(),
  fundContribution: num,
});

const JobIntent = z.union([
  z.object({ kind: z.literal('quit'), slot: z.enum(['full', 'part']) }),
  z.object({ kind: z.literal('apply'), careerId: id }),
]);

const Plan = z.object({
  alloc: z.record(z.string(), int.nonnegative()),
  jobIntents: z.array(JobIntent),
  eduIntent: z.union([z.object({ kind: z.literal('enroll'), program: z.enum(['degree', 'trade_cert']) }), z.object({ kind: z.literal('drop') })]).optional(),
  lifestyle: z.enum(['frugal', 'comfortable', 'lavish']).optional(),
  retireContribution: num.optional(),
  children: z.record(z.string(), ChildPlan),
});

const PendingEvent = z.object({
  uid: id,
  eventId: id,
  subjectId: z.string().optional(),
  major: z.boolean(),
  title: z.string(),
  text: z.string(),
  choices: z.array(z.object({
    id, label: z.string(), hint: z.string().optional(), disabled: z.boolean().optional(),
    input: z.object({ label: z.string(), maxLength: int, placeholder: z.string().optional() }).optional(),
  })).min(1),
});

const JournalEntry = z.object({
  year: int,
  text: z.string(),
  kind: z.enum(['info', 'major', 'birth', 'death', 'good', 'bad']),
  who: z.string(),
});

export const GameStateSchema = z.object({
  schemaVersion: int,
  rulesVersion: z.string(),
  seed: num,
  rngState: int,
  nextId: int,
  year: int,
  phase: z.enum(['PLANNING', 'DECISIONS', 'RECAP', 'SUCCESSION', 'GAME_OVER']),
  activeId: id,
  lineage: z.array(id).min(1),
  people: z.record(z.string(), Person),
  partnerships: z.array(Partnership),
  bonds: z.record(z.string(), z.object({ affinity: num, trust: num })),
  households: z.record(z.string(), Household),
  plan: Plan,
  pending: z.array(PendingEvent),
  resolvedEventUids: z.array(z.string()),
  scheduled: z.array(z.object({ dueYear: int, eventId: id, subjectId: z.string().optional() })),
  lastFired: z.record(z.string(), int),
  lastMajorYear: int,
  journal: z.array(JournalEntry),
  snapshot: z.object({ stats: Stats, wallet: num, householdId: id }).optional(),
  recap: z
    .object({
      year: int,
      statDeltas: Stats.partial(),
      walletDelta: num,
      entries: z.array(JournalEntry),
      activeDied: z.boolean(),
    })
    .optional(),
  lastOutcome: z.object({ title: z.string(), text: z.string() }).optional(),
  lastBackupYear: int.optional(),
  energy: z.object({ year: int, max: num, used: num }).optional(),
  activityLog: z.array(z.object({ year: int, id: z.string() })).optional(),
  lastActivity: z.object({ id: z.string(), title: z.string(), text: z.string(), tone: z.enum(['good', 'bad', 'neutral']), changes: z.array(z.string()) }).optional(),
  friends: z.array(z.object({ id, of: id, since: int, lastSeen: int, distant: z.boolean().optional(), how: z.string().max(60).optional() })).optional(),
  tutorial: z.object({ personId: id, seen: z.array(z.string()) }).optional(),
});

// Compile-time guard: the schema's output must stay assignable to GameState.
type Parsed = z.infer<typeof GameStateSchema>;
const assertAssignable = (p: Parsed): GameState => p;
void assertAssignable;

/** Cross-references the schema can't express. Returns a list of problems. */
export function integrityProblems(s: GameState): string[] {
  const problems: string[] = [];
  const person = (pid: string | undefined, what: string) => {
    if (pid !== undefined && !s.people[pid]) problems.push(`${what} refers to missing person ${pid}`);
  };
  person(s.activeId, 'activeId');
  s.lineage.forEach((pid) => person(pid, 'lineage'));
  for (const p of Object.values(s.people)) {
    if (!s.households[p.householdId]) problems.push(`${p.id} lives in missing household ${p.householdId}`);
    [...p.biologicalParents, ...p.adoptiveParents].forEach((pid) => person(pid, `${p.id}.parents`));
  }
  for (const ps of s.partnerships) {
    person(ps.a, 'partnership');
    person(ps.b, 'partnership');
  }
  for (const pe of s.pending) person(pe.subjectId, `event ${pe.eventId}`);
  if (s.phase === 'DECISIONS' && !s.pending.length) problems.push('DECISIONS phase with no pending events');
  if (s.phase === 'RECAP' && !s.recap) problems.push('RECAP phase without a recap');
  if (s.phase === 'PLANNING' && s.people[s.activeId]?.deathYear !== undefined) problems.push('active character is dead while planning');
  if (s.nextId <= 0) problems.push('nextId must be positive');
  return problems;
}
