/**
 * Verify developer tools are gated by the build flag:
 *  - a default build contains no usable skip/kill controls;
 *  - a build with VITE_ENABLE_DEV_TOOLS=true keeps them.
 * Run: npm run check:devtools
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MARKERS = ['Kill main character', 'Skip 10 years'];

function build(flag: boolean): string {
  const out = mkdtempSync(join(tmpdir(), flag ? 'ft-dev-' : 'ft-default-'));
  const env = { ...process.env };
  if (flag) env.VITE_ENABLE_DEV_TOOLS = 'true';
  else delete env.VITE_ENABLE_DEV_TOOLS;
  const res = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], { env, shell: true, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`build failed:\n${res.stderr || res.stdout}`);
  return out;
}

function bundleText(dir: string) {
  const assets = join(dir, 'assets');
  return readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(assets, f), 'utf8')).join('\n');
}

let failed = false;
for (const flag of [false, true]) {
  const dir = build(flag);
  const text = bundleText(dir);
  const found = MARKERS.filter((m) => text.includes(m));
  const ok = flag ? found.length === MARKERS.length : found.length === 0;
  console.log(`${flag ? 'flagged' : 'default'} build: dev controls ${found.length ? 'present' : 'absent'} → ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) failed = true;
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
