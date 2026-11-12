/**
 * Balance runs. Every play style plays its lives (core styles measure the economy; explorer
 * styles reach every achievement and event), split across CPU cores.
 *   npm run balance              standard sample (fixed seeds): bands + drift vs the baseline
 *   npm run balance:update       re-measure and save src/balance/baseline.json (commit it)
 *   npm run balance:deep [x]     x times the standard lives (default ~8×: 500 per core style) on
 *                                fresh seeds; writes a Markdown + JSON report to balance-reports/
 * Exits 1 when a design band fails (or, for the standard run, when metrics drift).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_VERSION } from '../src/engine/generate';
import { checkBands, compareToBaseline, summarize } from '../src/balance/metrics';
import { playAllStyles } from '../src/balance/parallel';
import { renderReport, spreadSection, type Baseline } from '../src/balance/report';
import { DEEP_RUN, playLives, seedRange, STANDARD_RUN } from '../src/balance/simulate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(root, 'src/balance/baseline.json');
const args = process.argv.slice(2);

// Worker mode (spawned by src/balance/parallel.ts): play a slice of lives, print them as JSON.
if (args[0] === '--worker') {
  const [, style, from, count, maxYears] = args;
  process.stdout.write(JSON.stringify(playLives(style, seedRange(Number(from), Number(count)), Number(maxYears))));
  process.exit(0);
}

const readBaseline = (): Baseline | undefined => (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : undefined);
const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const mode = args[0] ?? 'standard';
  const t0 = Date.now();
  const cfg = mode === 'deep' ? { ...DEEP_RUN, scale: args[1] ? Number(args[1]) : DEEP_RUN.scale } : STANDARD_RUN;
  console.error(`Playing every style at ${cfg.scale.toFixed(1)}× (seeds from ${cfg.seedFrom})…`);
  const samples = await playAllStyles(cfg.seedFrom, cfg.scale, cfg.maxYears, (d, t) => process.stderr.write(`\r  ${d}/${t} batches`));
  process.stderr.write('\n');
  const metrics = summarize(samples);
  const secs = Math.round((Date.now() - t0) / 1000);

  if (mode === 'update') {
    const baseline: Baseline = { meta: { scale: cfg.scale, seedFrom: cfg.seedFrom, maxYears: cfg.maxYears, rulesVersion: RULES_VERSION, updated: today() }, metrics };
    const old = readBaseline();
    writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
    const drift = old ? compareToBaseline(metrics, old.metrics) : [];
    console.log(renderReport({ title: 'Balance baseline updated', metrics, failures: checkBands(metrics), drift, baseline: old, samples }));
    console.log(`Saved ${BASELINE} (${secs}s). Review the changes above, then commit it.`);
    return;
  }

  const baseline = readBaseline();
  const failures = checkBands(metrics);
  if (mode === 'deep') {
    // Different seeds and sample size than the baseline: drift here is a hint, not a failure.
    const drift = baseline ? compareToBaseline(metrics, baseline.metrics) : [];
    const report = renderReport({
      title: `Deep balance check: ${cfg.scale.toFixed(1)}× the standard lives (${today()}, ${secs}s)`,
      metrics, failures, drift: [], baseline, samples,
      extra: [
        ...spreadSection(samples),
        '## Compared with the standard sample', '',
        drift.length ? 'These differ from the baseline by more than seed noise. The standard sample may not represent the game well for these:\n\n' + drift.map((d) => `- ${d.key}: baseline ${d.before} → deep ${d.after} (${d.reason})`).join('\n') : 'The standard sample agrees with the deep run.', '',
      ],
    });
    const dir = join(root, 'balance-reports');
    mkdirSync(dir, { recursive: true });
    const name = `deep-${today()}`;
    writeFileSync(join(dir, `${name}.md`), report);
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ config: cfg, rulesVersion: RULES_VERSION, metrics }, null, 2));
    console.log(report);
    console.log(`Report saved to balance-reports/${name}.md`);
    process.exitCode = failures.some((f) => !f.known) ? 1 : 0;
    return;
  }

  const drift = baseline ? compareToBaseline(metrics, baseline.metrics) : [];
  console.log(renderReport({ title: `Balance check (${secs}s)`, metrics, failures, drift, baseline, samples }));
  if (!baseline) console.log('No baseline yet: run `npm run balance:update`.');
  process.exitCode = failures.some((f) => !f.known) || drift.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
