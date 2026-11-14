/**
 * Emergent stories: noticing patterns that are already there in what the game recorded, and saying so once.
 *
 * No hidden meters: each pattern is read from existing facts (the activity log, friendships, careers and hobbies,
 * story threads, aspiration history). When one reaches its milestone it is recognized once, by a single line in the
 * year in review, and remembered as a closed `pattern` thread (so it is never announced twice, feeds the life story
 * and memorial, and is pruned with other old threads). At most one recognition a year; no stat effects, so stories
 * never change balance. Nothing is imposed: a pattern only exists if the player's own choices made it.
 *
 *   tradition     the same family activity in 3 of the last 5 years (with someone at home to share it)
 *   friend        a friendship 30 years old that is still warm
 *   following     a grown child in your line of work, or deep into the same interest as you
 *   own_path      a grown child you pushed hard, now working in a different field
 *   recovered     someone you grew apart from, close again years later without a big moment
 *   identity      an interest you have practiced to mastery
 *   reconsidered  once set on achievement, now wanting connection or service, after real years of work
 */
import { CAREER_BY_ID } from '../content/careers';
import { hobbyName } from './narrative';
import { TRADITIONS } from './traditions';
import type { GameState, Hobby, Person, Thread } from './types';
import { active, ageOf, alive, childrenOf, getBond, journal, membersOf } from './util';


interface Found { key: string; subject?: Person; since: number; hits: number[]; text: string }

const recognized = (s: GameState, me: Person, key: string) => (s.threads ?? []).some((t) => t.kind === 'pattern' && t.ownerId === me.id && t.detail === key);
const recognizedKind = (s: GameState, me: Person, kind: string) => (s.threads ?? []).some((t) => t.kind === 'pattern' && t.ownerId === me.id && t.detail?.startsWith(`${kind}:`));
const sectorOf = (jobId?: string) => (jobId ? CAREER_BY_ID[jobId]?.sector : undefined);
/** The player's field: the current job, or the one recorded at retirement. */
function myField(s: GameState, me: Person): string | undefined {
  if (me.jobId) return sectorOf(me.jobId);
  const t = (s.threads ?? []).find((x) => x.ownerId === me.id && x.kind === 'retired' && x.detail);
  return sectorOf(t?.detail);
}
const topSkill = (p: Person) => (Object.entries(p.skills) as [Hobby, number][]).sort((a, b) => b[1] - a[1])[0];
const they = (p: Person) => (p.sex === 'F' ? 'she' : 'he');

