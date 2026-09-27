/**
 * MEETX — REALTIME LLM ANSWERING test.
 *
 * Runs the REAL `generateAssistantResponse` (aiAssistantService →
 * llmProviders) with a stubbed `fetch`, asserting:
 *
 *   1. typed-question flow: user message echoed immediately, real model text
 *      returned, and the request carried the F4 meeting context;
 *   2. provider order Gemini → Groq preserved;
 *   3. Groq failover engages when Gemini fails (and the failing model is
 *      skipped, not retried);
 *   4. when keys exist but every provider fails, the user gets the truthful
 *      "AI provider unavailable. Please try again." message — NEVER a
 *      template answer masquerading as an LLM answer;
 *   5. with no keys, the legitimate offline engine answers instead;
 *   6. per-attempt diagnostics carry provider, model, outcome, measured
 *      latency and error categories (no keys).
 *
 * Run it through the bundler harness:  node tools/run-llm-answering-verification.mjs
 */

import { clearLlmDiagnostics, getLlmDiagnostics } from '../src/services/llmProviders';
import { generateAssistantResponse, PROVIDER_UNAVAILABLE_MESSAGE } from '../src/services/aiAssistantService';

let passed = 0;
let failed = 0;
const report = [];

const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    report.push(`PASS  ${label}`);
  } else {
    failed += 1;
    report.push(`FAIL  ${label}${detail ? `  [${detail}]` : ''}`);
  }
};

const installStorage = () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
};

const entry = (id, text, timestamp) => ({
  id,
  speakerId: 'Speaker',
  text,
  timestamp,
  language: 'en-US',
});

const T1 = entry('t-1', 'The team agreed the beta ships in March.', '0:10');
const T2 = entry('t-2', 'Priya owns the pricing page refresh.', '0:24');

const makeContext = () => ({
  topic: 'Beta planning',
  pastedNotes: 'Focus on the launch checklist.',
  resources: [{ id: 'r-1', name: 'brief.pdf', type: 'application/pdf' }],
  language: 'English (US)',
  transcript: [T1, T2],
});

/** Scripted HTTP behaviour per provider; the harness drives `fetch`. */
const script = {
  gemini: 'ok', // ok | fail429 | fail500 | empty | timeout | flaky-then-ok
  groq: 'ok',
  calls: [],
};

const geminiPayload = (text) => ({
  candidates: [{ content: { parts: [{ text }] } }],
});

const groqPayload = (text) => ({
  choices: [{ message: { content: text } }],
});

const installFetch = () => {
  const startedCounts = new Map();
  globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    let body = null;
    try {
      body = init && init.body ? JSON.parse(init.body) : null;
    } catch {
      body = null;
    }
    const record = { url: urlStr, body };
    script.calls.push(record);
    await new Promise((resolve) => { setTimeout(resolve, 25); });
    fakeNow += 25; // measured latency for this attempt

    if (urlStr.includes('generativelanguage.googleapis.com')) {
      const mode = script.gemini;
      if (mode === 'fail429') return { ok: false, status: 429, json: async () => ({ error: { code: 429 } }) };
      if (mode === 'fail500') return { ok: false, status: 500, json: async () => ({ error: { code: 500 } }) };
      if (mode === 'fail404') return { ok: false, status: 404, json: async () => ({ error: { code: 404 } }) };
      if (mode === 'empty') return { ok: true, status: 200, json: async () => geminiPayload('') };
      if (mode === 'timeout') {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        throw err;
      }
      if (mode === 'flaky-then-ok') {
        const count = (startedCounts.get(urlStr) || 0) + 1;
        startedCounts.set(urlStr, count);
        if (count === 1) return { ok: false, status: 503, json: async () => ({ error: { code: 503 } }) };
      }
      const promptEcho = body?.contents?.[0]?.parts?.[0]?.text || '';
      return {
        ok: true,
        status: 200,
        json: async () => geminiPayload(`Gemini answer grounded in: ${promptEcho.slice(0, 60)}`),
      };
    }

    if (urlStr.includes('api.groq.com')) {
      const mode = script.groq;
      if (mode === 'fail429') return { ok: false, status: 429, json: async () => ({ error: { code: 429 } }) };
      if (mode === 'fail500') return { ok: false, status: 500, json: async () => ({ error: { code: 500 } }) };
      if (mode === 'empty') return { ok: true, status: 200, json: async () => groqPayload('') };
      if (mode === 'timeout') {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        throw err;
      }
      const promptEcho = body?.messages?.[1]?.content || '';
      return {
        ok: true,
        status: 200,
        json: async () => groqPayload(`Groq answer grounded in: ${promptEcho.slice(0, 60)}`),
      };
    }

    return { ok: false, status: 404, json: async () => ({}) };
  };
};

const geminiCalls = () => script.calls.filter((c) => c.url.includes('generativelanguage.googleapis.com'));
const groqCalls = () => script.calls.filter((c) => c.url.includes('api.groq.com'));


