/** Stage 5: genome, migrations, family tree layout, epitaphs, memorial export. */
import { describe, expect, it } from 'vitest';
import { fillLooks, GENES, inheritLooks, randomLooks } from '../engine/genome';
import { newGame } from '../engine/generate';
import { autoplayYear, chooseHeir, devKill, eligibleHeirs } from '../engine/phases';
import { migrate } from '../engine/migrations';
import { makeRng } from '../engine/rng';
import { epitaphFor, buildMemorial } from '../engine/memorial';
import type { GameState, Looks } from '../engine/types';
import { parseProfile } from '../profile/schema';
import { archiveEntry } from '../profile/tracker';
import { EPITAPH_MAX } from '../profile/types';
import { layoutTree, NODE_H, NODE_W, treeRoot } from './tree/layout';
import { memorialHtml } from './memorial/exportHtml';

const firstChoice = (pe: GameState['pending'][number]) => pe.choices.find((c) => !c.disabled)!.id;

/** A multi-generation game: play, then hand off to an heir a few times. */
function longGame(seed: number, lives = 3) {
  let s = newGame(seed);
  for (let life = 0; life < lives; life++) {
    for (let y = 0; y < 45 && s.phase === 'PLANNING'; y++) s = autoplayYear(s, firstChoice);
    if (s.phase !== 'SUCCESSION') s = devKill(s);
    const heirs = eligibleHeirs(s);
    const next = heirs.find((h) => h.relation === 'child') ?? heirs[0];
    s = chooseHeir(s, next?.id ?? null);
    if (s.phase === 'GAME_OVER') break;
  }
  return s;
}

describe('genome', () => {
  it('children take each gene from a parent (rare mutations)', () => {
    const rng = makeRng(5);
    let fromParents = 0;
    let total = 0;
    for (let i = 0; i < 300; i++) {
      const a = randomLooks(rng);
      const b = randomLooks(rng);
      const kid = inheritLooks(rng, a, b);
      for (const k of Object.keys(GENES) as (keyof Looks)[]) {
        expect(kid[k]).toBeGreaterThanOrEqual(0);
        expect(kid[k]).toBeLessThan(GENES[k]);
        total++;
        if (kid[k] === a[k] || kid[k] === b[k]) fromParents++;
      }
    }
    expect(fromParents / total).toBeGreaterThan(0.9);
  });

  it('fillLooks keeps valid genes and is deterministic for missing ones', () => {
    const partial = { skin: 2, hairColor: 9 } as Partial<Looks>;
    const a = fillLooks(partial, 'p42');
    expect(a.skin).toBe(2);
    expect(a.hairColor).toBeLessThan(GENES.hairColor);
    expect(fillLooks(partial, 'p42')).toEqual(a);
  });

  it('v3 saves upgrade to the full genome', () => {
    const v3: any = structuredClone(newGame(201));
    v3.schemaVersion = 3;
    for (const p of Object.values<any>(v3.people)) p.looks = { skin: p.looks.skin, hairColor: p.looks.hairColor, hairStyle: p.looks.hairStyle, eyes: p.looks.eyes };
    const up = migrate(v3)!;
    for (const p of Object.values(up.people)) expect(Object.keys(p.looks).sort()).toEqual(Object.keys(GENES).sort());
  });
});

describe('family tree layout', () => {
  it('places every played character with no overlapping nodes', () => {
    for (const seed of [202, 203, 204]) {
      const s = longGame(seed);
      const t = layoutTree(s);
      const ids = new Set(t.nodes.map((n) => n.id));
      expect(ids.size).toBe(t.nodes.length); // nobody twice
      for (const id of s.lineage) expect(ids.has(id)).toBe(true);
      expect(ids.has(treeRoot(s).id)).toBe(true);
      for (let i = 0; i < t.nodes.length; i++) {
        for (let j = i + 1; j < t.nodes.length; j++) {
          const a = t.nodes[i];
          const b = t.nodes[j];
          const overlap = a.x < b.x + NODE_W && b.x < a.x + NODE_W && a.y < b.y + NODE_H && b.y < a.y + NODE_H;
          expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
        }
        expect(t.nodes[i].x).toBeGreaterThanOrEqual(0);
        expect(t.nodes[i].x + NODE_W).toBeLessThanOrEqual(t.width + 0.01);
      }
    }
  });

  it('children sit one row below their parents', () => {
    const s = longGame(205, 2);
    const t = layoutTree(s);
    const at = new Map(t.nodes.map((n) => [n.id, n]));
    for (const n of t.nodes) {
      const p = s.people[n.id];
      const parent = [...p.biologicalParents, ...p.adoptiveParents].map((id) => at.get(id)).find(Boolean);
      if (parent) expect(n.depth).toBe(parent.depth + 1);
    }
  });
});

describe('memorial', () => {
  it('epitaphs are deterministic and fit the limit', () => {
    const s = longGame(206, 2);
    const m = buildMemorial(s);
    for (const e of m.entries) {
      expect(e.epitaph.length).toBeGreaterThan(10);
      expect(e.epitaph.length).toBeLessThanOrEqual(EPITAPH_MAX);
      expect(epitaphFor(s, e.person, e.knownFor)).toBe(e.epitaph);
    }
  });

  it('archive entries keep portraits and epitaphs', () => {
    const s = longGame(207, 2);
    const entry = archiveEntry(s, '2026-11-09T00:00:00Z');
    expect(entry.members.length).toBe(s.lineage.length);
    for (const m of entry.members) {
      expect(Object.keys(m.looks).sort()).toEqual(Object.keys(GENES).sort());
      expect(m.epitaph).toBeTruthy();
    }
  });

  it('old profile archives upgrade to the new record shape', () => {
    const v1 = {
      schemaVersion: 1,
      settings: {},
      achievements: {},
      stats: {},
      archive: [{ id: 'f1', familyName: 'Larsen', startYear: 2026, endYear: 2150, generations: 3, legacy: 900, endedAt: 'x',
        members: [{ name: 'Theo Larsen', lifespan: '1990–2072 (82)', knownFor: 'a devoted parent' }] }],
    };
    const res = parseProfile(v1);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const m = res.profile.archive[0].members[0];
      expect(m.birthYear).toBe(1990);
      expect(m.deathYear).toBe(2072);
      expect(m.epitaph).toMatch(/devoted parent/);
    }
  });

  it('exports a standalone HTML page with every member and no scripts', async () => {
    const s = longGame(208, 2);
    const entry = archiveEntry(s, '2026-11-09T00:00:00Z');
    entry.members[0].epitaph = 'Loved <bold> & brave';
    const html = await memorialHtml(entry);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).not.toMatch(/<script/i);
    for (const m of entry.members) expect(html).toContain(m.name);
    expect(html).toContain('Loved &lt;bold&gt; &amp; brave');
    expect(html).toContain('<svg');
  });
});
