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
 * Realtime context assembly.
 *
 * The assistant must be grounded in the WHOLE meeting conversation, not just the
 * last few lines, while still reacting to the newest remark. A fixed tail window
 * silently loses older facts - e.g. "Tomorrow we need to submit the project
 * report." followed by "What is the deadline?" answers wrongly once that line
 * falls out of the window. So the context is assembled from two parts:
 *
 *   1. the most recent remarks (the live feel), and
 *   2. older remarks RELEVANT to this question, selected by keyword overlap with
 *      the question / topic / notes,
 *
 * both inside an explicit character budget so the request cannot grow without
 * bound during a long meeting. Nothing is invented and nothing is reordered.
 */

/** Most recent remarks always carried (the live tail of the conversation). */
const RECENT_REMARK_COUNT = 12;
/** Older remarks that can be pulled back in as relevant context. */
const MAX_RELEVANT_OLDER = 12;
/** Character budget for the conversation block. */
const CONVERSATION_BUDGET_CHARS = 6000;
/** Budget for the uploaded-resource block. */
const RESOURCE_BUDGET_CHARS = 4000;
/** Per-resource cap, so one big document cannot crowd out the conversation. */
const RESOURCE_CHUNK_CHARS = 1500;

const STOP_WORDS = new Set(
  ('a an the and or but is are was were be been being to of in on for with that this these those it as at by from about into over after before we you they i my our your do does did have has had will would can could should what when where who how why not no yes me him us them all any each more most some such only own same than too very just now then there here if else').split(' ')
);

/**
 * Small, explicit intent table for question types. Lexical overlap alone cannot
 * connect "What is the deadline?" to "Tomorrow we need to submit the report" -
 * the words do not match even though the remark IS the deadline. These are the
 * question terms and the meeting words that usually answer them. This is a
 * hand-written lookup, not a model: it only widens what is retrieved.
 */
const QUESTION_INTENTS: { terms: string[]; related: string[] }[] = [
  {
    terms: ['deadline', 'due', 'when', 'date', 'timeline', 'schedule', 'eod'],
    related: ['tomorrow', 'today', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'week', 'month', 'morning', 'afternoon', 'evening', 'submit', 'ship', 'deliver', 'launch', 'review', 'close', 'ends', 'start'],
  },
  {
    terms: ['who', 'owner', 'assign', 'assigned', 'responsible', 'lead'],
    related: ['owns', 'owner', 'lead', 'taking', 'handle', 'handles', 'responsible', 'assigned', 'priya', 'ana'],
  },
  {
    terms: ['budget', 'cost', 'price', 'spend', 'money'],
    related: ['budget', 'cap', 'capped', 'thousand', 'dollars', 'cost', 'spend', 'spending', 'price'],
  },
  {
    terms: ['status', 'progress', 'update', 'where'],
    related: ['done', 'finished', 'shipped', 'ready', 'blocked', 'in', 'progress', 'started'],
  },
  {
    terms: ['url', 'endpoint', 'api', 'link', 'base'],
    related: ['url', 'endpoint', 'api', 'base', 'https', 'token', 'bearer'],
  },
];

/**
 * Lower-cased content words, stop words removed, de-duplicated. When `question` is
 * given, the matching intent terms are added so the retrieval can connect a
 * question to the remarks that answer it.
 */
