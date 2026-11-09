/** Activities and energy. */
import { describe, expect, it } from 'vitest';
import { newGame } from './generate';
import { activityBlocker, energyOf, maxEnergy, performActivity, relativesOutside } from './activities';
import { autoplayYear } from './phases';
import type { GameState } from './types';
import { active, kidsAtHome, membersOf, partnerOf } from './util';
import { parseSaveFile, serializeGame } from '../persistence/exportImport';

const firstChoice = (pe: GameState['pending'][number]) => pe.choices.find((c) => !c.disabled)!.id;
const rich = (seed: number) => {
  const s = newGame(seed);
  s.households[active(s).householdId].wallet = 100000;
  active(s).stats.health = 80;
  active(s).stats.stress = 30;
  return s;
};

describe('energy', () => {
  it('is 100 when healthy and calm, lower when sick or stressed, never below 50', () => {
    const s = newGame(801);
    const me = active(s);
    me.stats.health = 80; me.stats.stress = 30;
    expect(maxEnergy(me, s.year)).toBe(100);
    me.stats.health = 30;
    expect(maxEnergy(me, s.year)).toBe(84);
    me.stats.stress = 95;
    expect(maxEnergy(me, s.year)).toBe(56);
    me.stats.health = 0; me.stats.stress = 100;
    expect(maxEnergy(me, s.year)).toBe(50);
  });

  it('lots of play with the kids, but only two vacations a year', () => {
    let s = rich(802);
    const kids = kidsAtHome(s, active(s)).map((k) => k.id);
    const everyone = membersOf(s, active(s).householdId).filter((p) => p.id !== s.activeId).map((p) => p.id);
    s = performActivity(s, 'vacation', everyone);
    s = performActivity(s, 'vacation', everyone);
    expect(energyOf(s).left).toBe(10);
    expect(activityBlocker(s, 'vacation', everyone)).toMatch(/energy/);
    let games = 0;
    let t = rich(803);
    while (!activityBlocker(t, 'game_night', kids.length ? [kidsAtHome(t, active(t))[0].id] : [])) {
      t = performActivity(t, 'game_night', [kidsAtHome(t, active(t))[0].id]);
      games++;
    }
    expect(games).toBe(12);
  });

  it('refills next year', () => {
    let s = performActivity(rich(804), 'spa_day');
    expect(energyOf(s).used).toBe(10);
    s = autoplayYear(s, firstChoice);
    expect(energyOf(s).used).toBe(0);
  });
});

describe('activities', () => {
  it('cost money, change stats, and report what changed', () => {
    const s0 = rich(805);
    const s = performActivity(s0, 'spa_day');
    expect(s.households[active(s).householdId].wallet).toBe(100000 - 250);
    expect(active(s).stats.stress).toBeLessThan(active(s0).stats.stress);
    expect(s.lastActivity?.changes.some((c) => c.startsWith('Stress -'))).toBe(true);
    expect(s.lastActivity?.changes).toContain('Energy -10');
  });

  it('bonds with whoever comes along, including grown-ups at home', () => {
    const s0 = rich(806);
    const partner = partnerOf(s0, s0.activeId)!;
    const s = performActivity(s0, 'date_night', [partner.id]);
    const key = [s0.activeId, partner.id].sort().join('|');
    expect(s.bonds[key].affinity).toBeGreaterThan(s0.bonds[key].affinity);
  });

  it('enforces participants, once-a-year limits, and age ranges', () => {
    const s = rich(807);
    expect(activityBlocker(s, 'date_night', [])).toMatch(/Choose/);
    const once = performActivity(s, 'checkup');
    expect(activityBlocker(once, 'checkup')).toMatch(/Already/);
    expect(activityBlocker(s, 'zoo')).toMatch(/Not at your age/);
    expect(activityBlocker(newGame(808, 'child'), 'casino')).toMatch(/From age 18/);
  });

  it('visiting relatives far away costs more energy and money', () => {
    const s = rich(809);
    const rel = relativesOutside(s, active(s));
    expect(rel.length).toBeGreaterThan(0);
    const after = performActivity(s, 'visit', [rel[0].id]);
    expect(energyOf(after).used === 10 || energyOf(after).used === 35).toBe(true);
  });

  it('is deterministic and survives a save round-trip', () => {
    const s = rich(810);
    const a = performActivity(s, 'casino');
    const b = performActivity(s, 'casino');
    expect(a).toEqual(b);
    const res = parseSaveFile(serializeGame(a));
    expect(res.ok && res.kind === 'game' && res.state).toEqual(a);
  });

  it('kids ask their parents; money is only spent if they say yes', () => {
    const s = newGame(811, 'child');
    const w = s.households[active(s).householdId].wallet;
    const after = performActivity(s, 'zoo');
    const spent = w - after.households[active(after).householdId].wallet;
    expect(spent === 0 || spent === 120).toBe(true);
    expect(energyOf(after).used).toBe(10);
  });
});
