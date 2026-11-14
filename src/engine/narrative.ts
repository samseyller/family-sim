/**
 * Narrative context: the true story of a life, told from what the game recorded.
 *
 * Everything here is pure and read-only. Facts come only from recorded state (story threads, aspiration history,
 * jobs, skills, children and bonds, friendships), each names only people who exist, and each carries the people and
 * years it rests on so tests can check it. Facts are written in the second person ("You backed Ben's music for six
 * years.") and retold in the third person for memorials and succession (`retell`). Selection keeps the strongest few
 * and never two of the same kind, so no single trait or aspiration dominates; template variants are picked by a
 * stable hash, so the same life always reads the same way and different lives read differently.
 *
 * Used by: coming of age and a few family and career events (a sentence of context), the year in review (story
 * lines and life-so-far notes), succession (what the two generations shared), and the memorial.
 */
import { HOBBY_BY_ID } from '../content/actions';
import { CAREER_BY_ID, PROGRAMS, jobTitle } from '../content/careers';
import { ASPIRATION_INFO } from './fulfillment';
import { cityName } from './location';
import { stableHash } from './relationships';
import type { CityId } from '../content/cities';
import type { Aspiration, GameState, Hobby, JournalEntry, Person, Thread } from './types';
import { ageOf, alive, childrenOf, getBond, retell } from './util';

export interface StoryFact {
  /** The kind of fact (stable; one of each kind is told at most). */
  id: string;
  /** How much it says about this life (strongest first). */
  weight: number;
  /** Everyone it names (all exist in the save). */
  people: string[];
  /** The years it rests on. */
  years: number[];
  /** Second person, past tense ("You backed Ben's music for six years."). */
  text: string;
}

export const hobbyName = (h: string) => (h === 'sports' ? 'sports' : HOBBY_BY_ID[h as Hobby]?.label.toLowerCase() ?? h);
const aspLabel = (a: string) => ASPIRATION_INFO[a as Aspiration]?.label.toLowerCase() ?? a;
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const num = (n: number) => NUM[n] ?? String(n);
const parentWord = (p: Person) => (p.sex === 'F' ? 'mother' : 'father');
const siblingWord = (p: Person) => (p.sex === 'F' ? 'sister' : 'brother');
const kidWord = (p: Person) => (p.sex === 'F' ? 'daughter' : 'son');
/** One of several phrasings, the same every time for the same seed. */
const variant = <T>(key: string, options: T[]) => options[stableHash(key) % options.length];
const fact = (id: string, weight: number, people: string[], years: number[], text: string): StoryFact => ({ id, weight, people, years, text });
const exists = (s: GameState, id?: string): id is string => !!id && !!s.people[id];

/** The strongest facts, one of each kind. */
export function pickFacts(facts: StoryFact[], n: number): StoryFact[] {
  const seen = new Set<string>();
  const out: StoryFact[] = [];
  for (const f of [...facts].sort((a, b) => b.weight - a.weight || (a.id < b.id ? -1 : 1))) {
    const kind = f.id.split(':')[0];
    if (seen.has(kind)) continue;
    seen.add(kind);
    out.push(f);
    if (out.length >= n) break;
  }
  return out;
}

/** A fact retold about someone by name ("Ann backed Ben's music for six years."). */
export const tell = (f: StoryFact, p: Person) => retell(f.text, p.firstName);

// ── A whole life ─────────────────────────────────────────────────────

