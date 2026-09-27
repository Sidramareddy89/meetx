import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Meeting, MeetingPlatform, SUPPORTED_LANGUAGES, SupportedLanguage, MeetingTranscriptEntry, MeetingResource } from '../types/meeting';
import { generateAssistantResponse } from '../services/aiAssistantService';
import { buildLiveBrief, buildMeetingTranscriptContext, buildMeetingInsights, mergeTranscriptEntriesById, LiveBrief, ConversationActionItem } from '../services/meetingInsightService';
import { createMeetingId, updateStoredMeeting } from '../services/meetingService';
import { useAuth } from './AuthContext';

/**
 * How many meetings a free (non-Pro) account may start. Changing this value
 * grants every existing browser a FRESH full allowance (see the quota
 * initializer below), instead of leaving a counter that was already exhausted
 * under the previous limit.
 */
export const MAX_FREE_MEETINGS = 10;

const FREE_MEETINGS_LEFT_KEY = 'meetx_free_meetings_left';
/** Records which allowance the stored counter belongs to, so a limit change
 *  is detected and the counter is reset rather than resumed at an old value. */
const FREE_MEETINGS_LIMIT_KEY = 'meetx_free_meetings_limit';

export interface AssistantMessage {
  id: string;
  sender: 'assistant' | 'user' | 'system';
  actionType?: 'assist' | 'say' | 'followup' | 'recap' | 'query';
  text: string;
  time: string;
  followupSuggestions?: string[];
}

export type AnswerCardSize = 'compact' | 'normal' | 'expanded';

interface MeetingContextType {
  isDetectable: boolean;
  setIsDetectable: (val: boolean) => void;
  selectedLanguage: SupportedLanguage;
  setSelectedLanguage: (lang: SupportedLanguage) => void;
  /** Real-time subtitle target. Different from selectedLanguage = translate ON. */
  targetLanguage: SupportedLanguage;
  setTargetLanguage: (lang: SupportedLanguage) => void;
  translationEnabled: boolean;
  speakTranslations: boolean;
  setSpeakTranslations: (val: boolean) => void;
  activeMeeting: Meeting | null;
  setActiveMeeting: (meeting: Meeting | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Floating Widget State & Card Sizing
  isFloatingActive: boolean;
  setIsFloatingActive: (val: boolean) => void;
  isWidgetCollapsed: boolean;
  setIsWidgetCollapsed: (val: boolean) => void;
  answerCardSize: AnswerCardSize;
  setAnswerCardSize: (size: AnswerCardSize) => void;
  increaseCardSize: () => void;
  decreaseCardSize: () => void;
  hideMeetxHidesWidget: boolean;
  setHideMeetxHidesWidget: (val: boolean) => void;
  isPlatformClosed: boolean;
  setIsPlatformClosed: (val: boolean) => void;

  // Free Meetings Limit & Plan Modal
  freeMeetingsLeft: number;
  isProUser: boolean;
  isPlanModalOpen: boolean;
  setIsPlanModalOpen: (val: boolean) => void;
  upgradeToPro: (planType: 'pro' | 'pro_undetectable') => void;

  // Live Session & Resources
  liveTranscript: MeetingTranscriptEntry[];
  /** Every remark THIS meeting owns: the lines already stored on its record
   *  plus the lines captured in the current session, merged and deduplicated
   *  by transcript-entry id. This is what the Live Conversation displays, and
   *  it can only ever belong to the meeting that is active right now. */
  currentMeetingTranscript: MeetingTranscriptEntry[];
  addTranscriptEntry: (entry: MeetingTranscriptEntry) => void;
  clearTranscript: () => void;
  liveBrief: LiveBrief | null;
  checkedActions: Set<string>;
  toggleActionCheck: (id: string) => void;
  assistantMessages: AssistantMessage[];
  addAssistantMessage: (msg: AssistantMessage) => void;
  clearAssistantMessages: () => void;
  sessionStartTime: number;

  // Actions
  startMeetingSession: (config: {
    platform?: MeetingPlatform;
    topic?: string;
    meetingLink?: string;
    pastedNotes?: string;
    resources?: MeetingResource[];
    /** Phase 4: persisted meeting record to start (keeps user association). */
    meeting?: Meeting;
    /** Phase 4: authenticated user id to associate the session with. */
    userId?: string;
    /** F2: the single authoritative meeting id created by the caller. */
    meetingId?: string;
  }) => boolean;
  stopMeetingSession: () => void;
  askAssistant: (queryOrAction: string, actionType?: 'assist' | 'say' | 'followup' | 'recap' | 'query') => Promise<void>;
  isThinking: boolean;
}

export const MeetingContext = createContext<MeetingContextType | undefined>(undefined);

export const MeetingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [isDetectable, setIsDetectable] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(SUPPORTED_LANGUAGES[0]);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Floating Widget states & answer card sizing
  const [isFloatingActive, setIsFloatingActive] = useState<boolean>(false);
  const [isWidgetCollapsed, setIsWidgetCollapsed] = useState<boolean>(false);
  const [answerCardSize, setAnswerCardSize] = useState<AnswerCardSize>('normal');
  const [hideMeetxHidesWidget, setHideMeetxHidesWidget] = useState<boolean>(false);
  const [isPlatformClosed, setIsPlatformClosed] = useState<boolean>(false);

