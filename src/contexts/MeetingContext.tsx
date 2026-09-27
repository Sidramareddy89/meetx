import React, { createContext, useContext, useState, useRef } from 'react';
import { Meeting, MeetingPlatform, SUPPORTED_LANGUAGES, SupportedLanguage, MeetingTranscriptEntry, MeetingResource } from '../types/meeting';
import { generateAssistantResponse } from '../services/aiAssistantService';
import { buildLiveBrief, buildMeetingTranscriptContext, LiveBrief, ConversationActionItem } from '../services/meetingInsightService';
import { createMeetingId, updateStoredMeeting } from '../services/meetingService';
import { useAuth } from './AuthContext';

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

const MeetingContext = createContext<MeetingContextType | undefined>(undefined);

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

  // 3 Free Meetings Quota & Plan Modal
  const [freeMeetingsLeft, setFreeMeetingsLeft] = useState<number>(() => {
    const saved = localStorage.getItem('meetx_free_meetings_left');
    return saved !== null ? parseInt(saved, 10) : 3;
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

  const persistTranscriptDebounced = (entries: MeetingTranscriptEntry[]) => {
    if (transcriptSaveTimer.current) {
      window.clearTimeout(transcriptSaveTimer.current);
      transcriptSaveTimer.current = null;
    }
    transcriptSaveTimer.current = window.setTimeout(async () => {
      transcriptSaveTimer.current = null;
      // F2: flush against the live session snapshot (ref, not a stale closure)
      // so the authoritative id/userId are always the ones from session start.
      const session = activeMeetingRef.current;
      if (!session?.id || !session?.userId || entries.length === 0) return;
      try {
        await updateStoredMeeting(
          session.id,
          session.userId,
          {
            transcript: entries,
            status: 'live',
          },
          // F2: create the record from this snapshot if the background initial
          // save has not landed yet, instead of silently dropping the flush.
          session
        );
      } catch (err) {
        console.warn('Transcript persist warning:', err);
      }
    }, 1200);
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
      persistTranscriptDebounced(next);
      if (briefTimer.current) window.clearTimeout(briefTimer.current);
      const snapshot = next;
      briefTimer.current = window.setTimeout(() => {
        briefTimer.current = null;
        try {
          const topic = activeMeetingRef.current?.topic || 'Active Meeting';
          const brief = buildLiveBrief(topic, snapshot);
          if (brief) setLiveBrief(brief);
        } catch (err) {
          console.warn('Live brief build warning:', err);
        }
      }, 800);
      return next;
    });
  };

  const clearTranscript = () => {
    setLiveTranscript([]);
  };

  const addAssistantMessage = (msg: AssistantMessage) => {
    setAssistantMessages((prev) => [...prev, msg]);
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
    // Check 3 Free Meetings limit
    if (!isProUser && freeMeetingsLeft <= 0) {
      setIsPlanModalOpen(true);
      return false;
    }

    // Decrement free meetings if not Pro
    if (!isProUser) {
      const updated = freeMeetingsLeft - 1;
      setFreeMeetingsLeft(updated);
      localStorage.setItem('meetx_free_meetings_left', updated.toString());
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
      const secs = Math.floor((Date.now() - sessionStartTime) / 1000);
      const mm = Math.floor(secs / 60);
      const ss = secs % 60;
      updateStoredMeeting(
        meeting.id,
        meeting.userId,
        {
          transcript: liveTranscript,
          status: 'completed',
          duration: `${mm}m ${ss}s`,
        },
        // F2: same snapshot — if the record is still in flight, create it with
        // the completed status so the meeting can never stay 'live'.
        meeting
      ).catch((err) => console.warn('Final transcript persist warning:', err));
    }

    if (briefTimer.current) { window.clearTimeout(briefTimer.current); briefTimer.current = null; }
    setLiveBrief(null);
    setIsFloatingActive(false);
    setIsPlatformClosed(false);
    activeMeetingRef.current = null;
    setActiveMeeting(null);
    setLiveTranscript([]);
  };

  const askAssistant = async (
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
