/**
 * MEETX — harness for tools/f1-recognizer-lifecycle.test.mjs
 *
 * Bundles the REAL `src/hooks/useSpeechToText.ts` with esbuild and substitutes
 * ONLY the `react` module with a faithful minimal hook runtime
 * (tools/react-hook-shim.mjs), so the hook's useCallback/useEffect dependency
 * semantics — the exact mechanism behind the F1 bug — are exercised for real in
 * Node. No application source is modified.
 *
 * Usage:  node tools/run-f1-verification.mjs
 * Exit code 0 = all recognizer-lifecycle assertions passed.
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, 'f1-recognizer-lifecycle.test.mjs');
const reactShim = resolve(__dirname, 'react-hook-shim.mjs');
const outfile = resolve(__dirname, '.f1-bundle.tmp.mjs');

const reactShimPlugin = {
  name: 'react-hook-shim',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^react$/ }, () => ({ path: reactShim }));
  },
};

if (!existsSync(entry) || !existsSync(reactShim)) {
  console.error('! test entry or react shim missing');
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
  plugins: [reactShimPlugin],
});

const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
rmSync(outfile, { force: true });
process.exit(typeof result.status === 'number' ? result.status : 1);