/** What a played character's life was about, from their own story threads and record. */
export function lifeStory(s: GameState, p: Person): StoryFact[] {
  const out: StoryFact[] = [];
  const mine = (s.threads ?? []).filter((t) => t.ownerId === p.id);
  const name = (id?: string) => (exists(s, id) ? s.people[id].firstName : undefined);
  const they = (id: string) => (s.people[id].sex === 'F' ? 'she' : 'he');

  for (const t of mine) {
    const sub = name(t.subjectId);
    const end = t.closed ?? s.year;
    switch (`${t.kind}:${t.outcome ?? 'open'}`) {
      case 'aspiration:milestone':
        out.push(fact('aspiration', 4, [], [t.hits[0], end], variant(`${s.seed}:${p.id}:asp`, [`You lived for ${aspLabel(t.detail!)}, and found it.`, `You wanted ${aspLabel(t.detail!)} from life, and for years you had it.`])));
        break;
      case 'strain:reconciled':
        if (sub) out.push(fact(`mended:${t.subjectId}`, 3.2, [t.subjectId!], [t.hits[0], end], `You and ${sub} drifted apart, then found your way back in ${end}.`));
        break;
      case 'strain:drifted':
        if (sub) out.push(fact(`drifted:${t.subjectId}`, 1.4, [t.subjectId!], [end], `You and ${sub} grew apart.`));
        break;
      case 'encouraged:thanked':
        if (sub) out.push(fact(`backed:${t.subjectId}`, 3.4, [t.subjectId!], [...t.hits, end], `You backed ${sub}’s ${hobbyName(t.detail!)} for years, and ${sub} never forgot it.`));
        break;
      case 'encouraged:open': case 'encouraged:ended': case 'encouraged:faded':
        if (sub && t.hits.length >= 3) out.push(fact(`backed:${t.subjectId}`, 2.4, [t.subjectId!], t.hits, `You backed ${sub}’s ${hobbyName(t.detail!)} for ${num(t.hits.length)} years.`));
        break;
      case 'pushed:apologized':
        if (sub) out.push(fact(`pushed:${t.subjectId}`, 2, [t.subjectId!], [end], `You pushed ${sub} hard, and later said you were sorry.`));
        break;
      case 'pushed:unresolved':
        if (sub) out.push(fact(`pushed:${t.subjectId}`, 1.6, [t.subjectId!], t.hits, `You pushed ${sub} hard, and the two of you never quite settled it.`));
        break;
      case 'supported:grateful':
        if (sub) out.push(fact(`stood_by:${t.subjectId}`, 2.6, [t.subjectId!], [...t.hits, end], `You stood by ${sub} through hard years, and ${they(t.subjectId!)} repaid it.`));
        break;
      case 'trained:paid_off':
        out.push(fact('studied', 2.2, [], [t.since, end], `You earned a ${PROGRAMS[t.detail as keyof typeof PROGRAMS]?.short.toLowerCase() ?? 'credential'} at night school in ${t.since}, and it paid off.`));
        break;
      case 'missed_chance:took_it':
        out.push(fact('second_chance', 2, [], [t.since, end], `You turned down a step up in ${t.since}, and took it when it came back in ${end}.`));
        break;
      case 'missed_chance:content':
        out.push(fact('second_chance', 2, [], [t.since, end], 'You turned down a step up, twice, for the life you wanted.'));
        break;
      case 'loss:open': case 'loss:faded': case 'loss:ended': {
        const lost = exists(s, t.subjectId) ? s.people[t.subjectId] : undefined;
        if (!lost || lost.deathYear === undefined) break;
        const child = lost.biologicalParents.includes(p.id) || lost.adoptiveParents.includes(p.id);
        const partner = s.partnerships.some((ps) => (ps.a === p.id && ps.b === lost.id) || (ps.b === p.id && ps.a === lost.id));
        const rel = child ? `your ${kidWord(lost)}, ${lost.firstName},` : partner ? `${lost.firstName}, your ${lost.sex === 'F' ? 'wife' : 'husband'},` : `your ${parentWord(lost)}, ${lost.firstName},`;
        out.push(fact(`loss:${lost.id}`, child ? 2.4 : partner ? 2 : 1.4, [lost.id], [lost.deathYear], `You lost ${rel} in ${lost.deathYear}.`));
        break;
      }
      case 'moved:visited': case 'moved:called': case 'moved:faded': case 'moved:open':
        out.push(fact('moved', 1, [], [t.since], `You left ${cityName(t.detail as CityId)} in ${t.since}.`));
        break;
      default:
        if (t.kind === 'retired' && t.outcome && ASPIRATION_INFO[t.outcome as Aspiration]) out.push(fact('retired', 2, [], [end], `After retiring, you found new purpose in ${aspLabel(t.outcome)}.`));
        if (t.kind === 'pattern') { const f = patternFact(s, t); if (f) out.push(f); }
    }
  }

  // Aspirations that changed along the way.
  const retiredInto = mine.find((t) => t.kind === 'retired' && t.outcome)?.outcome;
  if (p.pastAspirations?.length && p.aspiration && retiredInto !== p.aspiration) {
    const first = p.pastAspirations[0];
    out.push(fact('changed_aim', 1.5, [], [first.until], `You wanted ${aspLabel(first.aspiration)} early on, and ${aspLabel(p.aspiration)} later.`));
  }
  // Work.
  const lastJob = p.jobId ? CAREER_BY_ID[p.jobId] : retiredFrom(s, p);
  const years = p.careerYears ?? 0;
  if (lastJob && (years >= 20 || p.jobLevel >= 3)) {
    const title = p.jobId ? jobTitle(p).toLowerCase() : lastJob.name.toLowerCase();
    const an = /^[aeiou]/.test(title) ? 'an' : 'a';
    const working = alive(p) && !!p.jobId;
    const text = years < 5 ? `You became ${an} ${title}.`
      : working ? `You have worked ${years} years, now as ${an} ${title}.`
      : p.jobLevel >= 3 && p.jobId ? `You worked ${years} years and rose to ${an} ${title}.` : `You worked ${years} years, the last of them as ${an} ${title}.`;
    out.push(fact('career', 1.8 + (p.jobLevel >= 3 ? 0.8 : 0), [], [], text));
  }
  // An interest that became part of who they were.
  const [skill, lvl] = (Object.entries(p.skills) as [Hobby, number][]).sort((a, b) => b[1] - a[1])[0] ?? [];
  if (skill && lvl >= 70) {
    const living = lastJob?.skill === skill;
    out.push(fact('craft', 2.5 + (living ? 0.8 : 0), [], [], living ? `You made a living from ${hobbyName(skill)}.` : variant(`${s.seed}:${p.id}:craft`, [`${cap(hobbyName(skill))} became part of who you were.`, `You spent a lifetime getting good at ${hobbyName(skill)}.`])));
  }
  // Children and how close they were.
  const kids = childrenOf(s, p.id);
  if (kids.length) {
    const bonds = kids.map((k) => getBond(s, p.id, k.id).affinity);
    const close = bonds.every((b) => b >= 40);
    const n = `${num(kids.length)} ${kids.length === 1 ? 'child' : 'children'}`;
    out.push(fact('children', close ? 2.8 : 1, kids.map((k) => k.id), [], close
      ? variant(`${s.seed}:${p.id}:kids`, [`You raised ${n} and stayed close to ${kids.length === 1 ? 'them' : 'every one'}.`, `You raised ${n}, and your door was always open to them.`, `You raised ${n}, and they kept calling home.`])
      : variant(`${s.seed}:${p.id}:kids`, [`You raised ${n}.`, `You brought up ${n}.`])));
  }
  return out;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** The last job recorded at retirement, if any. */
function retiredFrom(s: GameState, p: Person) {
  const t = (s.threads ?? []).find((x) => x.ownerId === p.id && x.kind === 'retired' && x.detail);
  return t ? CAREER_BY_ID[t.detail!] : undefined;
}

// ── Patterns (recognized by patterns.ts, told here) ───────────────────

/** Family activities that can become a tradition, and how the story names them. */
export const TRADITIONS: Record<string, string> = {
  game_night: 'Game night', cook_together: 'Cooking dinner together', movie_marathon: 'Movie marathon night',
  garden: 'The family garden', park: 'Saturdays at the park', road_trip: 'The summer road trip', getaway: 'The weekend getaway',
  vacation: 'The beach vacation', host_holiday: 'Holiday dinner at your place', family_reunion: 'The family reunion',
  ball_game: 'Going to the ball game', concert: 'Concert night', world_trip: 'Traveling abroad together',
};

/** The fact behind a recognized pattern, if the people it names still exist. */
export function patternFact(s: GameState, t: Thread): StoryFact | undefined {
  const [kind, arg] = (t.detail ?? '').split(':');
  const sub = exists(s, t.subjectId) ? s.people[t.subjectId] : undefined;
  const year = t.closed ?? t.since;
  switch (kind) {
    case 'tradition': return TRADITIONS[arg] ? fact('tradition', 2.4, [], t.hits, `You made ${TRADITIONS[arg].charAt(0).toLowerCase()}${TRADITIONS[arg].slice(1)} a family tradition.`) : undefined;
    case 'friend': return sub ? fact('friend', 2.2, [sub.id], [t.since], `You and ${sub.firstName} were friends for ${year - t.since} years.`) : undefined;
    case 'following': return sub ? fact('following', 2.6, [sub.id], [year], `Your ${kidWord(sub)} ${sub.firstName} followed in your footsteps.`) : undefined;
    case 'own_path': return sub ? fact('own_path', 1.8, [sub.id], [year], `Your ${kidWord(sub)} ${sub.firstName} went their own way.`) : undefined;
    case 'recovered': return sub ? fact('recovered', 2.4, [sub.id], [t.since, year], `You and ${sub.firstName} grew close again after a hard stretch.`) : undefined;
    case 'identity': return fact('identity', 2.3, [], [year], `${cap(hobbyName(arg))} became part of who you were.`);
    case 'reconsidered': return fact('reconsidered', 2.4, [], [year], 'After years of chasing the next promotion, your priorities changed.');
    default: return undefined;
  }
}

// ── Childhood (coming of age) ────────────────────────────────────────

/** What shaped a childhood, from the parents' recorded threads about this child (second person). */
export function childhoodFacts(s: GameState, child: Person): StoryFact[] {
  const out: StoryFact[] = [];
  const parents = new Set([...child.biologicalParents, ...child.adoptiveParents]);
  for (const t of s.threads ?? []) {
    if (!parents.has(t.ownerId) || !exists(s, t.ownerId)) continue;
    const parent = s.people[t.ownerId];
    const pw = `your ${parentWord(parent)}`;
    if (t.kind === 'encouraged' && t.subjectId === child.id && t.hits.length >= 2) {
      out.push(fact('backed', 3 + t.hits.length * 0.1, [parent.id], t.hits, variant(`${s.seed}:${child.id}:backed`, [
        `${cap(pw)} backed your ${hobbyName(t.detail!)} for ${num(t.hits.length)} years.`,
        `Years of ${hobbyName(t.detail!)}, with ${pw} in your corner, shaped you.`,
      ])));
    } else if (t.kind === 'pushed' && t.subjectId === child.id && t.hits.length >= 2) {
      out.push(fact('pushed', 2.6, [parent.id], t.hits, `${cap(pw)} pushed you hard, and you pushed back.`));
    } else if (t.kind === 'strain' && t.subjectId === child.id) {
      out.push(t.outcome === 'reconciled'
        ? fact('strain', 2.4, [parent.id], [t.closed!], `You and ${pw} went through a hard stretch, and came out of it.`)
        : fact('strain', 2.2, [parent.id], t.hits, `Things with ${pw} have been strained since ${t.hits[0]}.`));
    } else if (t.kind === 'siblings' && (t.subjectId === child.id || t.detail === child.id)) {
      const other = t.subjectId === child.id ? t.detail : t.subjectId;
      if (!exists(s, other)) continue;
      const sib = s.people[other];
      const clashes = t.answers?.length ?? 0;
      const bonded = t.hits.length - clashes;
      if (bonded >= 2) out.push(fact('sibling', 2, [sib.id], t.hits, `You and your ${siblingWord(sib)} ${sib.firstName} were inseparable.`));
      else if (clashes >= 2) out.push(fact('sibling', 1.6, [sib.id], t.answers!, `You and your ${siblingWord(sib)} ${sib.firstName} fought more than you got along.`));
    } else if (t.kind === 'loss' && exists(s, t.subjectId)) {
      const lost = s.people[t.subjectId];
      if (lost.id === child.id || lost.deathYear === undefined || lost.deathYear - child.birthYear >= 18 || lost.deathYear < child.birthYear) continue;
      const age = lost.deathYear - child.birthYear;
      const rel = parents.has(lost.id) ? `your ${parentWord(lost)}` : lost.biologicalParents.some((x) => child.biologicalParents.includes(x)) ? `your ${siblingWord(lost)} ${lost.firstName}` : `${lost.firstName}`;
      out.push(fact('loss', parents.has(lost.id) ? 3.5 : 2.2, [lost.id], [lost.deathYear], `You lost ${rel} when you were ${age}.`));
    }
  }
  if (child.flags.serious_interest && child.hobby) out.push(fact('serious', 1.8, [], [child.flags.serious_interest], `You decided to take ${hobbyName(child.hobby)} seriously at ${child.flags.serious_interest - child.birthYear}.`));
  if (child.flags.independent) out.push(fact('independent', 1.2, [], [child.flags.independent], `You fought for your independence at ${child.flags.independent - child.birthYear}.`));
  return out;
}

/** A sentence or two about what shaped this childhood ('' when nothing notable was recorded). */
export function childhoodNote(s: GameState, child: Person): string {
  return pickFacts(childhoodFacts(s, child), 2).map((f) => f.text).join(' ');
}

// ── Relationships, succession, careers ───────────────────────────────

/** Context for an event about someone close: a strain, or a strain that mended (second person). '' when neither. */
export function relationshipNote(s: GameState, me: Person, p: Person): string {
  const ts = (s.threads ?? []).filter((t) => t.ownerId === me.id && t.subjectId === p.id && t.kind === 'strain');
  const open = ts.find((t) => t.closed === undefined && t.hits.length >= 2);
  if (open) return `Things between you and ${p.firstName} have been strained since ${open.hits[0]}.`;
  const mended = ts.find((t) => t.outcome === 'reconciled' && s.year - t.closed! <= 15);
  if (mended) return `You and ${p.firstName} have been close again since ${mended.closed}.`;
  return '';
}

/** What a passing character and the heir shared (third person). '' when nothing was recorded. */
export function successionNote(s: GameState, prev: Person, heir: Person): string {
  const out: StoryFact[] = [];
  for (const t of s.threads ?? []) {
    if (t.ownerId === prev.id && t.subjectId === heir.id) {
      if (t.kind === 'encouraged' && t.hits.length >= 2) out.push(fact('backed', 3, [heir.id], t.hits, `${prev.firstName} backed ${heir.firstName}’s ${hobbyName(t.detail!)} for years${heir.hobby === t.detail ? `, and ${heir.firstName} still keeps at it` : ''}.`));
      if (t.kind === 'strain' && t.outcome === 'reconciled') out.push(fact('mended', 2.8, [heir.id], [t.closed!], `${prev.firstName} and ${heir.firstName} found their way back to each other in ${t.closed}.`));
      if (t.kind === 'strain' && t.outcome !== 'reconciled' && t.hits.length >= 2) out.push(fact('strain', 2.2, [heir.id], t.hits, `${prev.firstName} and ${heir.firstName} never fully mended things.`));
      if (t.kind === 'pushed' && t.hits.length >= 2) out.push(fact('pushed', 2, [heir.id], t.hits, `${prev.firstName} pushed ${heir.firstName} hard when ${heir.firstName} was young.`));
    }
    if (t.ownerId === heir.id && t.inherited === prev.id && exists(s, t.subjectId)) {
      out.push(fact('owed', 2.5, [t.subjectId], t.hits, `${s.people[t.subjectId].firstName} still remembers how ${prev.firstName} stood by them.`));
    }
  }
  return pickFacts(out, 2).map((f) => f.text).join(' ');
}

/** What a career has meant, for the retirement decision (second person; '' if nothing notable). */
export function careerNote(s: GameState, me: Person): string {
  const facts = lifeStory(s, me).filter((f) => ['studied', 'second_chance', 'career'].includes(f.id));
  return pickFacts(facts, 1).map((f) => f.text).join(' ');
}

/** A grown-up interest you backed, as context for a child's graduation (second person; '' if none recorded). */
export function interestNote(s: GameState, me: Person, kid: Person): string {
  const t = (s.threads ?? []).find((x) => x.ownerId === me.id && x.kind === 'encouraged' && x.subjectId === kid.id && x.detail === kid.hobby);
  if (!t || t.hits.length < 3 || (kid.skills[kid.hobby!] ?? 0) < 45) return '';
  return `After ${num(t.hits.length)} years of you backing ${kid.sex === 'F' ? 'her' : 'his'} ${hobbyName(t.detail!)}, ${kid.firstName} has started thinking seriously about it.`;
}

/** A grandparent who didn't live to meet a new baby (second person; '' if none in the last ten years). */
export function birthNote(s: GameState, me: Person): string {
  const lost = (s.threads ?? []).filter((t) => t.ownerId === me.id && t.kind === 'loss' && exists(s, t.subjectId))
    .map((t) => s.people[t.subjectId!])
    .find((p) => p.deathYear !== undefined && s.year - p.deathYear <= 10 && (me.biologicalParents.includes(p.id) || me.adoptiveParents.includes(p.id)));
  return lost ? ` Your ${parentWord(lost)}, ${lost.firstName}, didn’t live to meet them.` : '';
}

// ── Memorial ─────────────────────────────────────────────────────────

/** What a life is remembered for, from its strongest true facts (undefined: use the plain fallback). */
export function rememberedFor(s: GameState, p: Person): string | undefined {
  const facts = lifeStory(s, p);
  const has = (id: string) => facts.some((f) => f.id.split(':')[0] === id);
  const asp = (s.threads ?? []).find((t) => t.ownerId === p.id && t.kind === 'aspiration' && t.outcome === 'milestone')?.detail;
  // What they wanted at any point in life (current or earlier).
  const wanted = new Set([p.aspiration, ...(p.pastAspirations ?? []).map((x) => x.aspiration)].filter(Boolean));
  const kids = childrenOf(s, p.id);
  const kidBond = kids.length ? kids.reduce((n, k) => n + getBond(s, p.id, k.id).affinity, 0) / kids.length : 0;
  const closeKids = kids.length > 0 && kidBond >= 30;
  const workFirst = (s.threads ?? []).some((t) => t.ownerId === p.id && t.kind === 'work_first' && t.hits.length >= 3);
  const job = p.jobId ? CAREER_BY_ID[p.jobId] : retiredFrom(s, p);
  const [skill, lvl] = (Object.entries(p.skills) as [Hobby, number][]).sort((a, b) => b[1] - a[1])[0] ?? [];
  // Each candidate scores from the facts that support it; the strongest wins.
  const scores: [string, number][] = [
    ['a life devoted to family', (closeKids ? 2 + kids.length * 0.3 : 0) + (asp === 'connection' ? 2 : wanted.has('connection') ? 0.8 : 0) + (has('mended') ? 1 : 0) + (has('backed') ? 1 : 0) + (has('tradition') ? 1 : 0) - (workFirst ? 1 : 0)],
    [`mastering ${skill ? hobbyName(skill) : 'a craft'}`, (lvl >= 70 ? 2 + (lvl - 70) / 10 : 0) + (asp === 'mastery' ? 2 : wanted.has('mastery') ? 0.5 : 0) + (job?.skill === skill && lvl >= 70 ? 1 : 0)],
    [job?.startup ? 'building something of their own' : `a driven career${job ? ` as ${/^[aeiou]/i.test(job.name) ? 'an' : 'a'} ${job.name.toLowerCase()}` : ''}`, (p.jobLevel >= 3 ? 1.2 : 0) + (job?.startup ? 1.5 : 0) + (asp === 'achievement' ? 2 : wanted.has('achievement') ? 0.8 : 0) + (workFirst ? 1 : 0) + (has('second_chance') || has('studied') ? 0.5 : 0)],
    ['a life of exploring', (asp === 'exploration' ? 3 : wanted.has('exploration') ? 1 : 0) + (has('moved') ? 1 : 0)],
    ['a life of service', (asp === 'service' ? 3 : wanted.has('service') ? 1 : 0) + (facts.some((f) => f.id === 'retired' && f.text.includes('service')) ? 1.5 : 0)],
    ['keeping the family safe and steady', asp === 'security' ? 3 : wanted.has('security') ? 1 : 0],
  ];
  const [best, score] = scores.sort((a, b) => b[1] - a[1])[0];
  return score >= 2.5 ? best : undefined;
}

/** The few true lines a memorial tells about this life (third person). */
export const memorialStory = (s: GameState, p: Person): string[] => pickFacts(lifeStory(s, p), 3).map((f) => tell(f, p));

// ── The year in review ───────────────────────────────────────────────

export interface YearInReview {
  /** Stories that came back this year (follow-ups, recognized patterns, a life-so-far note at a round birthday). */
  story: string[];
  /** Important moments: births, deaths, big decisions, good and bad news. */
  highlights: JournalEntry[];
  /** Everyday things, shown folded away. */
  routine: JournalEntry[];
}

const ROUND_BIRTHDAYS = [40, 50, 60, 70, 80];

/** Sort a year's journal into what mattered, what came back, and the everyday. */
export function yearInReview(s: GameState, entries: JournalEntry[], me: Person): YearInReview {
  const story = entries.filter((j) => j.story).map((j) => j.text);
  const highlights = entries.filter((j) => !j.story && j.kind !== 'info');
  const routine = entries.filter((j) => !j.story && j.kind === 'info');
  const age = alive(me) ? ageOf(me, entries[0]?.year ?? s.year) : 0;
  if (ROUND_BIRTHDAYS.includes(age)) {
    const facts = pickFacts(lifeStory(s, me), 2);
    if (facts.length) story.push(`At ${age}: ${facts.map((f) => f.text).join(' ')}`);
  }
  return { story, highlights, routine };
}
