import { MeetingTranscriptEntry, MeetingResource } from '../types/meeting';
import { callGemini, callGroq, geminiKey, groqKey } from './llmProviders';
import { determineContextRelevance, formatContextDecision } from './meetingContextService';

export interface AssistantContext {
  topic: string;
  pastedNotes?: string;
  resources?: MeetingResource[];
  language: string;
  transcript: MeetingTranscriptEntry[];
}

export interface AssistantResponse {
  text: string;
  followupSuggestions?: string[];
  /**
   * REALTIME LLM FIX: which engine actually produced this answer. `llm` means
   * the returned text is model-generated (Gemini/Groq); `provider-unavailable`
   * means both providers failed and the text is a truthful error, never a
   * stand-in answer; `offline` means no provider key is configured and the
   * deterministic transcript template answered instead.
   */
  source: 'llm' | 'provider-unavailable' | 'offline';
}

/** Displayed when provider keys exist but every provider/model call failed. */
export const PROVIDER_UNAVAILABLE_MESSAGE =
  'AI provider unavailable. Please try again.';

/** High-Intelligence Real-Time QA engine (kept for reference).
 */

/** Text the offline builder produces — the orchestrator decides its `source`. */
interface OfflineAnswer {
  text: string;
  followupSuggestions?: string[];
}

/** Offline conversation engine: answers the 4 widget actions purely from the
 *  REAL transcript + uploaded resources. Never fabricates — when there is no
 *  conversation yet it says so and tells the user what to do. */
function buildOfflineConversationAnswer(
  queryOrAction: string,
  actionType: 'assist' | 'say' | 'followup' | 'recap' | 'query',
  context: AssistantContext
): OfflineAnswer {
  const entries = (context.transcript || []).filter((t) => (t.text || '').trim());
  // PIPELINE 2: Use intelligent historical retrieval rather than a fixed tail.
  // For query action types, retrieve context relevant to the question;
  // for other actions (assist/say/followup/recap) use the most recent 12 lines.
  const recentCount = actionType === 'query' ? 6 : 12;
  const selectedEntries = actionType === 'query' && entries.length > recentCount
    ? (() => {
        // Simple keyword-based retrieval from older entries for offline mode.
        const recent = entries.slice(-recentCount);
        const older = entries.slice(0, Math.max(0, entries.length - recentCount));
        const qWords = new Set(
          (queryOrAction || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 3)
        );
        const relevant = older
          .filter((e) => {
            const words = (e.text || '').toLowerCase().split(/\s+/);
            return words.some((w) => qWords.has(w));
          })
          .slice(-4);
        // Combine: relevant older + recent, deduplicated, chronological.
        const seen = new Set<string>();
        return [...relevant, ...recent].filter((e) => seen.has(e.id) ? false : (seen.add(e.id), true));
      })()
    : entries.slice(-recentCount);
  const lastLines = selectedEntries.map((t) => {
    const speaker = t.speakerName || t.speakerId || 'Speaker';
    const body = (t.translatedText && t.translatedText !== '\u2026translating\u2026' ? t.translatedText : t.text).trim();
    return speaker + ' [' + t.timestamp + ']: ' + body;
  });
  const convo = lastLines.length > 0 ? lastLines.join('\n') : '(no spoken conversation captured yet)';
  const kbNames = (context.resources || []).map((r) => r.name).filter(Boolean);
  const kbLine = kbNames.length > 0 ? 'Knowledge base: ' + kbNames.join(', ') : 'Knowledge base: (none uploaded)';
  const topicLine = 'Meeting: "' + context.topic + '"';

  const emptyGuard =
    entries.length === 0
      ? '\n\nNOTE: no live conversation has been captured yet — start speaking (mic on, Chrome/Edge) and I will answer from the real discussion.'
      : '';

  const tail = (label: string) =>
    '\n\n---\n' + topicLine + ' \u2022 ' + kbLine + '\nLast ' + lastLines.length + ' remarks (' + label + ' from live conversation):\n' + convo;

  if (actionType === 'say') {
    const last = entries.slice(-3).map((t) => t.text.trim()).join(' ');
    const reply = last
      ? 'Say: "Thanks for that — building on what you just said about \u2018' + last.slice(0, 120) + '\u2019, here is my take: [add your 1 key point, then ask: does that align with what you need?]".'
      : 'Say: "Thanks everyone for joining. To make sure we are aligned — could you walk me through the current status and what you need from my side?"';
    return {
      text: reply + tail('script grounded in'),
      followupSuggestions: ['Give me a shorter version', 'Give me 2 follow-up questions', 'Recap so far'],
    };
  }
  if (actionType === 'followup') {
    const qs = buildFollowups(entries, context.topic);
    return {
      text: 'Smart follow-ups for this conversation:\n' + qs.map((q, i) => (i + 1) + '. ' + q).join('\n') + tail('drawn from'),
      followupSuggestions: qs.slice(0, 3),
    };
  }
  if (actionType === 'recap') {
    if (entries.length === 0) {
      return {
        text: 'No conversation to recap yet.' + emptyGuard,
        followupSuggestions: ['What should I say to open?', 'How do I use this widget?'],
      };
    }
    const speakers = Array.from(new Set(entries.map((t) => t.speakerName || t.speakerId || 'Speaker')));
    return {
      text:
        'Live recap (' + entries.length + ' remarks, speakers: ' + speakers.join(', ') + '):\n' +
        lastLines.map((l) => '\u2022 ' + l).join('\n') +
        '\n\n' + kbLine,
      followupSuggestions: ['What should I say next?', 'Give me 2 follow-up questions', 'List action items'],
    };
  }
  if (actionType === 'assist') {
    if (entries.length === 0) {
      return {
        text: 'MEETX is listening in ' + context.language + '. ' + topicLine + '. ' + kbLine + '.' + emptyGuard,
        followupSuggestions: ['What should I say to open?', 'Give me 2 follow-up questions'],
      };
    }
    const last = entries[entries.length - 1];
    return {
      text:
        'Live read: the other side just said \u2018' + last.text.trim().slice(0, 160) + '\u2019. ' +
        'Suggested move: acknowledge it in one line, state your position in one line, then ask one sharp question to keep control.' +
        tail('grounded in'),
      followupSuggestions: ['What should I say?', 'Give me 2 follow-up questions', 'Recap so far'],
    };
  }
  // Free-form query: echo the real context around it so the answer is traceable.
  return {
    text:
      'On "' + queryOrAction.slice(0, 140) + '" — based on the live conversation so far:\n' +
      (lastLines.length > 0 ? lastLines.slice(-4).map((l) => '\u2022 ' + l).join('\n') : '(no remarks yet — speak first)') +
      '\n\n' + kbLine + emptyGuard,
    followupSuggestions: ['What should I say next?', 'Give me 2 follow-up questions', 'Recap so far'],
  };
}

