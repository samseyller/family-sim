/** Custom names: starting a family and naming babies. */
import { describe, expect, it } from 'vitest';
import { newGame } from './generate';
import { choose, resolveYear } from './phases';
import type { GameState } from './types';
import { active, cleanName, parentsOf, partnerOf } from './util';
import { parseSaveFile, serializeGame } from '../persistence/exportImport';

describe('cleanName', () => {
  it('keeps letters (any language), hyphens and apostrophes; trims and capitalizes', () => {
    expect(cleanName('  maría-josé  ')).toBe('María-josé');
    expect(cleanName("o'brien")).toBe("O'brien");
    expect(cleanName('Zoë <script>')).toBe('Zoë script');
    expect(cleanName('李 小龙')).toBe('李 小龙');
    expect(cleanName('123!!')).toBe('');
    expect(cleanName('a'.repeat(50))).toHaveLength(20);
  });
});

describe('custom start names', () => {
  it('names the player and gives the whole family the chosen surname', () => {
    const s = newGame(701, 'adult', { first: 'john', last: 'smith' });
    const me = active(s);
    expect(me.firstName).toBe('John');
    expect(me.lastName).toBe('Smith');
    expect(partnerOf(s, me.id)!.lastName).toBe('Smith');
    for (const p of parentsOf(s, me)) expect(p.lastName).toBe('Smith');
    expect(s.journal[0].text).toContain('John Smith');
  });

  it('works for a child start, and blank names stay random', () => {
    const s = newGame(702, 'child', { first: 'Ada', last: '' });
    expect(active(s).firstName).toBe('Ada');
    expect(newGame(703, 'adult', { first: '  ', last: '!!' })).toEqual(newGame(703));
  });
});

describe('naming a baby', () => {
  /** A game where the player's household has a baby due this year. */
  function babyDue(seed: number) {
    const s = newGame(seed);
    const me = active(s);
    s.households[me.householdId].pendingBirth = { year: s.year, parents: [me.id, partnerOf(s, me.id)!.id] };
    let next = resolveYear(s);
    const naming = next.pending.find((p) => p.eventId === 'name_baby');
    return { next, naming };
  }

  it('the birth queues a naming event with suggestions and a custom option', () => {
    const { naming } = babyDue(704);
    expect(naming).toBeDefined();
    expect(naming!.choices.length).toBe(4);
    expect(naming!.choices.find((c) => c.id === 'custom')?.input).toBeDefined();
  });

  it('a typed name is cleaned, applied, and fixes the birth announcement', () => {
    let { next, naming } = babyDue(705);
    const babyId = naming!.subjectId!;
    while (next.phase === 'DECISIONS') {
      const pe = next.pending[0];
      next = pe.eventId === 'name_baby'
        ? choose(next, pe.uid, 'custom', '  wren  ')
        : choose(next, pe.uid, pe.choices.find((c) => !c.disabled)!.id);
    }
    expect(next.people[babyId].firstName).toBe('Wren');
    expect(next.journal.some((j) => j.kind === 'birth' && j.text.startsWith('Wren '))).toBe(true);
  });

  it('picking a suggestion works, and reloading mid-naming gives the same result', () => {
    const { next, naming } = babyDue(706);
    const pick = naming!.choices[1].id;
    const direct = choose(next, naming!.uid, pick);
    const reloaded = parseSaveFile(serializeGame(next));
    if (!reloaded.ok || reloaded.kind !== 'game') throw new Error('bad save');
    const viaSave = choose(reloaded.state as GameState, naming!.uid, pick);
    expect(viaSave.people[naming!.subjectId!].firstName).toBe(direct.people[naming!.subjectId!].firstName);
    expect(direct.people[naming!.subjectId!].firstName).toBe(naming!.choices[1].label);
  });
});
