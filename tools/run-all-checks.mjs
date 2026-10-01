/**
 * MEETX — one-command verification suite (cross-platform, no shell needed).
 *
 *   node tools/run-all-checks.mjs            # encoding + web-only guards + offline harnesses
 *   node tools/run-all-checks.mjs --live     # also ping the real LLM endpoints
 *
 * Used by `npm test`; `npm run verify` adds the type check and production build.
 * Exit code 0 = every step passed. Each harness bundles the REAL `src/**` with
 * esbuild and stubs only Node-hostile browser boundaries.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const live = process.argv.includes('--live');

/** [label, node args] — run in order; each entry is one verification step. */
const steps = [
  ['encoding hygiene guard', ['tools/encoding-hygiene.test.mjs']],
  ['web-only architecture guard', ['tools/web-only-architecture.test.mjs']],
  ['auth architecture guard', ['tools/auth-architecture.test.mjs']],
  ['floating-window lifecycle', ['tools/run-floating-window-lifecycle.mjs']],
  ['widget realtime flow', ['tools/run-widget-realtime-flow.mjs']],
  ['meeting data lifecycle', ['tools/run-meeting-data-lifecycle.mjs']],
  ['free-meeting quota', ['tools/run-meeting-data-lifecycle.mjs', 'free-meeting-quota.test.mjs']],
  ['meeting display', ['tools/run-meeting-display.mjs']],
  ['F1 recognizer lifecycle', ['tools/run-f1-verification.mjs']],
  ['F2/F3 persistence', ['tools/run-f2f3-verification.mjs']],
  ['F4 assistant context', ['tools/run-f4-verification.mjs']],
  ['LLM answering (offline)', ['tools/run-llm-answering-verification.mjs']],
];

if (live) {
  steps.push(['live LLM probe (network)', ['tools/probe_llm.mjs']]);
}

const results = [];
for (const [label, args] of steps) {
  const entry = resolve(root, args[0]);
  if (!existsSync(entry)) {
    console.error(`! missing harness: ${args[0]}`);
    results.push({ label, code: 1 });
    continue;
  }
  const run = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  const code = typeof run.status === 'number' ? run.status : 1;
  results.push({ label, code });
}

// Each harness prints a "N passed, M failed" style tail; summarise here too.
const failed = results.filter((r) => r.code !== 0);
console.log('\n=== MEETX check summary ===');
for (const { label, code } of results) {
  console.log(`${code === 0 ? 'PASS' : 'FAIL'}  ${label}${code === 0 ? '' : ` (exit ${code})`}`);
}
console.log(failed.length ? `\n${failed.length} step(s) failed` : '\nall steps passed');
process.exit(failed.length ? 1 : 0);
