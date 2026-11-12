/**
 * Run balance lives in parallel child processes (Node only; used by the balance test and
 * scripts/balance.ts). Each worker plays a slice of seeds for one style and prints JSON.
 */
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { SamplesByStrategy } from './metrics';
import { PLAY_STYLES } from './playstyles';
import { livesFor, type LifeSample } from './simulate';

const WORKER = fileURLToPath(new URL('../../scripts/balance.ts', import.meta.url));

function runWorker(style: string, from: number, count: number, maxYears: number): Promise<LifeSample[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', WORKER, '--worker', style, String(from), String(count), String(maxYears)], { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => chunks.push(c));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) : reject(new Error(`balance worker ${style} ${from} exited ${code}`))));
  });
}

/** Play every style at `scale` × its usual number of lives, from `seedFrom`. */
export async function playAllStyles(seedFrom: number, scale: number, maxYears: number, onProgress?: (done: number, total: number) => void): Promise<SamplesByStrategy> {
  const jobs: { style: string; part: number; from: number; count: number }[] = [];
  for (const st of PLAY_STYLES) {
    const lives = livesFor(st, scale);
    const chunk = Math.max(3, Math.ceil(lives / 8));
    for (let i = 0, part = 0; i < lives; i += chunk, part++) jobs.push({ style: st.id, part, from: seedFrom + i, count: Math.min(chunk, lives - i) });
  }
  // Slowest styles first, so the pool drains evenly.
  jobs.sort((a, b) => b.count - a.count);
  const parts: Record<string, LifeSample[][]> = Object.fromEntries(PLAY_STYLES.map((st) => [st.id, []]));
  const slots = Math.max(1, Math.min(availableParallelism() - 1, 16));
  let next = 0;
  let done = 0;
  const work = async () => {
    while (next < jobs.length) {
      const j = jobs[next++];
      parts[j.style][j.part] = await runWorker(j.style, j.from, j.count, maxYears);
      onProgress?.(++done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: slots }, work));
  return Object.fromEntries(PLAY_STYLES.map((st) => [st.id, parts[st.id].flat()]));
}
