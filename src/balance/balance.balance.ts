/**
 * Balance suite (npm run test:balance): plays the standard sample of lives and fails when the
 * game leaves its design bands or drifts from the committed baseline. To accept an intended
 * change, run `npm run balance:update` and commit src/balance/baseline.json.
 */
import { describe, expect, it } from 'vitest';
import { RULES_VERSION } from '../engine/generate';
import baselineJson from './baseline.json';
import { checkBands, compareToBaseline, fmt, summarize, type SamplesByStrategy } from './metrics';
import { renderReport, type Baseline } from './report';
import { playLives, seedRange, STANDARD_RUN, STRATEGIES } from './simulate';

const baseline = baselineJson as Baseline;
const samples = Object.fromEntries(STRATEGIES.map((st) => [st, playLives(st, seedRange(STANDARD_RUN.seedFrom, STANDARD_RUN.lives), STANDARD_RUN.maxYears)])) as SamplesByStrategy;
const metrics = summarize(samples);
const failures = checkBands(metrics);
const drift = compareToBaseline(metrics, baseline.metrics);

describe('game balance', () => {
  it('the baseline was measured on the standard sample', () => {
    expect(baseline.meta).toMatchObject({ lives: STANDARD_RUN.lives, seedFrom: STANDARD_RUN.seedFrom, maxYears: STANDARD_RUN.maxYears });
  });

  it('no broken invariants in any simulated life', () => {
    const v = Object.values(samples).flat().flatMap((l) => l.violations.map((x) => `seed ${l.seed}: ${x}`));
    expect(v).toEqual([]);
  });

  it('every metric is inside its design band', () => {
    const hard = failures.filter((f) => !f.known).map((f) => `${f.key} = ${fmt(f.key, f.value)} (${f.min ?? '…'} to ${f.max ?? '…'}): ${f.why}`);
    expect(hard, renderReport({ title: 'Balance', metrics, failures, drift, baseline })).toEqual([]);
  });

  it('nothing drifted from the baseline beyond seed noise', () => {
    const hint = RULES_VERSION !== baseline.meta.rulesVersion ? ` (rules ${baseline.meta.rulesVersion} → ${RULES_VERSION}: re-baseline if intended)` : '';
    expect(drift.map((d) => `${d.key}: ${fmt(d.key, d.before)} → ${fmt(d.key, d.after)} (${d.reason})${hint}`)).toEqual([]);
  });
});
