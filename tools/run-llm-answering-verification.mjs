/**
 * MEETX — harness for tools/llm-answering.test.mjs
 *
 * Bundles the REAL `src/services/aiAssistantService.ts` (+ llmProviders) with
 * esbuild. The service modules import only types, so no module substitution is
 * required — the test supplies `localStorage` and `fetch` globals itself.
 *
 * Usage:  node tools/run-llm-answering-verification.mjs
 * Exit code 0 = all realtime-LLM assertions passed.
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, 'llm-answering.test.mjs');
const outfile = resolve(__dirname, '.llm-answering-bundle.tmp.mjs');

if (!existsSync(entry)) {
  console.error('! test entry missing');
  process.exit(1);
}

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'warning',
});

const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
rmSync(outfile, { force: true });
process.exit(typeof result.status === 'number' ? result.status : 1);