  // Free meetings quota & plan modal. The stored counter is tied to the
  // allowance it was created under: when MAX_FREE_MEETINGS differs from the
  // stored one (first run, or the allowance was raised/lowered), the counter is
  // reset to a full allowance instead of resuming an exhausted old value.
  const [freeMeetingsLeft, setFreeMeetingsLeft] = useState<number>(() => {
    const saved = localStorage.getItem(FREE_MEETINGS_LEFT_KEY);
    const savedLimit = Number(localStorage.getItem(FREE_MEETINGS_LIMIT_KEY));
    if (saved === null || savedLimit !== MAX_FREE_MEETINGS) {
      localStorage.setItem(FREE_MEETINGS_LEFT_KEY, String(MAX_FREE_MEETINGS));
      localStorage.setItem(FREE_MEETINGS_LIMIT_KEY, String(MAX_FREE_MEETINGS));
      return MAX_FREE_MEETINGS;
    }
    const parsed = parseInt(saved, 10);
    return Number.isFinite(parsed) ? parsed : MAX_FREE_MEETINGS;
  });
  const [isProUser, setIsProUser] = useState<boolean>(() => {
    return localStorage.getItem('meetx_is_pro') === 'true';
  });
  const [isPlanModalOpen, setIsPlanModalOpen] = useState<boolean>(false);

