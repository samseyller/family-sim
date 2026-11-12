/**
 * Balance suite (npm run test:balance): plays every play style's standard lives in parallel and
 * fails when the game leaves its design bands, when any achievement or event is never reached,
 * or when metrics drift from the committed baseline. To accept an intended change, run
 * `npm run balance:update` and commit src/balance/baseline.json.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { RULES_VERSION } from '../engine/generate';
import baselineJson from './baseline.json';
import { checkBands, compareToBaseline, fmt, summarize, type Metrics, type SamplesByStrategy } from './metrics';
import { playAllStyles } from './parallel';
import { renderReport, type Baseline } from './report';
import { STANDARD_RUN } from './simulate';
import { ACHIEVEMENTS } from '../content/achievements';
import { EVENT_BY_ID } from '../engine/events';

const baseline = baselineJson as unknown as Baseline;
let samples: SamplesByStrategy;
let metrics: Metrics;

beforeAll(async () => {
  samples = await playAllStyles(STANDARD_RUN.seedFrom, STANDARD_RUN.scale, STANDARD_RUN.maxYears);
  metrics = summarize(samples);
}, 300_000);

describe('game balance', () => {
  it('the baseline was measured on the standard sample', () => {
    expect(baseline.meta).toMatchObject({ scale: STANDARD_RUN.scale, seedFrom: STANDARD_RUN.seedFrom, maxYears: STANDARD_RUN.maxYears });
  });

  it('no broken invariants in any simulated life', () => {
    const v = Object.entries(samples).flatMap(([st, ls]) => ls.flatMap((l) => l.violations.map((x) => `${st} seed ${l.seed}: ${x}`)));
    expect(v).toEqual([]);
  });

  it('every achievement and every event is reached by some play style', () => {
    expect(ACHIEVEMENTS.filter((a) => !metrics[`ach.${a.id}`]).map((a) => a.id)).toEqual([]);
    expect(Object.keys(EVENT_BY_ID).filter((id) => !metrics[`event.${id}`])).toEqual([]);
  });

  it('every metric is inside its design band', () => {
    const failures = checkBands(metrics);
    const hard = failures.filter((f) => !f.known).map((f) => `${f.key} = ${fmt(f.key, f.value)} (${f.min ?? '…'} to ${f.max ?? '…'}): ${f.why}`);
    expect(hard, renderReport({ title: 'Balance', metrics, failures, drift: compareToBaseline(metrics, baseline.metrics), baseline, samples })).toEqual([]);
  });

  it('nothing drifted from the baseline beyond seed noise', () => {
    const hint = RULES_VERSION !== baseline.meta.rulesVersion ? ` (rules ${baseline.meta.rulesVersion} → ${RULES_VERSION}: re-baseline if intended)` : '';
    expect(compareToBaseline(metrics, baseline.metrics).map((d) => `${d.key}: ${fmt(d.key, d.before)} → ${fmt(d.key, d.after)} (${d.reason})${hint}`)).toEqual([]);
  });
});
