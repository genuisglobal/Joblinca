#!/usr/bin/env node
/**
 * CI test runner.
 *
 * Discovers every tests/*.test.{js,ts} file and runs each one (node for .js,
 * tsx for .ts), failing the process if any test exits non-zero. This keeps the
 * suite in CI complete automatically — new test files are picked up without
 * editing package.json.
 *
 * Tests in DENYLIST are skipped because they require live network or paid API
 * keys and would be flaky in CI. The env/key-guarded tests self-skip safely.
 */

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const testsDir = join(repoRoot, 'tests');

// Tests that require live network or paid API access — not suitable for CI.
const DENYLIST = new Set([
  'scrapers-smoke.test.js', // performs live HTTP fetches to job sites
]);

const files = readdirSync(testsDir)
  .filter((f) => /\.test\.(js|ts)$/.test(f))
  .filter((f) => !DENYLIST.has(f))
  .sort();

if (files.length === 0) {
  console.error('No test files found.');
  process.exit(1);
}

console.log(`Running ${files.length} test file(s)\n`);

const failures = [];

for (const file of files) {
  const isTs = file.endsWith('.ts');
  const cmd = process.execPath;
  const args = isTs
    ? [join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join('tests', file)]
    : [join('tests', file)];

  process.stdout.write(`▶ ${file}\n`);
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    failures.push(file);
    console.error(`✗ ${file} (exit ${result.status})\n`);
  } else {
    console.log(`✓ ${file}\n`);
  }
}

console.log('─'.repeat(50));
if (failures.length > 0) {
  console.error(`${failures.length}/${files.length} test file(s) failed:`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log(`All ${files.length} test file(s) passed.`);
