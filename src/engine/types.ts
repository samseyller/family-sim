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

export type Hobby = 'music' | 'sports' | 'art' | 'flying' | 'woodworking' | 'fishing' | 'cooking' | 'mechanics' | 'gardening';

/** Credentials earned through adult education; the id doubles as the person flag. */
export type Program = 'degree' | 'trade_cert' | 'ppl' | 'cpl' | 'carpentry_cert' | 'auto_cert' | 'culinary_cert' | 'captains_license';

/** Genome for the SVG avatar. Children inherit each gene from a parent. */
/** What someone wants from life right now (see fulfillment.ts). */
export type Aspiration = 'connection' | 'mastery' | 'achievement' | 'exploration' | 'security' | 'service';

/** A soft preference for how someone likes to be cared for. */
export type Connection = 'time' | 'support' | 'experiences' | 'space';

/** Something a person remembers about someone else (`of`). */
export interface Memory {
  kind: 'missed' | 'pressure' | 'support' | 'promise_kept' | 'promise_broken';
  of: string;
  year: number;
}

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
  /** Someone you're secretly seeing while in a relationship. */
  secretPartnerId?: string;
  /** Which sport, when the hobby is sports; skill per sport is kept (skills.sports is the current one). */
  sport?: import('../content/sports').SportId;
  sportSkills?: Partial<Record<import('../content/sports').SportId, number>>;
  /** A sports club membership (golf, tennis, swim), paid yearly. */
  club?: import('../content/sports').SportId;
  /** Natural athletic ceiling (hidden; rolled the first time it matters). Most people peak below pro level. */
  athleticCeiling?: number;
  /** Memories and counters, e.g. degree, resents, parent_missed_events. */
  flags: import('./flags').Flags;
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
  studyKind?: 'university' | 'trade' | 'top';
  /** School grades (0–4) by age, 6–17. */
  grades?: Record<string, number>;
  /** Money saved toward this person's future (college fund). */
  fund: number;
  /** Years worked full-time (state pension eligibility). */
  careerYears?: number;
  /** Years of service in jobs with an employer pension, and the best salary earned there. */
  pensionYears?: number;
  pensionSalary?: number;
  /** Personal retirement savings account. */
  retirementSavings?: number;
  /** Claim on the household's savings and investments, weighted by what this person has put in. */
  stake?: number;
  /** Part-time adult education (night school) in progress. */
  education?: { program: Program; progress: number; required: number; startYear: number };
  /** What they want from life right now (chosen at adulthood, or suggested from their interests). */
  aspiration?: Aspiration;
  /** Earlier aspirations, oldest first (at most four), for memorials and continuity. */
  pastAspirations?: { aspiration: Aspiration; until: number }[];
  /** 0–100, slow: how well life has been serving their aspiration (set once simulated). */
  fulfillment?: number;
  /** How they most like to be cared for (set once it has changed; otherwise derived: see relationships.ts). */
  connection?: Connection;
  /** A few things they remember about how someone treated them (bounded and fading; see relationships.ts). */
  memories?: Memory[];
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
  kind: 'house' | 'car' | 'gear';
  /** Gear: which item (plane, boat, project car), and restoration progress 0–100 for project cars. */
  gear?: import('../content/gear').GearId;
  restore?: number;
  name: string;
  value: number;
  upkeep: number;
  /** Remaining loan balance (mortgage or car loan). */
  mortgage: number;
  /** Fixed yearly loan payment; older saves fall back to the legacy $18k cap. */
  payment?: number;
  /** Loan interest rate. */
  rate?: number;
  /** Homes: luxury upgrades (an addition can appear up to 3 times). */
  upgrades?: string[];
  /** Homes: garage spaces (adds to the 2 parking spots every home has). */
  garage?: number;
  /** Cars: model id, years on the road, and whether it has died for good. */
  model?: import('../content/finance').CarKind;
  age?: number;
  broken?: boolean;
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
  /** Which city this household lives in. */
  city?: import('../content/cities').CityId;
  /** Optional flood insurance on an owned home. */
  floodInsurance?: boolean;
  /** Pet dogs (including ones that have passed away, for memory). */
  dogs?: Dog[];
  /** Pet cats (including ones that have passed away). */
  cats?: Cat[];
  /** A cat tree at home: happier cats, fewer scratched couches. */
  catTree?: boolean;
  /** Who runs the household (owns the home, decides who lives here). Falls back by age when unset. */
  headId?: string;
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
  /** Picked by chance from this year's circumstances: dropped if an earlier decision makes it moot. */
  recheck?: boolean;
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
  /** A story coming back (a follow-up or a recognized pattern): the year in review shows these first. */
  story?: boolean;
}