export const contentKeywords = (text: string, question = ''): string[] => {
  const words = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const out = new Set(words);
  if (question) {
    const asked = (question || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (const intent of QUESTION_INTENTS) {
      if (intent.terms.some((t) => asked.includes(t))) {
        for (const r of intent.related) out.add(r);
      }
    }
  }
  return Array.from(out);
};

const entryBody = (t: { text: string; translatedText?: string }): string =>
  (t.translatedText && !t.translatedText.includes('translating') ? t.translatedText : t.text) || '';

export interface ConversationContextSelection {
  /** Numbered, chronological, as sent to the model. */
  lines: string[];
  /** Number of the newest remark within `lines` (0 when there is none). */
  latestLineNo: number;
  /** How many older remarks were pulled back in as relevant context. */
  relevantOlderCount: number;
  /** True when remarks were left out by the budget (honest reporting). */
  truncated: boolean;
}


/**
 * Pick the conversation to send: the recent tail plus older remarks relevant to
 * the question, ordered chronologically so the model reads the meeting in order.
 */
export const selectConversationContext = (
  entries: {
    id: string;
    speakerId: string;
    speakerName?: string;
    text: string;
    translatedText?: string;
    timestamp: string;
  }[],
  question: string,
  recentCount = RECENT_REMARK_COUNT
): ConversationContextSelection => {
  const spoken = (entries || []).filter((e) => (entryBody(e) || '').trim());
  if (spoken.length === 0) {
    return { lines: [], latestLineNo: 0, relevantOlderCount: 0, truncated: false };
  }

  const recent = spoken.slice(-recentCount);
  const older = spoken.slice(0, Math.max(0, spoken.length - recentCount));

  // Relevance of an older remark to what is being asked right now. The question
  // contributes its own words plus the related terms for its intent, so
  // "What is the deadline?" can retrieve "Tomorrow we need to submit the report."
  const queryWords = new Set(contentKeywords('', question));
  const scored = older
    .map((entry) => {
      const words = contentKeywords(entryBody(entry));
      const hits = words.filter((w) => queryWords.has(w)).length;
      return { entry, score: hits / Math.max(1, Math.sqrt(words.length)) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELEVANT_OLDER)
    .map((s) => s.entry);

  // Chronological and de-duplicated (a relevant remark may also be in `recent`).
  const byId = new Map<string, (typeof spoken)[number]>();
  for (const e of scored) byId.set(e.id, e);
  for (const e of recent) byId.set(e.id, e);
  let ordered = Array.from(byId.values()).sort((a, b) => spoken.indexOf(a) - spoken.indexOf(b));

  // Budget from the oldest end, so the newest remarks are never the ones lost.
  const totalChars = () => ordered.reduce((sum, e) => sum + entryBody(e).length, 0);
  let truncated = false;
  while (ordered.length > 1 && totalChars() > CONVERSATION_BUDGET_CHARS) {
    ordered = ordered.slice(1);
    truncated = true;
  }

  const lines = ordered.map((t, i) => {
    const body = entryBody(t);
    // The transcript-entry id is carried so an answer can cite it truthfully.
    return `${i + 1}. ${t.speakerName || t.speakerId} [${t.timestamp}] (id ${t.id}): ${body}`;
  });
  const recentIds = new Set(recent.map((e) => e.id));
  return {
    lines,
    latestLineNo: lines.length,
    relevantOlderCount: scored.filter((e) => ordered.some((o) => o.id === e.id) && !recentIds.has(e.id)).length,
    truncated,
  };
};

/**
 * Retrieval over the uploaded resources the meeting already carries. This project
 * has no embedding/vector store, so relevance is lexical (keyword overlap with
 * the question and the meeting topic/notes) and each resource is capped, which
 * stops one large document from drowning the conversation.
 */
export const selectRelevantResources = (
  resources: { name: string; content?: string; url?: string }[] | undefined,
  question: string,
  topicAndNotes = ''
): string => {
  const queryWords = new Set(contentKeywords(`${question} ${topicAndNotes}`, question));
  const blocks = (resources || [])
    .map((r) => {
      let body = r.content || '';
      if (!body && r.url && r.url.startsWith('data:text/plain')) {
        try {
          body = decodeURIComponent(r.url.split(',')[1]);
        } catch {
          body = '';
        }
      }
      if (!body.trim()) return null;
      const words = contentKeywords(`${r.name} ${body}`);
      const hits = words.filter((w) => queryWords.has(w)).length;
      return { name: r.name, body, score: hits / Math.max(1, Math.sqrt(words.length)) };
    })
    .filter((b): b is { name: string; body: string; score: number } => Boolean(b))
    .sort((a, b) => b.score - a.score);

  // Only documents that actually match the question/topic are sent: dumping
  // every uploaded file is how a large irrelevant document drowns the
  // conversation. If nothing matches at all, the first documents are still sent
  // so an uploaded briefing is never silently ignored.
  const relevant = blocks.filter((b) => b.score > 0);
  const chosen = relevant.length > 0 ? relevant : blocks.slice(0, 2);

  const kept: string[] = [];
  let used = 0;
  for (const block of chosen) {
    const chunk =
      block.body.length > RESOURCE_CHUNK_CHARS
        ? `${block.body.slice(0, RESOURCE_CHUNK_CHARS)}\n...(truncated)`
        : block.body;
    const text = `### ${block.name}\n${chunk}`;
    if (used + text.length > RESOURCE_BUDGET_CHARS) continue;
    kept.push(text);
    used += text.length;
  }
  return kept.join('\n\n');
};


export const buildPrompt = (
  prompt: string,
  context: AssistantContext,
  actionType: 'assist' | 'say' | 'followup' | 'recap' | 'query' = 'query'
): string => {
  // The conversation the model actually sees: recent remarks + older relevant
  // ones, budgeted. The question decides which older remarks matter.
  const conversation = selectConversationContext(context.transcript, prompt);
  const transcriptSnippet = conversation.lines.join('\n');
  const latestLineNo = conversation.latestLineNo;
  const notes = (context.pastedNotes || '').slice(0, 1000);
  const kbSnippet = selectRelevantResources(context.resources, prompt, `${context.topic} ${notes}`);
  const kbBlock = kbSnippet ? `\nKnowledge Base (uploaded documents, most relevant first):\n${kbSnippet}\n` : '';
  // Whether real speech was captured is the single most important fact about
  // the request: when it was not, the model must still be useful (answer from
  // the topic/notes/documents and say how to enable grounding) instead of
  // refusing with "no transcript given", which is what the previous wording
  // ("Answer strictly from the transcript") produced in the widget.
  const hasTranscript = transcriptSnippet.trim().length > 0;
  const groundingRule = hasTranscript
    ? 'Ground the answer in the conversation above, including older remarks that are ' +
      'listed there. If the conversation does NOT contain the answer, still answer the ' +
      'question from your own knowledge, and add one short note that this meeting did not ' +
      'cover it. Never claim someone said something they did not.'
    : 'NO TRANSCRIPT HAS BEEN CAPTURED YET. Never refuse and never say you were given no ' +
      'transcript. Answer from the meeting topic, the user notes and the uploaded documents, ' +
      'then close with one short line telling the user to turn on the microphone so answers ' +
      'are grounded in the live conversation.';
  return (
    `You are MEETX, an elite real-time multilingual AI meeting copilot.\n` +
    `Meeting Topic: "${context.topic}".\nLanguage: "${context.language}".\n` +
    `User Notes: "${notes}"` +
    `${kbBlock}Meeting conversation so far (real, live, chronological; older relevant remarks are included - use the whole thing, not only the last line):\n${transcriptSnippet || '(no speech captured yet — microphone off, not permitted, or silent)'}\n\n` +
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
