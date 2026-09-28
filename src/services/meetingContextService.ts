/**
 * meetingContextService.ts
 *
 * PIPELINE 2 — Context Relevance Decision Engine
 *
 * Determines whether a user question is related to the current meeting context,
 * and selects the appropriate processing path:
 *   - RELATED: retrieve relevant meeting context → RAG + LLM
 *   - NOT RELATED: direct LLM processing
 *
 * This is intentionally separate from Pipeline 1 (continuous STT→transcript).
 * The two pipelines share meeting context but never trigger each other.
 */

import { MeetingTranscriptEntry, MeetingResource } from '../types/meeting';
import { selectConversationContext, selectRelevantResources, contentKeywords } from './llmProviders';

export type ContextRelevance =
  | 'meeting-related'      // Question is related to current meeting discussion
  | 'historical-meeting'   // Question relates to earlier part of the meeting
  | 'document-related'     // Question relates to uploaded documents
  | 'unrelated';           // Question is clearly general/unrelated to meeting

export interface ContextDecision {
  relevance: ContextRelevance;
  confidence: number;  // 0-1
  reason: string;
  /** Relevant transcript entries for grounding the answer. */
  relevantEntries: MeetingTranscriptEntry[];
  /** Relevant resource text for RAG. */
  relevantResourceText: string;
  /** Whether to use RAG (meeting context + resources) or direct LLM. */
  useRAG: boolean;
}

/** Minimum keyword overlap score to consider a question meeting-related. */
const MEETING_RELEVANCE_THRESHOLD = 0.15;

/** Recent transcript window always considered part of the meeting context. */
const RECENT_WINDOW = 12;

/**
 * Determine whether a question is related to the active meeting context.
 *
 * This is the core of Pipeline 2's context decision:
 *   1. Check if the question overlaps with recent conversation topics
 *   2. Check if it overlaps with earlier meeting history
 *   3. Check if it overlaps with uploaded documents
 *   4. If none: classify as unrelated → direct LLM
 *
 * Does NOT call the LLM itself — only inspects the available context.
 */
export function determineContextRelevance(
  question: string,
  transcript: MeetingTranscriptEntry[],
  resources: MeetingResource[] | undefined,
  topic: string,
  pastedNotes: string
): ContextDecision {
  const spoken = (transcript || []).filter((e) => (e.text || '').trim());
  const questionWords = new Set(contentKeywords('', question));

  // --- Step 1: Check meeting topic/notes relevance ---
  const topicWords = contentKeywords(`${topic} ${pastedNotes}`);
  const topicOverlap = topicWords.filter((w) => questionWords.has(w)).length;
  const topicScore = topicOverlap / Math.max(1, Math.sqrt(questionWords.size));

  // --- Step 2: Check recent conversation (last RECENT_WINDOW entries) ---
  const recent = spoken.slice(-RECENT_WINDOW);
  const recentText = recent.map((e) => e.text).join(' ');
  const recentWords = contentKeywords(recentText);
  const recentOverlap = recentWords.filter((w) => questionWords.has(w)).length;
  const recentScore = recentOverlap / Math.max(1, Math.sqrt(Math.max(recentWords.length, 1)));

  // --- Step 3: Check historical conversation (older entries) ---
  const older = spoken.slice(0, Math.max(0, spoken.length - RECENT_WINDOW));
  const olderText = older.map((e) => e.text).join(' ');
  const olderWords = contentKeywords(olderText);
  const olderOverlap = olderWords.filter((w) => questionWords.has(w)).length;
  const olderScore = olderOverlap / Math.max(1, Math.sqrt(Math.max(olderWords.length, 1)));

  // --- Step 4: Check uploaded documents ---
  const resourceText = selectRelevantResources(resources, question, `${topic} ${pastedNotes}`);
  const hasRelevantResources = resourceText.trim().length > 0;

  // Determine the best context selection for the answer.
  const contextSelection = selectConversationContext(spoken, question);
  const relevantEntries = spoken.filter((e) =>
    contextSelection.lines.some((line) => line.includes(`id ${e.id}`))
  );

  // --- Decision logic ---
  const maxScore = Math.max(recentScore, olderScore, topicScore);
  const isMeetingRelated = maxScore >= MEETING_RELEVANCE_THRESHOLD || hasRelevantResources;

  if (!isMeetingRelated && spoken.length > 0) {
    // Check if question uses pronouns that reference meeting context
    // ("it", "they", "the project", "our", "we") — these almost always mean
    // the user is asking about something discussed in the meeting.
    const meetingPronouns = /\b(it|its|they|their|our|we|the project|the system|the app|the feature|the bug|the issue|the deadline|the meeting|the discussion|what was discussed|discussed|discuss|remember|recall|conversation|talking about|talked about|mentioned|summarize|summary|recap|overview|points|action items)\b/i;
    if (meetingPronouns.test(question)) {
      return {
        relevance: 'meeting-related',
        confidence: 0.6,
        reason: 'Question uses pronouns that likely refer to meeting context',
        relevantEntries,
        relevantResourceText: resourceText,
        useRAG: true,
      };
    }
  }

  if (!isMeetingRelated) {
    return {
      relevance: 'unrelated',
      confidence: 1 - maxScore,
      reason: 'Question does not overlap with meeting topics, conversation, or documents',
      relevantEntries: [],
      relevantResourceText: '',
      useRAG: false,
    };
  }

  if (hasRelevantResources && recentScore < MEETING_RELEVANCE_THRESHOLD && olderScore < MEETING_RELEVANCE_THRESHOLD) {
    return {
      relevance: 'document-related',
      confidence: 0.7,
      reason: 'Question matches uploaded documents but not the spoken conversation',
      relevantEntries,
      relevantResourceText: resourceText,
      useRAG: true,
    };
  }

  if (olderScore > recentScore && older.length > 0) {
    return {
      relevance: 'historical-meeting',
      confidence: olderScore,
      reason: 'Question relates to earlier part of the meeting (historical context retrieved)',
      relevantEntries,
      relevantResourceText: resourceText,
      useRAG: true,
    };
  }

  return {
    relevance: 'meeting-related',
    confidence: maxScore,
    reason: 'Question is related to the current or recent meeting discussion',
    relevantEntries,
    relevantResourceText: resourceText,
    useRAG: true,
  };
}

/**
 * Format the context decision for logging/debugging.
 * This is purely informational and has no effect on the answer.
 */
export function formatContextDecision(decision: ContextDecision): string {
  return `[ContextDecision] relevance=${decision.relevance} confidence=${decision.confidence.toFixed(2)} useRAG=${decision.useRAG} entries=${decision.relevantEntries.length} reason="${decision.reason}"`;
}
