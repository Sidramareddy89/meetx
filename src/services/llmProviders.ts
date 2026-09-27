// LLM providers: Gemini first, Groq second (both verified 2026-09-26).
// Keys from VITE_GEMINI_API_KEY / VITE_GROQ_API_KEY (or localStorage
// overrides meetx_gemini_api_key / meetx_groq_api_key). Model lists from
// VITE_GEMINI_MODELS / VITE_GROQ_MODELS with working defaults.
// REALTIME LLM FIX: every provider/model attempt records a redacted diagnostic
// (provider, model, outcome, latency, error category) retrievable with
// getLlmDiagnostics(). Keys/headers are never logged.
import { AssistantContext } from './aiAssistantService';

export const geminiKey = (): string =>
  (((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY ||
    localStorage.getItem('meetx_gemini_api_key')) ||
    '').trim();

export const groqKey = (): string =>
  (((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GROQ_API_KEY ||
    localStorage.getItem('meetx_groq_api_key')) ||
    '').trim();

const splitModels = (raw: string, fallback: string[]): string[] => {
  const list = (raw || '').split(',').map((m) => m.trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
};

export const GEMINI_DEFAULTS = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-flash-latest'];
export const GROQ_DEFAULTS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

export const geminiModels = (): string[] =>
  splitModels(
    ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GEMINI_MODELS || ''),
    GEMINI_DEFAULTS
  );

export const groqModels = (): string[] =>
  splitModels(
    ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GROQ_MODELS || ''),
    GROQ_DEFAULTS
  );

/**
 * How many recent remarks are sent to the model. The realtime answer has to be
 * grounded in the WHOLE conversation while still reacting to the newest remark,
 * so the window is wide enough to carry the discussion, not just the last few
 * lines. A numbered, speaker-attributed line per remark.
 */
const MAX_TRANSCRIPT_LINES = 24;

export const buildPrompt = (
  prompt: string,
  context: AssistantContext,
  actionType: 'assist' | 'say' | 'followup' | 'recap' | 'query' = 'query'
): string => {
  // Numbered so the newest remark can be pointed at by reference instead of by
  // repeating its text (repeating a remark made it look like two statements).
  const transcriptLines = context.transcript.slice(-MAX_TRANSCRIPT_LINES).map((t, i) => {
    const body =
      t.translatedText && !t.translatedText.includes('translating')
        ? t.translatedText
        : t.text;
    return `${i + 1}. ${t.speakerName || t.speakerId} [${t.timestamp}]: ${body}`;
  });
  const transcriptSnippet = transcriptLines.join('\n');
  // Which numbered remark the answer is about right now.
  const latestLineNo = transcriptLines.length;
  const kbSnippet = (context.resources || [])
    .map((r) => {
      let body = r.content || '';
      if (!body && r.url && r.url.startsWith('data:text/plain')) {
        try {
          body = decodeURIComponent(r.url.split(',')[1]);
        } catch {
          body = '';
        }
      }
      return `### ${r.name}\n${body || '(binary file content not extracted)'}`;
    })
    .filter((b) => b.trim())
    .join('\n\n');
  const kbBlock = kbSnippet ? `\nKnowledge Base (uploaded documents):\n${kbSnippet}\n` : '';
  // Whether real speech was captured is the single most important fact about
  // the request: when it was not, the model must still be useful (answer from
  // the topic/notes/documents and say how to enable grounding) instead of
  // refusing with "no transcript given", which is what the previous wording
  // ("Answer strictly from the transcript") produced in the widget.
  const hasTranscript = transcriptSnippet.trim().length > 0;
  const groundingRule = hasTranscript
    ? 'Answer strictly from the transcript; if info is missing, say so in one line.'
    : 'NO TRANSCRIPT HAS BEEN CAPTURED YET. Never refuse and never say you were given no ' +
      'transcript. Answer from the meeting topic, the user notes and the uploaded documents, ' +
      'then close with one short line telling the user to turn on the microphone so answers ' +
      'are grounded in the live conversation.';
  return (
    `You are MEETX, an elite real-time multilingual AI meeting copilot.\n` +
    `Meeting Topic: "${context.topic}".\nLanguage: "${context.language}".\n` +
    `User Notes: "${(context.pastedNotes || '').slice(0, 1000)}"` +
    `${kbBlock}Recent Transcript (real, live, oldest first):\n${transcriptSnippet || '(no speech captured yet — microphone off, not permitted, or silent)'}\n\n` +
    (latestLineNo ? `The participant just spoke remark #${latestLineNo} - answer THAT remark, using the rest of the conversation as context.\n\n` : '') +
    `Rules - REPLY FAST AND CONCISE. Answer in TEXT ONLY, in exactly this shape:` +
    `\n1) the answer itself - one or two short lines, at most 25 words (or up to 3 short bullets). ` +
    (actionType === 'say'
      ? `The user is asking WHAT TO SAY, so start the answer with "Say: ...".`
      : `The user is asking a question, so answer it directly and do NOT start with "Say:".`) +
    `\n2) then a single line starting with "Context:" that gives the short reason in a few ` +
    `words (you may add the remark number in brackets). ` +
    `\nStop there. No preamble, no filler, no disclaimers, no repetition, no offer to ` +
    `elaborate, and never mention audio, voice, speaking aloud or reading aloud - the ` +
    `answer is read on screen.` +
    `\nUse the whole conversation above for context, and answer the most recent remark. ` +
    `${groundingRule}\n\n` +
    `User Question: ${prompt}`
  );
};

// Circuit breaker: when Gemini rate-limits (429/503) or hangs, skip it
// entirely for a short window and answer via Groq instead - keeps
// replies fast instead of waiting on failing Gemini calls.
let geminiCooldownUntil = 0;

export type LlmErrorCategory =
  | 'no-key'
  | 'cooldown'
  | 'timeout'
  | 'rate-limit'
  | 'server-error'
  | 'client-error'
  | 'empty-response'
  | 'network-error';

export interface LlmAttemptDiagnostic {
  provider: 'gemini' | 'groq';
  model: string;
  ok: boolean;
  latencyMs: number;
  httpStatus?: number;
  errorCategory?: LlmErrorCategory;
  /** Same shape for native + chat endpoints: what the request was for. */
  endpoint: 'gemini:generateContent' | 'groq:chat-completions';
}

const LLM_DIAGNOSTICS_CAP = 50;
const llmDiagnostics: LlmAttemptDiagnostic[] = [];

/** REALTIME LLM FIX: most-recent-first read of redacted provider diagnostics. */
export const getLlmDiagnostics = (): LlmAttemptDiagnostic[] => [...llmDiagnostics].reverse();

/** REALTIME LLM FIX: tests/dev harness reset — never used by the widget. */
export const clearLlmDiagnostics = (): void => {
  llmDiagnostics.length = 0;
};

const recordAttempt = (attempt: LlmAttemptDiagnostic): void => {
  llmDiagnostics.push(attempt);
  if (llmDiagnostics.length > LLM_DIAGNOSTICS_CAP) llmDiagnostics.shift();
  // Development-safe single-line log: attempt outcome only, never keys/headers.
  if ((import.meta as unknown as { env?: Record<string, string> }).env?.DEV) {
    const detail =
      attempt.ok
        ? 'ok'
        : `${attempt.errorCategory || 'network-error'}${attempt.httpStatus !== undefined ? ` http=${attempt.httpStatus}` : ''}`;
    console.debug(
      `[llm] ${attempt.provider}/${attempt.model} ${detail} ${attempt.latencyMs}ms`
    );
  }
};

const classifyGeminiError = (status: number): LlmErrorCategory =>
  status === 429 ? 'rate-limit' : status >= 500 ? 'server-error' : 'client-error';

export async function callGemini(
  prompt: string,
  context: AssistantContext,
  actionType: 'assist' | 'say' | 'followup' | 'recap' | 'query' = 'query'
): Promise<string | null> {
  const apiKey = geminiKey();
  if (!apiKey) {
    return null;
  }
  if (Date.now() < geminiCooldownUntil) {
    recordAttempt({
      provider: 'gemini',
      model: geminiModels()[0] || GEMINI_DEFAULTS[0],
      ok: false,
      latencyMs: 0,
      errorCategory: 'cooldown',
      endpoint: 'gemini:generateContent',
    });
    return null;
  }
  const fullPrompt = buildPrompt(prompt, context, actionType);
  for (const model of geminiModels()) {
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
          }),
        }
      );
      clearTimeout(timer);
      const latencyMs = Date.now() - startedAt;
      // Fast-fail: rate-limit / server error / timeout -> activate
      // cooldown and let the caller fall back to Groq immediately.
      if (res.status === 429 || res.status >= 500) {
        geminiCooldownUntil = Date.now() + 60000;
        recordAttempt({
          provider: 'gemini',
          model,
          ok: false,
          latencyMs,
          httpStatus: res.status,
          errorCategory: classifyGeminiError(res.status),
          endpoint: 'gemini:generateContent',
        });
        return null;
      }
      if (!res.ok) {
        recordAttempt({
          provider: 'gemini',
          model,
          ok: false,
          latencyMs,
          httpStatus: res.status,
          errorCategory: classifyGeminiError(res.status),
          endpoint: 'gemini:generateContent',
        });
        continue;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && String(text).trim()) {
        recordAttempt({ provider: 'gemini', model, ok: true, latencyMs, httpStatus: res.status, endpoint: 'gemini:generateContent' });
        return String(text).trim();
      }
      recordAttempt({
        provider: 'gemini',
        model,
        ok: false,
        latencyMs,
        httpStatus: res.status,
        errorCategory: 'empty-response',
        endpoint: 'gemini:generateContent',
      });
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const timedOut = err instanceof Error && err.name === 'AbortError';
      // Abort/timeout -> same fast-fail: cooldown, use Groq now.
      geminiCooldownUntil = Date.now() + 30000;
      recordAttempt({
        provider: 'gemini',
        model,
        ok: false,
        latencyMs,
        errorCategory: timedOut ? 'timeout' : 'network-error',
        endpoint: 'gemini:generateContent',
      });
      return null;
    }
  }
  return null;
}

