/**
 * MEETX — LIVE realtime-LLM smoke test (real provider endpoints).
 *
 * Runs the REAL `generateAssistantResponse` against the real Gemini/Groq APIs
 * using the keys from `.env` (read and injected by run-live-llm-smoke.mjs).
 * Prints, per question: which engine produced the answer (source), which
 * provider/model served it, MEASURED wall-clock latency, and the answer text.
 * Never prints a key.
 *
 * Run:  node tools/run-live-llm-smoke.mjs
 * Exit 0 = all 4 questions were answered by a real LLM.
 */

import { generateAssistantResponse } from '../src/services/aiAssistantService';
import { getLlmDiagnostics, clearLlmDiagnostics } from '../src/services/llmProviders';

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

const QUESTIONS = [
  'What was discussed in this meeting?',
  'Explain the last topic simply.',
  'What should I say next?',
  'Summarize the conversation so far.',
];

const CONTEXT = {
  topic: 'Beta planning',
  pastedNotes: 'Focus on the March launch checklist and pricing page ownership.',
  resources: [{ id: 'r-1', name: 'launch-brief.txt', type: 'text/plain' }],
  language: 'English (US)',
  transcript: [
    { id: 't-1', speakerId: 'Speaker', text: 'We agreed the beta ships in March.', timestamp: '0:10', language: 'en-US' },
    { id: 't-2', speakerId: 'Speaker', text: 'Priya owns the pricing page refresh.', timestamp: '0:24', language: 'en-US' },
    { id: 't-3', speakerId: 'Speaker', text: 'Legal review is due next Friday.', timestamp: '1:02', language: 'en-US' },
    { id: 't-4', speakerId: 'Speaker', text: 'Budget for ads is capped at twenty thousand.', timestamp: '1:41', language: 'en-US' },
  ],
};

const main = async () => {
  installStorage();
  const env = globalThis.__meetxLiveEnv || {};
  if (!env.geminiKey && !env.groqKey) {
    console.error('! no provider keys injected by the runner');
    process.exit(1);
  }
  // The services read keys from localStorage (VITE_ env is absent in Node).
  if (env.geminiKey) localStorage.setItem('meetx_gemini_api_key', env.geminiKey);
  if (env.groqKey) localStorage.setItem('meetx_groq_api_key', env.groqKey);

  console.log('=== MEETX LIVE realtime-LLM smoke ===');
  console.log(`keys injected: gemini=${!!env.geminiKey} groq=${!!env.groqKey}\n`);

  let llmAnswers = 0;
  for (const question of QUESTIONS) {
    clearLlmDiagnostics();
    const started = Date.now();
    const response = await generateAssistantResponse(question, 'query', CONTEXT);
    const wallMs = Date.now() - started;
    const served = getLlmDiagnostics().find((d) => d.ok);
    const failedAttempts = getLlmDiagnostics().filter((d) => !d.ok);

    if (response.source === 'llm') llmAnswers += 1;
    console.log(`Q: ${question}`);
    console.log(`   source    : ${response.source}`);
    console.log(
      `   served by : ${served ? `${served.provider}/${served.model} (attempt ${served.latencyMs}ms, http ${served.httpStatus ?? '-'})` : 'none'}`
    );
    console.log(`   wall time : ${wallMs}ms`);
    if (failedAttempts.length) {
      console.log(
        `   retries   : ${failedAttempts.map((d) => `${d.provider}/${d.model}=${d.errorCategory ?? 'http' + d.httpStatus}`).join(', ')}`
      );
    }
    console.log(`   answer    : ${response.text.replace(/\s+/g, ' ').slice(0, 220)}`);
    console.log('');
  }

  console.log(`${llmAnswers}/${QUESTIONS.length} answered by a real LLM`);
  console.log(llmAnswers === QUESTIONS.length ? 'RESULT: live LLM answering works' : 'RESULT: some questions fell back');
  process.exit(llmAnswers === QUESTIONS.length ? 0 : 1);
};

main().catch((err) => {
  console.error('live smoke crashed:', err && err.message ? err.message : err);
  process.exit(1);
});
