/**
 * MEETX — runner for tools/live-llm-smoke.test.mjs
 *
 * Reads the provider keys from `.env` (same minimal parser as probe_llm.mjs),
 * injects them into the child harness, bundles the REAL services with esbuild
 * and executes the live smoke. The key values themselves are never printed.
 *
 * Usage:  node tools/run-live-llm-smoke.mjs
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, 'live-llm-smoke.test.mjs');
const outfile = resolve(__dirname, '.live-llm-smoke.tmp.mjs');

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["'](.*)["']$/, '$1');
  }
  return out;
}

if (!existsSync(entry)) {
  console.error('! smoke entry missing');
  process.exit(1);
}

const env = loadEnv(resolve(__dirname, '..', '.env'));
const geminiKey = env.VITE_GEMINI_API_KEY || env.GEMINI_API_KEY || '';
const groqKey = env.VITE_GROQ_API_KEY || env.GROQ_API_KEY || '';

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'warning',
});

const runner = resolve(__dirname, '.live-llm-wrapper.mjs');
const wrapper = `globalThis.__meetxLiveEnv = { geminiKey: ${JSON.stringify(geminiKey)}, groqKey: ${JSON.stringify(groqKey)} };\nawait import(${JSON.stringify(pathToFileURL(outfile).href)});\n`;
import { writeFileSync } from 'node:fs';
writeFileSync(runner, wrapper, 'utf8');

const result = spawnSync(process.execPath, [runner], { stdio: 'inherit' });
rmSync(outfile, { force: true });
rmSync(runner, { force: true });
process.exit(typeof result.status === 'number' ? result.status : 1);
