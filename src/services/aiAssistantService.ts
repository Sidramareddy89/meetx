import { MeetingTranscriptEntry, MeetingResource } from '../types/meeting';
import { callGemini, callGroq } from './llmProviders';

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
}

/** High-Intelligence Real-Time QA engine (kept for reference).
 */

/** Offline conversation engine: answers the 4 widget actions purely from the
 *  REAL transcript + uploaded resources. Never fabricates — when there is no
 *  conversation yet it says so and tells the user what to do. */
function buildOfflineConversationAnswer(
  queryOrAction: string,
  actionType: 'assist' | 'say' | 'followup' | 'recap' | 'query',
  context: AssistantContext
): AssistantResponse {
  const entries = (context.transcript || []).filter((t) => (t.text || '').trim());
  const lastLines = entries.slice(-8).map((t) => {
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
  // 1. Gemini first (primary) — tries gemini-3.7-flash, 3.6-flash,
  //    flash-latest one by one (gemini-1.5-flash is retired → 404).
  const geminiAnswer = await callGemini(queryOrAction, context);
  if (geminiAnswer) {
    return {
      text: geminiAnswer,
      followupSuggestions: [
        'What should I say next?',
        'Give me 2 follow-up questions',
        'Summarize recent points',
      ],
    };
  }

  // 2. Groq fallback when Gemini is unavailable / rate-limited / 4xx.
  const groqAnswer = await callGroq(queryOrAction, context);
  if (groqAnswer) {
    return {
      text: groqAnswer,
      followupSuggestions: [
        'What should I say next?',
        'Give me 2 follow-up questions',
        'Summarize recent points',
      ],
    };
  }

  // 3. Offline engine — grounded in the REAL transcript + uploaded
  //    resources. Never blank, labels itself as transcript-based.
  return buildOfflineConversationAnswer(queryOrAction, actionType, context);
};
