/**
 * Balance runs.
 *   npm run balance              standard sample (fixed seeds): bands + drift vs the baseline
 *   npm run balance:update       re-measure and save src/balance/baseline.json (commit it)
 *   npm run balance:deep [n]     n lives per play style (default 500) on fresh seeds, in parallel;
 *                                writes a Markdown + JSON report to balance-reports/
 * Exits 1 when a design band fails (or, for the standard run, when metrics drift).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_VERSION } from '../src/engine/generate';
import type { Strategy } from '../src/engine/strategies';
import { checkBands, compareToBaseline, summarize, type SamplesByStrategy } from '../src/balance/metrics';
import { renderReport, spreadSection, type Baseline } from '../src/balance/report';
import { DEEP_RUN, playLives, seedRange, STANDARD_RUN, STRATEGIES, type LifeSample } from '../src/balance/simulate';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const BASELINE = join(root, 'src/balance/baseline.json');
const args = process.argv.slice(2);

// Worker mode: play a slice of lives and print them as JSON.
if (args[0] === '--worker') {
  const [, strategy, from, count, maxYears] = args;
  process.stdout.write(JSON.stringify(playLives(strategy as Strategy, seedRange(Number(from), Number(count)), Number(maxYears))));
  process.exit(0);
}

function runWorker(strategy: Strategy, from: number, count: number, maxYears: number): Promise<LifeSample[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--worker', strategy, String(from), String(count), String(maxYears)], { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) : reject(new Error(`worker ${strategy} ${from} exited ${code}`))));
  });
}

/** Play `lives` per style, split into chunks across processes. */
async function playParallel(seedFrom: number, lives: number, maxYears: number): Promise<SamplesByStrategy> {
  const jobs: { st: Strategy; from: number; count: number }[] = [];
  const chunk = Math.max(5, Math.ceil(lives / 12));
  for (const st of STRATEGIES) for (let i = 0; i < lives; i += chunk) jobs.push({ st, from: seedFrom + i, count: Math.min(chunk, lives - i) });
  const results: Record<string, LifeSample[][]> = Object.fromEntries(STRATEGIES.map((st) => [st, []]));
  const slots = Math.max(1, Math.min(availableParallelism() - 1, 16));
  let next = 0;
  let done = 0;
  const work = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      const idx = Math.floor((j.from - seedFrom) / chunk);
      results[j.st][idx] = await runWorker(j.st, j.from, j.count, maxYears);
      done++;
      process.stderr.write(`\r  ${done}/${jobs.length} batches`);
    }
  };
  await Promise.all(Array.from({ length: slots }, work));
  process.stderr.write('\n');
  return Object.fromEntries(STRATEGIES.map((st) => [st, results[st].flat()])) as SamplesByStrategy;
}

const readBaseline = (): Baseline | undefined => (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : undefined);
const today = () => new Date().toISOString().slice(0, 10);

async function main() {
  const mode = args[0] ?? 'standard';
  const t0 = Date.now();
  const cfg = mode === 'deep' ? { ...DEEP_RUN, lives: Number(args[1] ?? DEEP_RUN.lives) } : STANDARD_RUN;
  console.error(`Playing ${cfg.lives} lives × ${STRATEGIES.length} styles (seeds from ${cfg.seedFrom})…`);
  const samples = await playParallel(cfg.seedFrom, cfg.lives, cfg.maxYears);
  const metrics = summarize(samples);
  const secs = Math.round((Date.now() - t0) / 1000);

  if (mode === 'update') {
    const baseline: Baseline = { meta: { lives: cfg.lives, seedFrom: cfg.seedFrom, maxYears: cfg.maxYears, rulesVersion: RULES_VERSION, updated: today() }, metrics };
    const old = readBaseline();
    writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
    const drift = old ? compareToBaseline(metrics, old.metrics) : [];
    console.log(renderReport({ title: 'Balance baseline updated', metrics, failures: checkBands(metrics), drift, baseline: old }));
    console.log(`Saved ${BASELINE} (${secs}s). Review the changes above, then commit it.`);
    return;
  }

  const baseline = readBaseline();
  const failures = checkBands(metrics);
  if (mode === 'deep') {
    // Different seeds and sample size than the baseline: drift here is a hint, not a failure.
    const drift = baseline ? compareToBaseline(metrics, baseline.metrics) : [];
    const report = renderReport({
      title: `Deep balance check: ${cfg.lives} lives per play style (${today()}, ${secs}s)`,
      metrics, failures, drift: [], baseline,
      extra: [
        ...spreadSection(samples),
        '## Compared with the standard sample', '',
        drift.length ? 'These differ from the baseline by more than seed noise. The standard 60 seeds may not represent the game well for these:\n\n' + drift.map((d) => `- ${d.key}: baseline ${d.before} → deep ${d.after} (${d.reason})`).join('\n') : 'The standard sample agrees with the deep run.', '',
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
  console.log(renderReport({ title: `Balance check (${secs}s)`, metrics, failures, drift, baseline }));
  if (!baseline) console.log('No baseline yet: run `npm run balance:update`.');
  process.exitCode = failures.some((f) => !f.known) || drift.length ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exit(1); });