function buildFollowups(entries: MeetingTranscriptEntry[], topic: string): string[] {
  const last = entries.slice(-2).map((t) => t.text.trim()).join(' ').slice(0, 90);
  const base = last ? 'you just mentioned \u2018' + last + '\u2019' : 'this ' + topic + ' discussion';
  return [
    'When you say ' + base + ' — what does success look like from your side?',
    'What is the biggest blocker here, and what would unblock it this week?',
    'Can we agree on one owner and one deadline for the next step?',
    'Is there anything I can clarify or provide from my side right now?',
  ];
}

export const generateAssistantResponse = async (
  queryOrAction: string,
  actionType: 'assist' | 'say' | 'followup' | 'recap' | 'query',
  context: AssistantContext
): Promise<AssistantResponse> => {
  const suggestions = [
    'What should I say next?',
    'Give me 2 follow-up questions',
    'Summarize recent points',
  ];

  // PIPELINE 2: For explicit user questions (actionType === 'query'), determine
  // context relevance BEFORE calling the LLM. This implements the context
  // decision tree described in the task specification.
  if (actionType === 'query' && (geminiKey() || groqKey())) {
    const decision = determineContextRelevance(
      queryOrAction,
      context.transcript,
      context.resources,
      context.topic,
      context.pastedNotes || ''
    );
    if (process.env.NODE_ENV === 'development' || (import.meta as any).env?.DEV) {
      console.debug(formatContextDecision(decision));
    }
    // The decision is used by buildPrompt in llmProviders.ts via the context
    // object — the selectConversationContext function already implements the
    // intelligent retrieval. The decision here is informational (for logging)
    // and for the unrelated-question fast-path.
    if (decision.relevance === 'unrelated') {
      // Direct LLM path: no meeting context injected, just the question.
      // This prevents unrelated meeting chunks from polluting the answer.
      const directContext: AssistantContext = {
        ...context,
        transcript: [],  // No meeting transcript for unrelated questions
        pastedNotes: '', // No meeting notes
        resources: [],   // No meeting resources
      };
      const groqAnswer = await callGroq(queryOrAction, directContext, actionType);
      if (groqAnswer) return { text: groqAnswer, followupSuggestions: suggestions, source: 'llm' };
      const geminiAnswer = await callGemini(queryOrAction, directContext, actionType);
      if (geminiAnswer) return { text: geminiAnswer, followupSuggestions: suggestions, source: 'llm' };
      return { text: PROVIDER_UNAVAILABLE_MESSAGE, followupSuggestions: suggestions, source: 'provider-unavailable' };
    }
    // For meeting-related questions: fall through to the standard RAG path below
    // which uses selectConversationContext for intelligent retrieval.
  }

  // 1. Groq FIRST for realtime questions. openai/gpt-oss-120b is the realtime
  //    model: measured live, it answers in ~0.5-1.3 s, while the Gemini models
  //    were returning 503 "high demand" / 4 s timeouts from this network, which
  //    put a failed first attempt (and its cooldown) in front of every reply.
  //    Gemini stays as the fallback so nothing is lost if Groq rate-limits.
  const groqAnswer = await callGroq(queryOrAction, context, actionType);
  if (groqAnswer) {
    return { text: groqAnswer, followupSuggestions: suggestions, source: 'llm' };
  }

  // 2. Gemini fallback when Groq is unavailable / rate-limited / 4xx.
  //    (gemini-3.7-flash, 3.6-flash, flash-latest one by one; 1.5-flash is retired.)
  const geminiAnswer = await callGemini(queryOrAction, context, actionType);
  if (geminiAnswer) {
    return { text: geminiAnswer, followupSuggestions: suggestions, source: 'llm' };
  }

  // 3. Offline engine — ONLY the legitimate no-key mode. It is grounded in the
  //    REAL transcript + uploaded resources and explicitly tells the user that
  //    no provider is configured, so it can never pass as an LLM answer.
  if (!geminiKey() && !groqKey()) {
    const offline = buildOfflineConversationAnswer(queryOrAction, actionType, context);
    return {
      ...offline,
      text: offline.text + '\n\nProvider: none configured — configure a Gemini/Groq key for live answers.',
      source: 'offline',
    };
  }

  // 4. Keys exist but every provider/model call failed — NEVER present a
  //    template as an LLM answer. Surface a truthful, retryable error instead.
  return { text: PROVIDER_UNAVAILABLE_MESSAGE, followupSuggestions: suggestions, source: 'provider-unavailable' };
};
