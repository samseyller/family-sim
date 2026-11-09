export type StatKey = 'health' | 'happiness' | 'smarts' | 'fitness' | 'stress';
export type Stats = Record<StatKey, number>;

export type Trait =
  | 'ambitious'
  | 'kind'
  | 'stubborn'
  | 'curious'
  | 'anxious'
  | 'easygoing'
  | 'creative'
  | 'athletic';

export type Hobby = 'music' | 'sports' | 'art';

/** Credentials earned through adult education; the id doubles as the person flag. */
export type Program = 'degree' | 'trade_cert';

/** Genome for the SVG avatar. Children inherit each gene from a parent. */
export interface Looks {
  skin: number;
  hairColor: number;
  hairStyle: number;
  eyes: number;
  face: number;
  nose: number;
  facialHair: number;
  glasses: number;
  freckles: number;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  sex: 'F' | 'M';
  birthYear: number;
  deathYear?: number;
  deathCause?: string;
  generation: number;
  stats: Stats;
  traits: Trait[];
  skills: Partial<Record<Hobby, number>>;
  hobby?: Hobby;
  /** Memories and counters, e.g. degree, resents, parent_missed_events. */
  flags: Record<string, number>;
  /** Full-time job. */
  jobId?: string;
  jobLevel: number;
  jobYears: number;
  workPerf: number;
  /** Part-time job (can be held alongside a full-time job). */
  partJobId?: string;
  partPerf: number;
  partYears: number;
  retired: boolean;
  pension: number;
  studyingUntil?: number;
  studyKind?: 'university' | 'trade';
  /** Money saved toward this person's future (college fund). */
  fund: number;
  /** Years worked full-time (state pension eligibility). */
  careerYears?: number;
  /** Years of service in jobs with an employer pension, and the best salary earned there. */
  pensionYears?: number;
  pensionSalary?: number;
  /** Personal retirement savings account. */
  retirementSavings?: number;
  /** Part-time adult education (night school) in progress. */
  education?: { program: Program; progress: number; required: number; startYear: number };
  householdId: string;
  biologicalParents: string[];
  adoptiveParents: string[];
  looks: Looks;
}

export type PartnershipStatus = 'dating' | 'married' | 'separated' | 'divorced' | 'widowed' | 'ended';

export interface Partnership {
  id: string;
  a: string;
  b: string;
  status: PartnershipStatus;
  startYear: number;
  endYear?: number;
  /** True once the two households' finances have merged (happens once). */
  merged: boolean;
}

export interface Bond {
  affinity: number;
  trust: number;
}

export interface Asset {
  id: string;
  kind: 'house' | 'car';
  name: string;
  value: number;
  upkeep: number;
  /** Remaining loan balance (mortgage or car loan). */
  mortgage: number;
  /** Fixed yearly loan payment; older saves fall back to the legacy $18k cap. */
  payment?: number;
  /** Loan interest rate. */
  rate?: number;
  /** Homes: how many people fit comfortably. */
  capacity?: number;
}

/** Money and assets belong to the household. Members are derived from Person.householdId. */
export interface Household {
  id: string;
  wallet: number;
  assets: Asset[];
  pendingBirth?: { year: number; parents: [string, string] };
  /** Set when an emptied household's estate has been distributed (never twice). */
  settled: boolean;
  /** Investment account balance. */
  investments?: number;
  /** Size of the rental when the household has no home of its own. */
  rentTier?: 'small' | 'apartment' | 'house';
}

export type ChildFocus = 'free' | 'studies' | 'hobby';

export interface ChildPlan {
  focus: ChildFocus;
  suggestHobby?: Hobby;
  tutoring: boolean;
  lessons: boolean;
  fundContribution: number;
}

export type JobIntent = { kind: 'quit'; slot: 'full' | 'part' } | { kind: 'apply'; careerId: string };

export interface Plan {
  /** Time blocks per action key, e.g. "work", "parttime", "child_time:p7". */
  alloc: Record<string, number>;
  /** At most one intent per job slot (full-time, part-time). */
  jobIntents: JobIntent[];
  /** Enroll in night school or drop out, decided when the year resolves. */
  eduIntent?: { kind: 'enroll'; program: Program } | { kind: 'drop' };
  /** How much of the household's discretionary money goes to lifestyle (default comfortable). */
  lifestyle?: 'frugal' | 'comfortable' | 'lavish';
  /** Share of pay put into retirement savings (0, 0.05, 0.1, 0.15). */
  retireContribution?: number;
  children: Record<string, ChildPlan>;
}

export interface PendingChoice {
  id: string;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** Ask the player to type something (e.g. a name); the text is passed to resolve. */
  input?: { label: string; maxLength: number; placeholder?: string };
}

export interface PendingEvent {
  uid: string;
  eventId: string;
  subjectId?: string;
  major: boolean;
  title: string;
  text: string;
  choices: PendingChoice[];
}

export interface Scheduled {
  dueYear: number;
  eventId: string;
  subjectId?: string;
}

export type JournalKind = 'info' | 'major' | 'birth' | 'death' | 'good' | 'bad';

export interface JournalEntry {
  year: number;
  text: string;
  kind: JournalKind;
  /** Active character when this happened (for the memorial). */
  who: string;
}

export interface Recap {
  year: number;
  statDeltas: Partial<Stats>;
  walletDelta: number;
  entries: JournalEntry[];
  activeDied: boolean;
}

export type Phase = 'PLANNING' | 'DECISIONS' | 'RECAP' | 'SUCCESSION' | 'GAME_OVER';

export interface GameState {
  schemaVersion: number;
  rulesVersion: string;
  seed: number;
  /** Current RNG state (not just the seed), so reloads continue identically. */
  rngState: number;
  nextId: number;
  year: number;
  phase: Phase;
  activeId: string;
  lineage: string[];
  people: Record<string, Person>;
  partnerships: Partnership[];
  bonds: Record<string, Bond>;
  households: Record<string, Household>;
  plan: Plan;
  pending: PendingEvent[];
  resolvedEventUids: string[];
  scheduled: Scheduled[];
  lastFired: Record<string, number>;
  lastMajorYear: number;
  journal: JournalEntry[];
  snapshot?: { stats: Stats; wallet: number; householdId: string };
  recap?: Recap;
  lastOutcome?: { title: string; text: string };
  /** Year of the last exported backup (drives backup reminders). */
  lastBackupYear?: number;
  /** This year's activity energy (max depends on health and stress). */
  energy?: { year: number; max: number; used: number };
  /** Activities done, for per-year limits and achievements (most recent ~300). */
  activityLog?: { year: number; id: string }[];
  /** Result of the most recent activity, shown on its outcome card. */
  lastActivity?: ActivityResult;
  /** Guided first playthrough: who is being guided, and which tips have been seen. */
  tutorial?: { personId: string; seen: string[] };
}

export interface ActivityResult {
  id: string;
  title: string;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
  /** Changes to show: e.g. "Happiness +6", "Bond with Maya +8", "-$800". */
  changes: string[];
}