  // Live session transcript and AI chat
  const [liveTranscript, setLiveTranscript] = useState<MeetingTranscriptEntry[]>([]);
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());
  const [isThinking, setIsThinking] = useState<boolean>(false);
  // Live conversation brief: title/summary/actions/deadlines/reminders,
  // rebuilt from the real transcript on every new line (debounced 800ms).
  const [liveBrief, setLiveBrief] = useState<LiveBrief | null>(null);
  const [checkedActions, setCheckedActions] = useState<Set<string>>(new Set());
  const briefTimer = useRef<number | null>(null);

  const toggleActionCheck = (id: string) => {
    setCheckedActions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Real-time translation target (BCP-47). Defaults to the speech language
  // (translation OFF); picking a different language turns live subtitles on.
  const [targetLanguage, setTargetLanguage] = useState<SupportedLanguage>(SUPPORTED_LANGUAGES[0]);
  const [speakTranslations, setSpeakTranslations] = useState<boolean>(false);
  const translationEnabled = targetLanguage.code !== selectedLanguage.code;

  // Phase 8: debounced persistence of the live transcript back into the
  // stored meeting record, so the Meeting Details page always reflects the
  // ACTUAL conversation (never lost if the session ends unexpectedly).
  const transcriptSaveTimer = useRef<number | null>(null);
  const activeMeetingRef = useRef<Meeting | null>(null);
  // The conversation the meeting record ALREADY owns when this session starts
  // (empty for a brand-new meeting, A1..A3 for a resumed one). It is the fixed
  // baseline every new line is merged onto, so persistence can never write the
  // few lines of this session in place of the stored conversation.
  const sessionBaseTranscriptRef = useRef<MeetingTranscriptEntry[]>([]);
  // The authoritative transcript of the ACTIVE meeting (baseline + this
  // session's lines, deduplicated by entry id). It is the only list written to
  // the meeting record: the debounced flush, the pagehide flush and the
  // completion write all persist exactly this.
  const sessionTranscriptRef = useRef<MeetingTranscriptEntry[]>([]);
  const sessionStartTimeRef = useRef<number>(Date.now());

  const increaseCardSize = () => {
    if (answerCardSize === 'compact') setAnswerCardSize('normal');
    else if (answerCardSize === 'normal') setAnswerCardSize('expanded');
  };

  const decreaseCardSize = () => {
    if (answerCardSize === 'expanded') setAnswerCardSize('normal');
    else if (answerCardSize === 'normal') setAnswerCardSize('compact');
  };

  const upgradeToPro = (planType: 'pro' | 'pro_undetectable') => {
    setIsProUser(true);
    localStorage.setItem('meetx_is_pro', 'true');
    localStorage.setItem('meetx_plan_type', planType);
    setIsPlanModalOpen(false);
  };

  /**
   * Persist the ACTIVE meeting's complete transcript right now (no debounce).
   *
   * The payload is always the merged transcript of the current meeting (the
   * lines its record already held + the lines captured in this session), so a
   * resumed meeting keeps its conversation and a session that captured nothing
   * still completes with the lines the meeting already had.
   * `updateStoredMeeting` merges again on write, which makes this idempotent
   * and safe to call from the debounce, the pagehide handler and the stop
   * action alike.
   */
  const flushTranscriptNow = (
    status: 'live' | 'completed' = 'live',
    duration?: string
  ): Promise<void> => {
    // F2: flush against the live session snapshot (ref, not a stale closure)
    // so the authoritative id/userId are always the ones from session start.
    const session = activeMeetingRef.current;
    if (!session?.id || !session?.userId) return Promise.resolve();
    const merged = mergeTranscriptEntriesById(
      sessionBaseTranscriptRef.current,
      sessionTranscriptRef.current
    );
    sessionTranscriptRef.current = merged;
    const updates: Partial<Pick<Meeting, 'transcript' | 'status' | 'duration' | 'summary'>> = {
      transcript: merged,
      status,
    };
    if (duration !== undefined) updates.duration = duration;
    // Store the insights (summary, key points, tasks, deadlines, reminders) on
    // the record itself, derived from the transcript that is being written. This
    // is what keeps a meeting from showing empty summary/task/deadline sections
    // when it is reopened or read from Firestore. Null for a meeting with no
    // speech: nothing is invented, and any previously stored insights are left
    // untouched rather than being replaced with an empty object.
    const insights = buildMeetingInsights({ ...session, transcript: merged }, merged);
    if (insights) updates.summary = insights;
    return updateStoredMeeting(
      session.id,
      session.userId,
      updates,
      // F2: create the record from this snapshot if the background initial
      // save has not landed yet, instead of silently dropping the flush.
      { ...session, ...updates }
    ).catch((err) => {
      console.warn('Transcript persist warning:', err);
    });
  };

  const persistTranscriptDebounced = () => {
    if (transcriptSaveTimer.current) {
      window.clearTimeout(transcriptSaveTimer.current);
      transcriptSaveTimer.current = null;
    }
    transcriptSaveTimer.current = window.setTimeout(() => {
      transcriptSaveTimer.current = null;
      void flushTranscriptNow('live');
    }, 1200);
  };

  /**
   * Add the time measured in this session to the duration already stored on the
   * meeting, so a resumed meeting reports its total time instead of only the
   * length of the last session. Only the `Xm Ys` format this app writes is
   * understood; anything else is replaced by the measured value.
   */
  const addStoredDuration = (stored: string | undefined, sessionSeconds: number): string => {
    const match = /(\d+)\s*m\s*(\d+)\s*s/.exec(stored || '');
    const previous = match ? Number(match[1]) * 60 + Number(match[2]) : 0;
    const total = previous + Math.max(0, sessionSeconds);
    return `${Math.floor(total / 60)}m ${total % 60}s`;
  };

  const addTranscriptEntry = (entry: MeetingTranscriptEntry) => {
    setLiveTranscript((prev) => {
      // A completed translation replaces its "…translating…" placeholder
      // (same base id) instead of appending a duplicate line.
      let next: MeetingTranscriptEntry[];
      if (entry.id.endsWith('-t')) {
        const baseId = entry.id.slice(0, -2);
        const idx = prev.findIndex((e) => e.id === baseId);
        if (idx !== -1) {
          next = [...prev];
          next[idx] = entry;
        } else {
          next = [...prev, entry];
        }
      } else {
        next = [...prev, entry];
      }
      // The authoritative transcript of THIS meeting = what its record already
      // holds + the lines captured so far. Both the debounced flush and the
      // stop write use this list, never the session-only one, so a resumed
      // meeting grows its conversation instead of replacing it.
      sessionTranscriptRef.current = mergeTranscriptEntriesById(
        sessionBaseTranscriptRef.current,
        next
      );
      persistTranscriptDebounced();
      if (briefTimer.current) window.clearTimeout(briefTimer.current);
      const snapshot = next;
      briefTimer.current = window.setTimeout(() => {
        briefTimer.current = null;
        try {
          const topic = activeMeetingRef.current?.topic || 'Active Meeting';
          // Built from the corrected conversation of this meeting (stored lines
          // + this session's lines), so a resumed meeting's brief is not limited
          // to the few remarks captured since it was reopened.
          const brief = buildLiveBrief(
            topic,
            mergeTranscriptEntriesById(sessionBaseTranscriptRef.current, snapshot)
          );
          if (brief) setLiveBrief(brief);
        } catch (err) {
          console.warn('Live brief build warning:', err);
        }
      }, 800);
      return next;
    });
  };

  const clearTranscript = () => {
    // Only the live view is reset. The meeting's stored conversation is never
    // touched here, and the lines already captured stay in the session
    // transcript that persistence writes.
    setLiveTranscript([]);
  };

  const addAssistantMessage = (msg: AssistantMessage) => {
    setAssistantMessages((prev) => {
      // Never repeat an answer: an auto-answer for a repeated remark, or a
      // retriggered action, must not stack the same text in the card.
      const last = prev[prev.length - 1];
      if (last && last.sender === msg.sender && last.text.trim() === msg.text.trim()) {
        return prev;
      }
      return [...prev, msg];
    });
  };

  const clearAssistantMessages = () => {
    setAssistantMessages([]);
  };

  const startMeetingSession = (config: {
    platform?: MeetingPlatform;
    topic?: string;
    meetingLink?: string;
    pastedNotes?: string;
    resources?: MeetingResource[];
    meeting?: Meeting;
    userId?: string;
    /** F2: authoritative id supplied by the caller (never regenerated here). */
    meetingId?: string;
  }): boolean => {
    // Check the free meetings limit
    if (!isProUser && freeMeetingsLeft <= 0) {
      setIsPlanModalOpen(true);
      return false;
    }

    // Decrement free meetings if not Pro
    if (!isProUser) {
      const updated = freeMeetingsLeft - 1;
      setFreeMeetingsLeft(updated);
      localStorage.setItem(FREE_MEETINGS_LEFT_KEY, updated.toString());
      localStorage.setItem(FREE_MEETINGS_LIMIT_KEY, String(MAX_FREE_MEETINGS));
    }

    // Phase 4: every meeting must be associated with the authenticated user.
    const userId = config.userId || currentUser?.uid || 'user-anonymous';

    let newMeeting: Meeting;
    if (config.meeting && config.meeting.id) {
      // Start from the persisted meeting record (already saved to Firestore/local store),
      // preserving its id and userId so the live session stays associated with the user.
      newMeeting = {
        ...config.meeting,
        userId: config.meeting.userId || userId,
        transcript: config.meeting.transcript || [],
        resources: config.meeting.resources || [],
        status: 'live',
      };
    } else {
      newMeeting = {
        // F2: reuse the caller's authoritative id when one is supplied; this is
        // the only place a session id may be created, and it is generated by
        // meetingService so HomePage, the local record, Firestore, resources,
        // transcript flushes and completion all share one id.
        id: config.meetingId || createMeetingId(),
        userId,
        title: config.topic || 'Live Meeting Session',
        platform: config.platform || 'Google Meet',
        meetingLink: config.meetingLink || '',
        topic: config.topic || 'Live Session',
        selectedLanguage: selectedLanguage.code,
        pastedNotes: config.pastedNotes || '',
        resources: config.resources || [],
        createdAt: Date.now(),
        transcript: [],
        status: 'live',
      };
    }

    activeMeetingRef.current = newMeeting;
    setActiveMeeting(newMeeting);
    setLiveBrief(null);
    setCheckedActions(new Set());
    setSessionStartTime(Date.now());
    // Persistence baseline for this session: the conversation this meeting
    // record ALREADY owns (A1..A3 for a resumed meeting, [] for a new one).
    // Every line captured from now on is merged onto it, so the record can only
    // ever grow and a resume can never trade the stored conversation for the
    // handful of lines spoken in this session.
    sessionBaseTranscriptRef.current = mergeTranscriptEntriesById(newMeeting.transcript, []);
    sessionTranscriptRef.current = sessionBaseTranscriptRef.current;
    sessionStartTimeRef.current = Date.now();
    setLiveTranscript([]);
    setAssistantMessages([
      {
        id: 'msg-init',
        sender: 'assistant',
        actionType: 'assist',
        text: `MEETX is now active and listening in ${selectedLanguage.name}. Click an action pill or ask any question.`,
        time: '0:00',
        followupSuggestions: ['What should I say?', 'Follow-up questions', 'Recap']
      }
    ]);

    setIsPlatformClosed(true);
    setIsFloatingActive(true);
    setIsWidgetCollapsed(false);
    return true;
  };

  const stopMeetingSession = () => {
    // F2: the ref holds the authoritative session (same id/userId as the stored
    // meeting), so completion can never target a different record.
    const meeting = activeMeetingRef.current;

    // Phase 8: flush any pending debounced save, then persist the final
    // transcript + completed status + real duration to the stored record.
    // Always persist — even an empty transcript meeting must transition
    // from 'live' to 'completed' so it does not stay stuck indefinitely.
    if (transcriptSaveTimer.current) {
      window.clearTimeout(transcriptSaveTimer.current);
      transcriptSaveTimer.current = null;
    }
    if (meeting?.id && meeting?.userId) {
      // Write the COMPLETE conversation of this meeting: the lines already
      // stored on the record plus everything captured in this session. A resume
      // that captured nothing therefore still completes the meeting WITH its
      // existing conversation instead of blanking it, and the stored metadata
      // (title/topic/resources/notes) is preserved by the update.
      const sessionSeconds = Math.max(
        0,
        Math.floor((Date.now() - sessionStartTimeRef.current) / 1000)
      );
      void flushTranscriptNow('completed', addStoredDuration(meeting.duration, sessionSeconds));
    }

    if (briefTimer.current) { window.clearTimeout(briefTimer.current); briefTimer.current = null; }
    setLiveBrief(null);
    setIsFloatingActive(false);
    setIsPlatformClosed(false);
    activeMeetingRef.current = null;
    sessionBaseTranscriptRef.current = [];
    sessionTranscriptRef.current = [];
    setActiveMeeting(null);
    setLiveTranscript([]);
  };

  const askAssistantRequest = async (
    queryOrAction: string,
    actionType: 'assist' | 'say' | 'followup' | 'recap' | 'query' = 'query'
  ) => {
    const elapsedSecs = Math.floor((Date.now() - sessionStartTime) / 1000);
    const m = Math.floor(elapsedSecs / 60);
    const s = elapsedSecs % 60;
    const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

    if (actionType === 'query') {
      addAssistantMessage({
        id: Date.now().toString(),
        sender: 'user',
        text: queryOrAction,
        time: timeStr,
      });
    }

    setIsThinking(true);
    try {
      // F4: the assistant answers from the CURRENT meeting ONLY. `activeMeetingRef`
      // is the authoritative snapshot of the selected/resumed meeting (same id
      // the session, transcript flushes and completion use) and carries that
      // meeting's persisted transcript, while `liveTranscript` holds the remarks
      // captured since this session started. They are merged here, deduplicated
      // by entry id, so a resumed meeting contributes its persisted conversation
      // plus the new lines — and switching meetings cannot leak the previous
      // meeting's transcript, because only this snapshot is ever read.
      const session = activeMeetingRef.current;
      const response = await generateAssistantResponse(queryOrAction, actionType, {
        topic: session?.topic || 'Active Meeting',
        pastedNotes: session?.pastedNotes || '',
        resources: session?.resources || [],
        language: selectedLanguage.name,
        transcript: buildMeetingTranscriptContext(session?.transcript, liveTranscript),
      });

      addAssistantMessage({
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        actionType,
        text: response.text,
        time: timeStr,
        followupSuggestions: response.followupSuggestions,
      });
    } finally {
      setIsThinking(false);
    }
  };

  /**
   * Every assistant request runs through this chain, so answers reach the widget
   * ONE BY ONE in the order they were asked.
   *
   * Without it, a burst of participant remarks fired several LLM calls at once:
   * they raced, the answers could land out of order, and a remark that arrived
   * while another request was still in flight was dropped entirely (the
   * auto-answer effect bailed on `isThinking` and never re-ran for it).
   * A rejected request never wedges the chain, so one failure cannot silence
   * every later answer.
   */
  const assistantQueueRef = useRef<Promise<void>>(Promise.resolve());

  const askAssistant = (
    queryOrAction: string,
    actionType: 'assist' | 'say' | 'followup' | 'recap' | 'query' = 'query'
  ): Promise<void> => {
    const run = () => askAssistantRequest(queryOrAction, actionType);
    const next = assistantQueueRef.current.then(run, run);
    assistantQueueRef.current = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  // The conversation of the meeting that is active RIGHT NOW: the lines its
  // record already held plus the lines captured in this session, merged and
  // deduplicated by transcript-entry id. It is derived from
  // `sessionBaseTranscriptRef` (reset for every session) plus the live state,
  // so a resumed meeting displays its full conversation and no other meeting
  // can contribute a line.
  const currentMeetingTranscript = mergeTranscriptEntriesById(
    sessionBaseTranscriptRef.current,
    liveTranscript
  );

  // Persist the pending transcript when the page is hidden, closed, reloaded or
  // navigated away from, instead of losing the last (up to) 1.2 s of speech.
  // The local-store write inside updateStoredMeeting happens synchronously
  // before its first await, so the per-user local record is written even while
  // the tab is being torn down; the Firestore write is best-effort at that
  // point (it cannot survive an abrupt unload).
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const flushOnLeave = () => {
      if (!activeMeetingRef.current) return;
      if (transcriptSaveTimer.current) {
        window.clearTimeout(transcriptSaveTimer.current);
        transcriptSaveTimer.current = null;
      }
      void flushTranscriptNow('live');
    };
    window.addEventListener('pagehide', flushOnLeave);
    window.addEventListener('beforeunload', flushOnLeave);
    return () => {
      window.removeEventListener('pagehide', flushOnLeave);
      window.removeEventListener('beforeunload', flushOnLeave);
    };
    // Registered once: everything this handler needs lives in refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <MeetingContext.Provider
      value={{
        isDetectable,
        setIsDetectable,
        selectedLanguage,
        setSelectedLanguage,
        targetLanguage,
        setTargetLanguage,
        translationEnabled,
        speakTranslations,
        setSpeakTranslations,
        activeMeeting,
        setActiveMeeting,
        searchQuery,
        setSearchQuery,
        isFloatingActive,
        setIsFloatingActive,
        isWidgetCollapsed,
        setIsWidgetCollapsed,
        answerCardSize,
        setAnswerCardSize,
        increaseCardSize,
        decreaseCardSize,
        hideMeetxHidesWidget,
        setHideMeetxHidesWidget,
        isPlatformClosed,
        setIsPlatformClosed,
        freeMeetingsLeft,
        isProUser,
        isPlanModalOpen,
        setIsPlanModalOpen,
        upgradeToPro,
        liveTranscript,
        currentMeetingTranscript,
        addTranscriptEntry,
        clearTranscript,
        liveBrief,
        checkedActions,
        toggleActionCheck,
        assistantMessages,
        addAssistantMessage,
        clearAssistantMessages,
        sessionStartTime,
        startMeetingSession,
        stopMeetingSession,
        askAssistant,
        isThinking,
      }}
    >
      {children}
    </MeetingContext.Provider>
  );
};

export const useMeeting = () => {
  const context = useContext(MeetingContext);
  if (!context) {
    throw new Error('useMeeting must be used within a MeetingProvider');
  }
  return context;
};
