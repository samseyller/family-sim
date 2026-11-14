/** Slice 3: personalized storytelling (narrative context, patterns, year in review, memorials). */
import { describe, expect, it } from 'vitest';
import { playLife } from '../balance/simulate';
import { newGame } from './generate';
import { buildMemorial } from './memorial';
import { childhoodFacts, childhoodNote, interestNote, lifeStory, memorialStory, relationshipNote, rememberedFor, successionNote, yearInReview } from './narrative';
import { findPatterns, recognizePatterns } from './patterns';
import { remember } from './relationships';
import { closeThread, inheritThreads, noteThread } from './threads';
import type { GameState, Person } from './types';
import { active, getBond, kidsAtHome, partnerOf } from './util';

const family = (seed: number) => {
  const s = newGame(seed);
  const me = active(s);
  return { s, me, partner: partnerOf(s, me.id)!, kid: kidsAtHome(s, me)[0] };
};
const setBond = (s: GameState, a: Person, b: Person, affinity: number) => { s.bonds[[a.id, b.id].sort().join('|')] = { affinity, trust: 20 }; };
/** The thread kinds a life-story fact rests on (facts about people need a recorded thread). */
const EVIDENCE: Record<string, string> = { backed: 'encouraged', mended: 'strain', drifted: 'strain', pushed: 'pushed', stood_by: 'supported', loss: 'loss' };

