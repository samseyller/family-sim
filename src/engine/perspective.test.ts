/** After the torch passes, the old "You" entries are retold about the person they happened to. */
import { describe, expect, it } from 'vitest';
import { die } from './family';
import { newGame } from './generate';
import { chooseHeir, eligibleHeirs } from './phases';
import type { GameState } from './types';
import { active, journalText, retell } from './util';

describe('retelling journal entries', () => {
  it('turns second person into the person’s name', () => {
    expect(retell('You were promoted to Senior Nurse.', 'Joe')).toBe('Joe was promoted to Senior Nurse.');
    expect(retell('You bought a family home in Denver for $340,000.', 'Joe')).toBe('Joe bought a family home in Denver for $340,000.');
    expect(retell('Your investments jumped 18% this year.', 'Joe')).toBe("Joe's investments jumped 18% this year.");
    expect(retell('You married Ana Lee.', 'Joe')).toBe('Joe married Ana Lee.');
    expect(retell('You quit your job as a Chef.', 'Joe')).toBe('Joe quit their job as a Chef.');
    expect(retell('Ana moved in with you.', 'Joe')).toBe('Ana moved in with Joe.');
    expect(retell('You hugged Ana, and she hugged you back.', 'Joe')).toBe('Joe hugged Ana, and she hugged them back.');
  });

  it('a death is always written by name', () => {
    const s = newGame(1901);
    const me = active(s);
    die(s, me, 'heart attack');
    const entry = s.journal.at(-1)!;
    expect(entry.text).toMatch(new RegExp(`^${me.firstName} ${me.lastName} passed away`));
    expect(entry.text).not.toMatch(/^You/);
  });

  it('after passing the torch, last year reads about the old character, not "you"', () => {
    let s: GameState = newGame(1902);
    const me = active(s);
    s.journal.push({ year: s.year, text: 'You were promoted to Senior Nurse.', kind: 'good', who: me.id });
    die(s, me, 'illness');
    s.phase = 'SUCCESSION';
    const heir = eligibleHeirs(s)[0];
    s = chooseHeir(s, heir.id);
    const lastYear = s.journal.filter((j) => j.year === s.year - 1).map((j) => journalText(s, j));
    expect(lastYear).toContain(`${me.firstName} was promoted to Senior Nurse.`);
    expect(lastYear.some((t) => /^You\b/.test(t))).toBe(false);
    // The heir's own new entries still speak to them.
    expect(journalText(s, { text: 'You took up fishing.', who: heir.id })).toBe('You took up fishing.');
  });
});