/** Every pattern ready to be recognized now, in a stable order. */
export function findPatterns(s: GameState, me: Person): Found[] {
  const out: Found[] = [];
  const year = s.year;

  if (membersOf(s, me.householdId).length >= 2) {
    for (const [id, label] of Object.entries(TRADITIONS)) {
      const years = [...new Set((s.activityLog ?? []).filter((x) => x.id === id && x.year > year - 5 && (x.with ?? 1) > 0).map((x) => x.year))].sort((a, b) => a - b);
      if (years.length >= 3) out.push({ key: `tradition:${id}`, since: years[0], hits: years, text: `${label} has become a family tradition.` });
    }
  }
  for (const fs of s.friends ?? []) {
    const f = s.people[fs.id];
    if (fs.of !== me.id || !f || !alive(f) || fs.distant || year - fs.since < 30 || getBond(s, me.id, f.id).affinity < 20) continue;
    out.push({ key: `friend:${f.id}`, subject: f, since: fs.since, hits: [fs.since, year], text: `You and ${f.firstName} have been friends for ${year - fs.since} years now.` });
  }
  const field = myField(s, me);
  const myJob = me.jobId ?? (s.threads ?? []).find((x) => x.ownerId === me.id && x.kind === 'retired' && x.detail)?.detail;
  const followed = recognizedKind(s, me, 'following');
  const [mySkill, myLvl] = topSkill(me) ?? [];
  for (const k of childrenOf(s, me.id)) {
    if (!alive(k) || ageOf(k, year) < 22) continue;
    const pushed = (s.threads ?? []).find((t) => t.ownerId === me.id && t.kind === 'pushed' && t.subjectId === k.id && t.hits.length >= 3);
    const sameField = !!k.jobId && k.jobId === myJob;
    const sameCraft = !!mySkill && myLvl >= 50 && (k.skills[mySkill] ?? 0) >= 50;
    if ((sameField || sameCraft) && !followed) {
      const what = sameField ? `${they(k)}’s a ${CAREER_BY_ID[k.jobId!].name.toLowerCase()}, just like you` : `${they(k)} loves ${hobbyName(mySkill!)} as much as you do`;
      out.push({ key: `following:${k.id}`, subject: k, since: k.birthYear + 18, hits: [year], text: `${k.firstName} is following in your footsteps: ${what}.` });
    } else if (pushed && ageOf(k, year) >= 25 && k.jobId && field && sectorOf(k.jobId) !== field) {
      out.push({ key: `own_path:${k.id}`, subject: k, since: pushed.hits[0], hits: pushed.hits, text: `${k.firstName} has gone ${k.sex === 'F' ? 'her' : 'his'} own way, and is making it work.` });
    }
  }
  // The skipped generation: a grown grandchild on your path when their parent isn't.
  for (const k of childrenOf(s, me.id)) {
    const parentOnPath = (!!myJob && k.jobId === myJob) || (!!mySkill && myLvl >= 50 && (k.skills[mySkill] ?? 0) >= 50);
    if (parentOnPath) continue;
    for (const g of childrenOf(s, k.id)) {
      if (!alive(g) || ageOf(g, year) < 22) continue;
      const onPath = (!!myJob && g.jobId === myJob) || (!!mySkill && myLvl >= 50 && (g.skills[mySkill] ?? 0) >= 50);
      if (onPath) out.push({ key: `skipped:${g.id}`, subject: g, since: g.birthYear + 18, hits: [year], text: `${g.firstName} followed your path, not ${g.sex === 'F' ? 'her' : 'his'} ${k.sex === 'F' ? 'mother' : 'father'}’s.` });
    }
  }
  for (const t of s.threads ?? []) {
    if (t.ownerId !== me.id || t.kind !== 'strain' || t.closed === undefined || !['faded', 'drifted'].includes(t.outcome ?? '') || year - t.closed < 2) continue;
    const p = t.subjectId ? s.people[t.subjectId] : undefined;
    if (p && alive(p) && getBond(s, me.id, p.id).affinity >= 40) out.push({ key: `recovered:${p.id}`, subject: p, since: t.hits[0], hits: [t.hits[0], year], text: `You and ${p.firstName} are close again, years after things went wrong.` });
  }
  if (mySkill && myLvl >= 70 && ageOf(me, year) >= 30) out.push({ key: `identity:${mySkill}`, since: year, hits: [year], text: `${hobbyName(mySkill)[0].toUpperCase()}${hobbyName(mySkill).slice(1)} has become part of who you are.` });
  const lastAim = me.pastAspirations?.[me.pastAspirations.length - 1];
  const workedHard = me.jobLevel >= 2 || (s.threads ?? []).some((t) => t.ownerId === me.id && t.kind === 'work_first');
  if (lastAim?.aspiration === 'achievement' && (me.aspiration === 'connection' || me.aspiration === 'service') && workedHard) {
    out.push({ key: 'reconsidered', since: lastAim.until, hits: [lastAim.until], text: 'After years of chasing the next promotion, your priorities have changed.' });
  }
  return out.filter((f) => !recognized(s, me, f.key));
}

/** The yearly pass: recognize at most one new pattern in the player's life. */
export function recognizePatterns(s: GameState) {
  const me = active(s);
  if (!alive(me) || ageOf(me, s.year) < 18) return;
  const found = findPatterns(s, me)[0];
  if (!found) return;
  const t: Thread = { kind: 'pattern', ownerId: me.id, detail: found.key, since: found.since, hits: found.hits.slice(-8), closed: s.year, outcome: 'recognized', ...(found.subject ? { subjectId: found.subject.id } : {}) };
  (s.threads ??= []).push(t);
  journal(s, found.text, 'good', true);
}
