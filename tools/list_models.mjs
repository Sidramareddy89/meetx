import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(resolve(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["'](.*)["']$/, '$1');
}
const GEMINI = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';

const start = Date.now();
try {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + GEMINI, {
    signal: AbortSignal.timeout(8000),
  });
  const t = await r.text();
  console.log('status', r.status, 'elapsed', Date.now() - start, 'ms');
  console.log('body', t.slice(0, 4000));
} catch (e) {
  console.log('error', e?.message || e, 'elapsed', Date.now() - start, 'ms');
}