/** Long-running patterns in a life that can matter years later (see engine/threads.ts). */
export type ThreadKind = 'strain' | 'supported' | 'encouraged' | 'pushed' | 'siblings' | 'work_first' | 'trained' | 'missed_chance' | 'aspiration' | 'moved' | 'retired' | 'loss' | 'pattern' | 'tradition';

export interface Thread {
  kind: ThreadKind;
  /** The played character whose story this is. */
  ownerId: string;
  /** Who it concerns, if anyone. */
  subjectId?: string;
  /** What it is about (a hobby, a program, a city, a job, an aspiration, a sibling's id). */
  detail?: string;
  since: number;
  /** Distinct years the pattern showed up (most recent few). */
  hits: number[];
  /** Distinct years it was answered (showing up after a strain, siblings clashing...). */
  answers?: number[];
  /** Last year a follow-up raised it (so the same conflict isn't raised every year). */
  shown?: number;
  /** Year it resolved, faded or ended, and how. */
  closed?: number;
  outcome?: string;
  /** Passed on at succession from this character. */
  inherited?: string;
  /** Traditions: all years kept, and who took part (person id → times). */
  count?: number;
  takers?: Record<string, number>;
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
  activityLog?: { year: number; id: string; with?: number }[];
  /** Result of the most recent activity, shown on its outcome card. */
  lastActivity?: ActivityResult;
  /** Friendships of player characters (friends are ordinary people with their own homes). */
  friends?: Friendship[];
  /** Guided first playthrough: who is being guided, and which tips have been seen. */
  tutorial?: { personId: string; seen: string[] };
  /** Story threads: bounded records of patterns that can matter years later (engine/threads.ts). */
  threads?: Thread[];
}

export interface ActivityResult {
  id: string;
  title: string;
  text: string;
  tone: 'good' | 'bad' | 'neutral';
  /** Changes to show: e.g. "Happiness +6", "Bond with Maya +8", "-$800". */
  changes: string[];
}

export interface Dog {
  id: string;
  name: string;
  breed: import('../content/dogs').DogBreed;
  /** Index into the breed's coat colors (fixed for life). */
  coat: number;
  birthYear: number;
  deathYear?: number;
  /** 0–100: how close the dog is to the family. */
  bond: number;
  /** 0–100. */
  health: number;
  /** The dog moves with this person when households split. */
  ownerId?: string;
  trained?: boolean;
  rescued?: boolean;
  lastWalkYear?: number;
}

export interface Friendship {
  /** The friend's person id. */
  id: string;
  /** The player character whose friend they are. */
  of: string;
  since: number;
  /** Last year you did something together (calls count). */
  lastSeen: number;
  /** Set once the friendship has faded to nothing (affinity 0 or below). */
  distant?: boolean;
  /** How you met ("from work", "at the dog park"...). */
  how?: string;
}

export interface Cat {
  id: string;
  name: string;
  breed: import('../content/cats').CatBreed;
  /** Index into the breed's coat colors (fixed for life). */
  coat: number;
  birthYear: number;
  deathYear?: number;
  /** 0–100: how close the cat is to the family (on the cat's terms). */
  bond: number;
  /** 0–100. */
  health: number;
  /** The cat moves with this person when households split. */
  ownerId?: string;
  /** Came from the shelter, or showed up at the door. */
  rescued?: boolean;
  stray?: boolean;
  lastPlayYear?: number;
}