describe('narrative facts are true', () => {
  it('in simulated lives, every fact names real people, past years, and a recorded cause', { timeout: 120_000 }, () => {
    let checked = 0;
    for (const [style, seed] of [['family', 31001], ['career', 31002], ['balanced', 31003], ['socialite', 31004]] as const) {
      let last: GameState | undefined;
      playLife(style, seed, 110, (s) => { last = s; });
      const s = last!;
      for (const id of s.lineage) {
        const p = s.people[id];
        for (const f of lifeStory(s, p)) {
          checked++;
          for (const who of f.people) expect(s.people[who], `${f.id} names ${who}`).toBeDefined();
          for (const y of f.years) expect(y).toBeLessThanOrEqual(s.year);
          const kind = EVIDENCE[f.id.split(':')[0]];
          if (kind) expect((s.threads ?? []).some((t) => t.ownerId === p.id && t.kind === kind && f.people.includes(t.subjectId!)), f.text).toBe(true);
        }
        for (const line of memorialStory(s, p)) expect(line).not.toMatch(/\b(you|your)\b/i); // told about them, not to them
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('without recorded history there is no story to tell', () => {
    const { s, me, kid, partner } = family(31101);
    expect(childhoodNote(s, kid)).toBe('');
    expect(relationshipNote(s, me, partner)).toBe('');
    expect(successionNote(s, me, kid)).toBe('');
    expect(lifeStory(s, me).filter((f) => EVIDENCE[f.id.split(':')[0]])).toEqual([]);
  });
});

describe('personalized event context', () => {
  it('“after years of backing her art” only when you did, she kept at it, and she got good', () => {
    const { s, me, kid } = family(31201);
    Object.assign(kid, { sex: 'F', hobby: 'art' });
    kid.skills.art = 60;
    expect(interestNote(s, me, kid)).toBe('');
    for (const y of [5, 4, 3]) noteThread(s, 'encouraged', me, kid, { detail: 'art', year: s.year - y });
    expect(interestNote(s, me, kid)).toMatch(/years of you backing her art/);
    kid.skills.art = 30;
    expect(interestNote(s, me, kid)).toBe(''); // not serious yet
    kid.skills.art = 60;
    kid.hobby = 'music';
    expect(interestNote(s, me, kid)).toBe(''); // a different interest now
  });

  it('a childhood note draws on what the parents actually recorded', () => {
    const { s, me, kid } = family(31202);
    kid.hobby = 'music';
    noteThread(s, 'encouraged', me, kid, { detail: 'music', year: s.year - 3 });
    noteThread(s, 'encouraged', me, kid, { detail: 'music', year: s.year - 2 });
    const facts = childhoodFacts(s, kid);
    expect(facts.map((f) => f.id)).toContain('backed');
    expect(facts.find((f) => f.id === 'backed')!.people).toEqual([me.id]);
    expect(childhoodNote(s, kid)).toMatch(/music/);
  });

  it('strained, then mended: the context follows the record', () => {
    const { s, me, partner } = family(31203);
    noteThread(s, 'strain', me, partner, { year: s.year - 4 });
    noteThread(s, 'strain', me, partner, { year: s.year - 3 });
    expect(relationshipNote(s, me, partner)).toContain(`since ${s.year - 4}`);
    closeThread(s.threads![0], s.year - 1, 'reconciled');
    expect(relationshipNote(s, me, partner)).toContain(`close again since ${s.year - 1}`);
  });
});

describe('succession', () => {
  it('names what the two generations shared, and who still remembers the one who passed', () => {
    const { s, me, kid } = family(31301);
    kid.hobby = 'woodworking';
    for (const y of [9, 8, 7]) noteThread(s, 'encouraged', me, kid, { detail: 'woodworking', year: s.year - y });
    const friend = Object.values(s.people).find((p) => p.deathYear === undefined && p.householdId !== me.householdId)!;
    noteThread(s, 'supported', me, friend, { year: s.year - 6 });
    noteThread(s, 'supported', me, friend, { year: s.year - 5 });
    const before = successionNote(s, me, kid);
    expect(before).toContain(`backed ${kid.firstName}’s woodworking`);
    inheritThreads(s, me.id, kid);
    expect(successionNote(s, me, kid)).toContain(`${friend.firstName} still remembers how ${me.firstName} stood by them`);
  });
});

describe('emergent patterns', () => {
  it('a family tradition needs three different years in five, someone to share it, and is recognized once', () => {
    const { s, me } = family(31401);
    s.activityLog = [{ year: s.year - 4, id: 'game_night' }, { year: s.year - 2, id: 'game_night' }];
    expect(findPatterns(s, me).some((f) => f.key === 'tradition:game_night')).toBe(false);
    s.activityLog.push({ year: s.year, id: 'game_night' }, { year: s.year, id: 'game_night' });
    expect(findPatterns(s, me).some((f) => f.key === 'tradition:game_night')).toBe(true);
    recognizePatterns(s);
    expect(s.journal.filter((j) => j.story && /Game night has become a family tradition/.test(j.text))).toHaveLength(1);
    recognizePatterns(s);
    expect(s.journal.filter((j) => j.story && /Game night/.test(j.text))).toHaveLength(1);
    expect(lifeStory(s, me).some((f) => f.id === 'tradition')).toBe(true);
  });

  it('one recognition a year at most', () => {
    const { s, me, partner } = family(31402);
    for (const id of ['game_night', 'road_trip', 'garden']) s.activityLog = [...(s.activityLog ?? []), ...[0, 1, 2].map((d) => ({ year: s.year - d, id }))];
    expect(findPatterns(s, me).length).toBeGreaterThanOrEqual(3);
    const before = s.journal.length;
    recognizePatterns(s);
    expect(s.journal.length - before).toBe(1);
    expect(partner).toBeDefined();
  });

  it('a strained relationship that recovered on its own is noticed, years later', () => {
    const { s, me, partner } = family(31403);
    noteThread(s, 'strain', me, partner, { year: s.year - 12 });
    noteThread(s, 'strain', me, partner, { year: s.year - 11 });
    closeThread(s.threads![0], s.year - 1, 'faded');
    setBond(s, me, partner, 20);
    expect(findPatterns(s, me).some((f) => f.key.startsWith('recovered'))).toBe(false); // too soon, not close yet
    s.year += 2;
    setBond(s, me, partner, 55);
    expect(findPatterns(s, me).some((f) => f.key === `recovered:${partner.id}`)).toBe(true);
  });
});

describe('the year in review', () => {
  it('stories that came back first, the big moments next, the everyday folded away', () => {
    const { s, me } = family(31501);
    const y = s.year;
    const entries = [
      { year: y, text: 'Game night has become a family tradition.', kind: 'good' as const, who: me.id, story: true },
      { year: y, text: 'You got a raise.', kind: 'good' as const, who: me.id },
      { year: y, text: 'You went to the gym.', kind: 'info' as const, who: me.id },
    ];
    const r = yearInReview(s, entries, me);
    expect(r.story).toEqual(['Game night has become a family tradition.']);
    expect(r.highlights.map((j) => j.text)).toEqual(['You got a raise.']);
    expect(r.routine.map((j) => j.text)).toEqual(['You went to the gym.']);
  });

  it('a round birthday adds a life-so-far note, only from facts that exist', () => {
    const { s, me, kid } = family(31502);
    me.birthYear = s.year - 40;
    expect(yearInReview(s, [], me).story.some((t) => t.startsWith('At 40:'))).toBe(true); // raising children is a fact
    for (const y of [9, 8, 7]) noteThread(s, 'encouraged', me, kid, { detail: 'music', year: s.year - y });
    kid.hobby = 'music';
    expect(yearInReview(s, [], me).story.join(' ')).toMatch(/backed .+ music/);
    me.birthYear = s.year - 41;
    expect(yearInReview(s, [], me).story).toEqual([]);
  });
});

describe('memorials tell the life actually lived', () => {
  it('a family-devoted life and a career-driven one are remembered differently', () => {
    const { s, me, kid, partner } = family(31601);
    for (const k of kidsAtHome(s, me)) setBond(s, me, k, 70);
    me.aspiration = 'connection';
    for (let y = 9; y >= 2; y--) noteThread(s, 'aspiration', me, undefined, { detail: 'connection', year: s.year - y });
    closeThread(s.threads!.find((t) => t.kind === 'aspiration')!, s.year - 1, 'milestone');
    expect(rememberedFor(s, me)).toBe('a life devoted to family');

    const t = family(31602);
    t.me.jobId = 'lawyer';
    t.me.jobLevel = 3;
    t.me.aspiration = 'achievement';
    for (let y = 9; y >= 2; y--) noteThread(t.s, 'aspiration', t.me, undefined, { detail: 'achievement', year: t.s.year - y });
    closeThread(t.s.threads!.find((x) => x.kind === 'aspiration')!, t.s.year - 1, 'milestone');
    for (const y of [6, 5, 4]) noteThread(t.s, 'work_first', t.me, undefined, { year: t.s.year - y });
    for (const k of kidsAtHome(t.s, t.me)) setBond(t.s, t.me, k, 10);
    expect(rememberedFor(t.s, t.me)).toMatch(/^a driven career as a lawyer/);
    expect(kid && partner).toBeTruthy();
  });

  it('memorials carry a few true lines, deterministically, and differ between lives', { timeout: 120_000 }, () => {
    const story = (style: string, seed: number) => {
      let last: GameState | undefined;
      playLife(style, seed, 100, (s) => { last = s; });
      return buildMemorial(last!).entries.map((e) => [e.knownFor, ...e.story].join(' | '));
    };
    const a = story('family', 31701);
    expect(story('family', 31701)).toEqual(a);
    expect(story('career', 31702)).not.toEqual(a);
    expect(a.every((x) => x.length > 0)).toBe(true);
  });

  it('a remembered harm is never invented: no support memory, no gratitude story', () => {
    const { s, me, partner } = family(31801);
    remember(partner, 'missed', me.id, s.year - 1);
    expect(lifeStory(s, me).some((f) => f.id.startsWith('stood_by'))).toBe(false);
    expect(getBond(s, me.id, partner.id)).toBeDefined();
  });
});