export async function callGroq(
  prompt: string,
  context: AssistantContext,
  actionType: 'assist' | 'say' | 'followup' | 'recap' | 'query' = 'query'
): Promise<string | null> {
  const apiKey = groqKey();
  if (!apiKey) {
    return null;
  }
  const fullPrompt = buildPrompt(prompt, context, actionType);
  for (const model of groqModels()) {
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                'You are MEETX, a real-time multilingual AI meeting copilot. TEXT ONLY: never produce audio, never suggest speaking or reading aloud. Answer in exactly two parts - (1) the answer, one or two short lines, at most 25 words or up to 3 short bullets, starting with "Say: ..." when asked what to say; (2) a single "Context:" line naming the remark it is based on. Then stop. No preamble, filler or disclaimers. Ground answers in the transcript when one has been captured; when none has, still answer from the topic and notes and say how to enable the mic. Never reply that you were given no transcript.',
            },
            { role: 'user', content: fullPrompt },
          ],
          max_tokens: 1024,
          ...(model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
          temperature: 0.3,
        }),
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - startedAt;
      // Fast-fail: rate-limit / server error -> caller moves to the next
      // fallback at once.
      if (res.status === 429 || res.status >= 500) {
        recordAttempt({
          provider: 'groq',
          model,
          ok: false,
          latencyMs,
          httpStatus: res.status,
          errorCategory: res.status === 429 ? 'rate-limit' : 'server-error',
          endpoint: 'groq:chat-completions',
        });
        return null;
      }
      if (!res.ok) {
        recordAttempt({
          provider: 'groq',
          model,
          ok: false,
          latencyMs,
          httpStatus: res.status,
          errorCategory: 'client-error',
          endpoint: 'groq:chat-completions',
        });
        continue;
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text && String(text).trim()) {
        recordAttempt({ provider: 'groq', model, ok: true, latencyMs, httpStatus: res.status, endpoint: 'groq:chat-completions' });
        return String(text).trim();
      }
      recordAttempt({
        provider: 'groq',
        model,
        ok: false,
        latencyMs,
        httpStatus: res.status,
        errorCategory: 'empty-response',
        endpoint: 'groq:chat-completions',
      });
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const timedOut = err instanceof Error && err.name === 'AbortError';
      recordAttempt({
        provider: 'groq',
        model,
        ok: false,
        latencyMs,
        errorCategory: timedOut ? 'timeout' : 'network-error',
        endpoint: 'groq:chat-completions',
      });
      continue;
    }
  }
  return null;
}