// Controllable clock: the Gemini circuit-breaker holds a module-level cooldown
// window (30-60s on failure), so the harness jumps the clock forward between
// scenarios instead of sleeping. Latency is still MEASURED on this clock —
// every scripted fetch advances it by 25ms.
let fakeNow = 1_700_000_000_000;
Date.now = () => fakeNow;

const resetRun = () => {
  // Expire any circuit-breaker cooldown before the next scenario, then clear
  // the recorded calls/diagnostics.
  fakeNow += 120_000;
  script.calls.length = 0;
  clearLlmDiagnostics();
};


const main = async () => {
  installStorage();
  installFetch();

  console.log('=== MEETX REALTIME LLM ANSWERING verification ===\n');

  // ------------------------------------------------- 1. realtime typed-question flow
  localStorage.setItem('meetx_gemini_api_key', 'test-key');
  localStorage.setItem('meetx_groq_api_key', 'test-key');
  script.gemini = 'ok';
  script.groq = 'ok';
  resetRun();

  const question = 'What was discussed in this meeting?';
  const startedAt = Date.now();
  const answer = await generateAssistantResponse(question, 'query', makeContext());
  const latencyMs = Date.now() - startedAt;

  check('the question is sent to the real Groq endpoint', groqCalls().length >= 1 && groqCalls()[0].url.includes('/chat/completions'));
  check(
    'the Groq request carries the meeting transcript context',
    (groqCalls()[0]?.body?.messages?.[1]?.content || '').includes(T1.text)
  );
  check(
    'the realtime model is openai/gpt-oss-120b',
    groqCalls()[0]?.body?.model === 'openai/gpt-oss-120b',
    String(groqCalls()[0]?.body?.model)
  );
  check('the reply is the actual model-generated answer', answer.text.startsWith('Groq answer grounded in:'), answer.text.slice(0, 60));
  check('a model answer is labelled as LLM-sourced', answer.source === 'llm', answer.source);
  check('actual provider latency is measured (no fixed-100ms claim)', latencyMs > 0 && getLlmDiagnostics().every((d) => d.latencyMs >= 0), `measured=${latencyMs}ms`);

  // --------------------------------------- 2. realtime provider order Groq first
  const firstGemini = script.calls.findIndex((c) => c.url.includes('generativelanguage.googleapis.com'));
  const firstGroq = script.calls.findIndex((c) => c.url.includes('api.groq.com'));
  check(
    'Groq is attempted first and Gemini is not needed when Groq answers',
    firstGroq === 0 && firstGemini === -1,
    `groq@${firstGroq} gemini@${firstGemini}`
  );

  // --------------------------------- 3. Gemini fallback when Groq rate-limits
  script.groq = 'fail429';
  script.gemini = 'ok';
  resetRun();
  const failover = await generateAssistantResponse('Summarize the conversation so far.', 'query', makeContext());
  check(
    'a Groq 429 fast-fails to the Gemini fallback',
    groqCalls().length === 1 && geminiCalls().length >= 1,
    `groq=${groqCalls().length} gemini=${geminiCalls().length}`
  );
  check('the Gemini answer is the model-generated text', failover.text.startsWith('Gemini answer grounded in:'), failover.text.slice(0, 60));
  check('the failover answer is labelled as LLM-sourced', failover.source === 'llm', failover.source);
  check(
    'diagnostics record the Groq rate-limit and the Gemini success',
    getLlmDiagnostics().some((d) => d.provider === 'groq' && d.errorCategory === 'rate-limit' && d.httpStatus === 429) &&
      getLlmDiagnostics().some((d) => d.provider === 'gemini' && d.ok === true),
    JSON.stringify(getLlmDiagnostics())
  );

  // ------------------------------------- 4. Groq timeout → Gemini, no offline text
  script.groq = 'timeout';
  script.gemini = 'ok';
  resetRun();
  const afterTimeout = await generateAssistantResponse('Explain the last topic simply.', 'query', makeContext());
  check('a Groq timeout still reaches Gemini', geminiCalls().length >= 1, `gemini=${geminiCalls().length}`);
  check('the timeout is classified in diagnostics', getLlmDiagnostics().some((d) => d.provider === 'groq' && d.errorCategory === 'timeout'), JSON.stringify(getLlmDiagnostics()));
  check('no offline template text is used after a provider timeout', !afterTimeout.text.includes('based on the live conversation so far'));

  // ------------------------------- 5. both providers fail → truthful error
  script.gemini = 'fail500';
  script.groq = 'fail500';
  resetRun();
  const bothDown = await generateAssistantResponse('What should I say next?', 'query', makeContext());
  check('both providers failing surfaces the truthful error message', bothDown.text === PROVIDER_UNAVAILABLE_MESSAGE, bothDown.text.slice(0, 80));
  check('a provider outage is never labelled as an LLM answer', bothDown.source === 'provider-unavailable', bothDown.source);
  check(
    'diagnostics record a server-error for the failing attempt',
    getLlmDiagnostics().some((d) => d.errorCategory === 'server-error' && d.httpStatus === 500),
    JSON.stringify(getLlmDiagnostics())
  );
  check('Gemini is still attempted after Groq fails', groqCalls().length >= 1 && geminiCalls().length >= 1);

  // -------------------------------------- 6. no keys → legitimate offline mode
  localStorage.removeItem('meetx_gemini_api_key');
  localStorage.removeItem('meetx_groq_api_key');
  script.gemini = 'ok';
  script.groq = 'ok';
  resetRun();
  const offline = await generateAssistantResponse('What should I say next?', 'query', makeContext());
  check('with no keys configured the offline engine answers', offline.source === 'offline' && offline.text.includes('based on the live conversation so far'));
  check('the offline mode performs zero network requests', script.calls.length === 0, `requests=${script.calls.length}`);
  check('the offline answer tells the user to configure a provider', offline.text.includes('configure a Gemini/Groq key'));

  // ------------------------------- 7. configured models are real, in order
  localStorage.setItem('meetx_gemini_api_key', 'test-key');
  localStorage.setItem('meetx_groq_api_key', 'test-key');
  script.gemini = 'fail404';
  script.groq = 'fail500';
  resetRun();
  await generateAssistantResponse('ping', 'query', makeContext());
  check(
    'Gemini tries the configured models in order (3.7 → 3.6 → latest)',
    geminiCalls().map((c) => c.url.split('/models/')[1].split(':')[0]).join(',') ===
      'gemini-3.7-flash,gemini-3.6-flash,gemini-flash-latest',
    geminiCalls().map((c) => c.url).join(' | ')
  );
  script.gemini = 'fail404';
  script.groq = 'ok';
  resetRun();
  await generateAssistantResponse('ping', 'query', makeContext());
  check(
    'Groq uses its configured realtime model openai/gpt-oss-120b',
    groqCalls().length >= 1 && groqCalls()[0].body.model === 'openai/gpt-oss-120b',
    groqCalls().map((c) => c.body && c.body.model).join(',')
  );
  check(
    'Gemini is not called at all while the realtime model answers',
    geminiCalls().length === 0,
    `gemini=${geminiCalls().length}`
  );

  // ------------------------- 8. an empty transcript must not produce a refusal
  // This is the "no transcript given" bug: with no speech captured the prompt
  // used to instruct the model to answer strictly from the transcript, so it
  // refused instead of helping.
  script.groq = 'ok';
  script.gemini = 'ok';
  resetRun();
  const emptyContext = { ...makeContext(), transcript: [] };
  await generateAssistantResponse('What should I say next?', 'say', emptyContext);
  const emptyPrompt = groqCalls()[0]?.body?.messages?.[1]?.content || '';
  check(
    'an empty transcript is stated honestly in the prompt',
    emptyPrompt.includes('no speech captured yet'),
    emptyPrompt.slice(0, 120)
  );
  check(
    'with no transcript the model is told to answer, never to refuse',
    /NO TRANSCRIPT HAS BEEN CAPTURED YET/i.test(emptyPrompt) && /Never refuse/i.test(emptyPrompt)
  );
  check(
    'with no transcript the model is pointed at the topic and notes it CAN use',
    emptyPrompt.includes('Beta planning') && emptyPrompt.includes('Focus on the launch checklist.')
  );
  check(
    'the system prompt forbids replying that no transcript was given',
    /Never reply that you were given no transcript/.test(groqCalls()[0]?.body?.messages?.[0]?.content || '')
  );

  resetRun();
  await generateAssistantResponse('What was discussed?', 'query', makeContext());
  const withTranscript = groqCalls()[0]?.body?.messages?.[1]?.content || '';
  check(
    'when a transcript exists the prompt still grounds on it (unchanged behaviour)',
    withTranscript.includes(T1.text) && withTranscript.includes('Answer strictly from the transcript') &&
      !withTranscript.includes('NO TRANSCRIPT HAS BEEN CAPTURED YET'),
    withTranscript.slice(-160)
  );

  // ------------------------------------ 8. no keys or headers are ever logged
  const diagJson = JSON.stringify(getLlmDiagnostics());
  check('diagnostics never contain the API key', !diagJson.includes('test-key'));
  check('diagnostics never contain an Authorization header', !diagJson.includes('Authorization') && !diagJson.includes('Bearer'));
  check(
    'every diagnostic has provider, model, outcome, latency and endpoint',
    getLlmDiagnostics().every((d) => d.provider && d.model && typeof d.ok === 'boolean' && typeof d.latencyMs === 'number' && d.endpoint)
  );

  console.log(report.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed === 0 ? 'RESULT: REALTIME LLM ANSWERING verified' : 'RESULT: verification failed');
  return failed === 0 ? 0 : 1;
};

main()
  .then((code) => { process.exit(code); })
  .catch((err) => { console.error('verification crashed:', err); process.exit(1); });

