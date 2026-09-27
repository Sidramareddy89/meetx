import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG = resolve(__dirname, 'find_live_model.out.txt');

const emit = (...args) => {
  const line = args.map((a) => (a && typeof a.toString === 'function') ? a.toString() : String(a)).join(' ');
  writeFileSync(LOG, (readFileSync(LOG, 'utf8') || '') + line + '\n', 'utf8');
  console.log(line);
};
const emitErr = (...args) => {
  const line = args.map((a) => (a && typeof a.toString === 'function') ? a.toString() : String(a)).join(' ');
  emit('ERR: ' + line);
};

const env = {};
for (const line of readFileSync(resolve(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["'](.*)["']$/, '$1');
}

const GEMINI = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
const GROQ = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY || '';
emitErr('keys: gemini=' + !!GEMINI + ' groq=' + !!GROQ);

const candidates = [
  'gemini-1.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
];

const hardStopMs = 60000;
const started = Date.now();
writeFileSync(LOG, `--- rerun @ ${new Date().toISOString()} ---\nkeys: gemini=${!!GEMINI} groq=${!!GROQ}\n`, 'utf8');

async function tryNative(m) {
  if (Date.now() - started > hardStopMs) return null;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly one word: pong' }] }] }),
      signal: AbortSignal.timeout(4000),
    });
    const t = await r.text();
    let txt = '';
    try { txt = JSON.parse(t).candidates?.[0]?.content?.parts?.[0]?.text ?? ''; } catch {}
    return { m, ok: r.ok && txt.length > 0, status: r.status, text: txt.slice(0, 60), body: t.slice(0, 120).replace(/\n/g, ' ') };
  } catch (e) { return { m, ok: false, status: 0, text: '', body: String(e) }; }
}

async function tryOpenai(m) {
  if (Date.now() - started > hardStopMs) return null;
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GEMINI },
      body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'Reply with exactly one word: pong' }], max_tokens: 16 }),
      signal: AbortSignal.timeout(4000),
    });
    const t = await r.text();
    let txt = '';
    try { txt = JSON.parse(t).choices?.[0]?.message?.content ?? ''; } catch {}
    return { m, ok: r.ok && txt.length > 0, status: r.status, text: txt.slice(0, 60), body: t.slice(0, 120).replace(/\n/g, ' ') };
  } catch (e) { return { m, ok: false, status: 0, text: '', body: String(e) }; }
}

(async () => {
  let any = false;
  for (const m of candidates) {
    emitErr('tryNative ' + m);
    const a = await tryNative(m);
    if (!a) { emit('STOP: hard timeout before', m); break; }
    if (a.ok) { emit('PASS gemini-native', a.m, '->', a.text); any = true; }
  }
  for (const m of candidates) {
    emitErr('tryOpenai ' + m);
    const a = await tryOpenai(m);
    if (!a) { emit('STOP: hard timeout before', m); break; }
    if (a.ok) { emit('PASS gemini-openai', a.m, '->', a.text); any = true; }
  }
  emit(any ? 'RESULT: live model found YES' : 'RESULT: nothing answered NO');
  process.exit(any ? 0 : 1);
})().catch((e) => {
  emitErr('crashed', e);
  process.exit(1);
});
