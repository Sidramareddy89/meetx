/**
 * MEETX — LLM provider / model probe.
 *
 * Standalone Node script (no deps) that verifies which Gemini and Groq
 * models the keys in `.env` can actually reach, and reports the exact
 * fallback order that works. Run with:
 *
 *   node tools/probe_llm.mjs
 *
 * Exit code 0 = at least one provider+model answered.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

/** Minimal .env parser (KEY=VALUE, ignores comments/blank lines/quotes). */
function loadEnv(path) {
  const out = {};
  try {
    for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
  } catch (err) {
    console.error(`! could not read ${path}: ${err.message}`);
  }
  return out;
}

const env = loadEnv(envPath);

const GEMINI_KEY = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
const GROQ_KEY = env.GROQ_API_KEY || env.VITE_GROQ_API_KEY || '';

const GEMINI_MODELS = (
  env.GEMINI_MODELS || 'gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash,gemini-2.5-flash'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const GROQ_MODELS = (env.GROQ_MODELS || 'openai/gpt-oss-120b,llama-3.3-70b-versatile')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

const PROMPT = 'Reply with exactly one word: pong';

/** Fetch a Gemini model through the OpenAI-compatible chat endpoint. */
async function tryGemini(model) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GEMINI_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: PROMPT }],
      max_tokens: 16,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.text();
  let text = '';
  try {
    text = JSON.parse(body)?.choices?.[0]?.message?.content ?? '';
  } catch {
    /* non-JSON error body */
  }
  return { ok: res.ok && !!text, status: res.status, text, body: body.slice(0, 300) };
}

/** Fetch a Gemini model through the native generateContent endpoint. */
async function tryGeminiNative(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_KEY,
    },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: PROMPT }] }] }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.text();
  let text = '';
  try {
    text = JSON.parse(body)?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } catch {
    /* non-JSON error body */
  }
  return { ok: res.ok && !!text, status: res.status, text, body: body.slice(0, 300) };
}

/** Fetch a Groq model (OpenAI-compatible by definition). */
async function tryGroq(model) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: PROMPT }],
      max_tokens: 16,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.text();
  let text = '';
  try {
    text = JSON.parse(body)?.choices?.[0]?.message?.content ?? '';
  } catch {
    /* non-JSON error body */
  }
  return { ok: res.ok && !!text, status: res.status, text, body: body.slice(0, 300) };
}

async function main() {
  console.log('=== MEETX LLM probe ===');
  console.log(`env file        : ${envPath}`);
  console.log(`GEMINI key      : ${GEMINI_KEY ? GEMINI_KEY.slice(0, 12) + '…' : '(missing)'}`);
  console.log(`GROQ key        : ${GROQ_KEY ? GROQ_KEY.slice(0, 12) + '…' : '(missing)'}`);
  console.log('');

  let anySuccess = false;

  if (GEMINI_KEY) {
    console.log('--- Gemini: OpenAI-compatible endpoint ---');
    for (const model of GEMINI_MODELS) {
      const r = await tryGemini(model);
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${model}  [http ${r.status}]  ${r.ok ? r.text : r.body}`);
      if (r.ok) anySuccess = true;
    }

    console.log('');
    console.log('--- Gemini: native generateContent (x-goog-api-key header) ---');
    for (const model of GEMINI_MODELS) {
      const r = await tryGeminiNative(model);
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${model}  [http ${r.status}]  ${r.ok ? r.text : r.body}`);
      if (r.ok) anySuccess = true;
    }
    console.log('');
  } else {
    console.log('! no Gemini key found — skipping Gemini');
  }

  if (GROQ_KEY) {
    console.log('--- Groq: OpenAI-compatible endpoint ---');
    for (const model of GROQ_MODELS) {
      const r = await tryGroq(model);
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${model}  [http ${r.status}]  ${r.ok ? r.text : r.body}`);
      if (r.ok) anySuccess = true;
    }
    console.log('');
  } else {
    console.log('! no Groq key found — skipping Groq');
  }

  console.log(anySuccess ? 'RESULT: at least one model answered ✅' : 'RESULT: nothing answered ❌');
  process.exit(anySuccess ? 0 : 1);
}

main().catch((err) => {
  console.error('probe crashed:', err);
  process.exit(1);
});
