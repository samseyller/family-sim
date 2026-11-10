import { describe, expect, it } from 'vitest';
import { CAREERS, CAREER_BY_ID } from '../content/careers';
import { CITIES, CITY_IDS } from '../content/cities';
import { applyPlan } from './systems';
import { cycleOf, isEntry, listings, LISTING_YEARS, nextListingYear, OPENINGS, openingsFor } from './jobMarket';
import { newGame } from './generate';
import { makeRng } from './rng';
import { active } from './util';

describe('careers', () => {
  it('has many full-time careers and part-time jobs, each in an industry', () => {
    expect(CAREERS.filter((c) => c.hours === 'full').length).toBeGreaterThanOrEqual(35);
    expect(CAREERS.filter((c) => c.hours === 'part').length).toBeGreaterThanOrEqual(15);
    expect(new Set(CAREERS.map((c) => c.id)).size).toBe(CAREERS.length);
    for (const c of CAREERS) expect(c.sector).toBeTruthy();
  });
});

describe('job listings', () => {
  it('each city posts a set of openings, always with an entry-level job', () => {
    for (const city of CITY_IDS) {
      for (let year = 2026; year < 2040; year++) {
        const full = listings(7, city, year, 'full');
        const part = listings(7, city, year, 'part');
        expect(full.length).toBeGreaterThan(0);
        expect(full.length).toBeLessThanOrEqual(OPENINGS.full + 1);
        expect(full.some(isEntry)).toBe(true);
        expect(part.some(isEntry)).toBe(true);
        expect(full.every((c) => c.hours === 'full')).toBe(true);
      }
    }
  });

  it('listings are stable within a cycle (minus filled jobs) and change every couple of years', () => {
    const y = cycleOf(2030) * LISTING_YEARS;
    const first = listings(11, 'denver', y, 'full').map((c) => c.id);
    const later = listings(11, 'denver', y + 1, 'full').map((c) => c.id);
    for (const id of later) expect(first).toContain(id); // nothing new mid-cycle, only filled jobs gone
    expect(listings(11, 'denver', y, 'full').map((c) => c.id)).toEqual(first); // same every reload
    const cycles = new Set(Array.from({ length: 6 }, (_, i) => listings(11, 'denver', y + i * LISTING_YEARS, 'full').map((c) => c.id).join()));
    expect(cycles.size).toBeGreaterThan(3);
    expect(nextListingYear(y)).toBe(y + LISTING_YEARS);
  });

  it('cities hire for their strong industries', () => {
    const count = (city: keyof typeof CITIES, sector: string) => {
      let n = 0;
      for (let seed = 0; seed < 200; seed++) n += listings(seed, city, 2030, 'full').filter((c) => c.sector === sector).length;
      return n;
    };
    expect(count('seattle', 'tech')).toBeGreaterThan(count('miami', 'tech'));
    expect(count('houston', 'energy')).toBeGreaterThan(count('boston', 'energy'));
    expect(count('los_angeles', 'entertainment')).toBeGreaterThan(count('phoenix', 'entertainment'));
    expect(count('new_york', 'finance')).toBeGreaterThan(count('san_antonio', 'finance'));
  });

  it('you can only be hired for a job that is open in your city', () => {
    const s = newGame(1401);
    const me = active(s);
    me.stats.smarts = 100;
    for (const f of ['degree', 'trade_cert', 'top_degree']) me.flags[f] = 1;
    me.jobId = undefined;
    const open = new Set(openingsFor(s, 'full').map((c) => c.id));
    const closed = CAREERS.find((c) => c.hours === 'full' && !open.has(c.id))!;
    s.plan.jobIntents = [{ kind: 'apply', careerId: closed.id }];
    applyPlan(s, makeRng(1));
    expect(me.jobId).toBeUndefined();
    expect(s.journal.at(-1)!.text).toMatch(/filled/);
    const listed = [...open].map((id) => CAREER_BY_ID[id])[0];
    let hired = false;
    for (let i = 0; i < 20 && !hired; i++) {
      s.plan.jobIntents = [{ kind: 'apply', careerId: listed.id }];
      applyPlan(s, makeRng(100 + i));
      hired = me.jobId === listed.id;
    }
    expect(hired).toBe(true);
  });
});
