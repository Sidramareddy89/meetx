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
const GROQ = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY || '';

const tests = [
  { label: 'native gemini-2.5-flash', fn: async () => {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly one word: pong' }] }] }),
      signal: AbortSignal.timeout(4000),
    });
    const t = await r.text();
    let txt = ''; try { txt = JSON.parse(t).candidates?.[0]?.content?.parts?.[0]?.text ?? ''; } catch {}
    return { status: r.status, text: txt.slice(0, 80), ok: r.ok && txt.length > 0 };
  }},
  { label: 'native gemini-flash-latest', fn: async () => {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly one word: pong' }] }] }),
      signal: AbortSignal.timeout(4000),
    });
    const t = await r.text();
    let txt = ''; try { txt = JSON.parse(t).candidates?.[0]?.content?.parts?.[0]?.text ?? ''; } catch {}
    return { status: r.status, text: txt.slice(0, 80), ok: r.ok && txt.length > 0 };
  }},
  { label: 'openai gemini-flash-latest', fn: async () => {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GEMINI },
      body: JSON.stringify({ model: 'gemini-flash-latest', messages: [{ role: 'user', content: 'Reply with exactly one word: pong' }], max_tokens: 16 }),
      signal: AbortSignal.timeout(4000),
    });
    const t = await r.text();
    let txt = ''; try { txt = JSON.parse(t).choices?.[0]?.message?.content ?? ''; } catch {}
    return { status: r.status, text: txt.slice(0, 80), ok: r.ok && txt.length > 0 };
  }},
  { label: 'openai gemini-2.5-flash', fn: async () => {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GEMINI },
      body: JSON.stringify({ model: 'gemini-2.5-flash', messages: [{ role: 'user', content: 'Reply with exactly one word: pong' }], max_tokens: 16 }),
      signal: AbortSignal.timeout(4000),
    });
    const t = await r.text();
    let txt = ''; try { txt = JSON.parse(t).choices?.[0]?.message?.content ?? ''; } catch {}
    return { status: r.status, text: txt.slice(0, 80), ok: r.ok && txt.length > 0 };
  }},
  { label: 'openai gemini-2.5-flash-lite', fn: async () => {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GEMINI },
      body: JSON.stringify({ model: 'gemini-2.5-flash-lite', messages: [{ role: 'user', content: 'Reply with exactly one word: pong' }], max_tokens: 16 }),
      signal: AbortSignal.timeout(4000),
    });
    const t = await r.text();
    let txt = ''; try { txt = JSON.parse(t).choices?.[0]?.message?.content ?? ''; } catch {}
    return { status: r.status, text: txt.slice(0, 80), ok: r.ok && txt.length > 0 };
  }},
];

console.log('gemini key present:', !!GEMINI, '| groq key present:', !!GROQ);
for (const t of tests) {
  try {
    const a = await t.fn();
    console.log(t.label, '->', a.status, a.ok ? 'TEXT:' + a.text : 'EMPTY/FAIL');
  } catch (e) {
    console.log(t.label, 'ERROR', e?.message || e);
  }
}
