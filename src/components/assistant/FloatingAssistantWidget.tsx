import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  MessageSquare,
  RotateCcw,
  Send,
  ChevronDown,
  ChevronUp,
  Square,
  MoreHorizontal,
  Eye,
  EyeOff,
  Mic,
  ArrowRight,
  PictureInPicture,
  Maximize2,
  Minimize2,
  CreditCard,
  Layers,
  Loader2,
  Copy,
  Check,
  Languages,
  Volume2,
  VolumeX,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Monitor,
  ShieldCheck,
  X
} from 'lucide-react';
import { useAssistantMeeting } from '../../desktop/assistantBridge';
import { hideNativeAssistantWindow, isNativeAssistantWindow } from '../../desktop/nativeAssistantWindow';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useSpeechToText } from '../../hooks/useSpeechToText';
import { useDesktopAssistantWindow } from '../../hooks/useDesktopAssistantWindow';
import { SUPPORTED_LANGUAGES } from '../../types/meeting';
import { LiveConversationPane } from './LiveConversationPane';
import { LiveBriefPane } from './LiveBriefPane';

const renderMessageContent = (
  text: string,
  msgId: string,
  copiedId: string | null,
  onCopy: (id: string, text: string) => void
) => {
  if (text.includes('```')) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const raw = part.slice(3, -3);
        const newlineIdx = raw.indexOf('\n');
        const lang = newlineIdx !== -1 ? raw.slice(0, newlineIdx).trim() : '';
        const code = newlineIdx !== -1 ? raw.slice(newlineIdx + 1) : raw;
        const codeId = `${msgId}-code-${i}`;
        const isCopied = copiedId === codeId;
        return (
          <div
            key={i}
            className="my-2.5 rounded-xl bg-[#0d1117] border border-slate-700/70 overflow-hidden select-text shadow-lg"
          >
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/60 text-[10px]">
              <span className="text-[10px] uppercase tracking-wider text-slate-300 font-mono font-semibold">
                {lang || 'Code'}
              </span>
              <button
                type="button"
                onClick={() => onCopy(codeId, code)}
                className="flex items-center gap-1 text-[10px] text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-slate-700/50"
                title="Copy code snippet"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-slate-400" />
                    <span>Copy code</span>
                  </>
                )}
              </button>
            </div>
            <pre className="p-3 font-mono text-[11px] leading-relaxed text-emerald-300 overflow-x-auto whitespace-pre">
              {code}
            </pre>
          </div>
        );
      }
      return (
        <div key={i} className="whitespace-pre-line leading-relaxed">
          {part}
        </div>
      );
    });
  }
  return <div className="whitespace-pre-line leading-relaxed">{text}</div>;
};

type WidgetPosition = { x: number; y: number };
type AssistantMode = 'assist' | 'whatToSay' | 'followUp' | 'recap';

const VIEWPORT_MARGIN = 10;
const FALLBACK_WIDGET_WIDTH = 500;
const FALLBACK_WIDGET_HEIGHT = 200;

const clampWidgetPosition = (
  nextPosition: WidgetPosition,
  widget: HTMLDivElement | null,
  // The viewport of whichever window hosts the widget: the app window in-page,
  // or the desktop floating window while it is open.
  viewport: Pick<Window, 'innerWidth' | 'innerHeight'> = window
): WidgetPosition => {
  const width = widget?.offsetWidth || FALLBACK_WIDGET_WIDTH;
  const height = widget?.offsetHeight || FALLBACK_WIDGET_HEIGHT;
  const availableWidth = Math.max(0, viewport.innerWidth - width);
  const availableHeight = Math.max(0, viewport.innerHeight - height);
  const minX = Math.min(VIEWPORT_MARGIN, availableWidth);
  const minY = Math.min(VIEWPORT_MARGIN, availableHeight);
  const maxX = Math.max(minX, availableWidth - VIEWPORT_MARGIN);
  const maxY = Math.max(minY, availableHeight - VIEWPORT_MARGIN);

  return {
    x: Math.min(Math.max(nextPosition.x, minX), maxX),
    y: Math.min(Math.max(nextPosition.y, minY), maxY),
  };
};

/** Where the user last dragged the in-page widget (survives reloads). */
const WIDGET_POSITION_KEY = 'meetx_widget_position';

const getInitialWidgetPosition = (): WidgetPosition => {
  try {
    const saved =
      typeof localStorage !== 'undefined'
        ? JSON.parse(localStorage.getItem(WIDGET_POSITION_KEY) || 'null')
        : null;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      return clampWidgetPosition(saved as WidgetPosition, null);
    }
  } catch {
    // Corrupted value → fall through to the default placement.
  }
  return clampWidgetPosition(
    {
      x: window.innerWidth / 2 - FALLBACK_WIDGET_WIDTH / 2,
      y: 25,
    },
    null
  );
};


export const FloatingAssistantWidget: React.FC = () => {
  const navigate = useNavigate();
  const {
    isFloatingActive,
    isWidgetCollapsed,
    setIsWidgetCollapsed,
    answerCardSize,
    increaseCardSize,
    decreaseCardSize,
    stopMeetingSession,
    activeMeeting,
    selectedLanguage,
    targetLanguage,
    setTargetLanguage,
    translationEnabled,
    speakTranslations,
    setSpeakTranslations,
    liveTranscript,
    currentMeetingTranscript,
    liveBrief,
    checkedActions,
    toggleActionCheck,
    isDetectable,
    setIsDetectable,
    hideMeetxHidesWidget,
    setHideMeetxHidesWidget,
    setIsPlatformClosed,
    isEntireScreenShareReported,
    setIsEntireScreenShareReported,
    setIsPlanModalOpen,
    freeMeetingsLeft,
    isProUser,
    assistantMessages,
    clearAssistantMessages,
    askAssistant,
    addTranscriptEntry,
    isThinking,
    contentProtection,
  } = useAssistantMeeting();
  const entireScreenWarning = !isDetectable && isEntireScreenShareReported;
  const isNativeAssistant = isNativeAssistantWindow();

  useEffect(() => {
    if (isDetectable && isEntireScreenShareReported) {
      setIsEntireScreenShareReported(false);
    }
  }, [isDetectable, isEntireScreenShareReported, setIsEntireScreenShareReported]);

  const [inputQuery, setInputQuery] = useState('');
  const [activeAssistantMode, setActiveAssistantMode] = useState<AssistantMode>('assist');
  const [liveTab, setLiveTab] = useState<'answers' | 'conversation' | 'brief'>('answers');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<WidgetPosition>(getInitialWidgetPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, textToCopy: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2000);
  };

  const lastAutoAnsweredId = useRef<string | null>(null);
  /** Text of the last remark that already triggered an answer (repeat guard). */
  const lastAutoAnsweredTextRef = useRef<string>('');
  const autoFollowRef = useRef(true);
  /**
   * PIPELINE SEPARATION: Set to true while an explicit user question (typed or
   * voice-detected) is being handled by Pipeline 2. The Pipeline 1 auto-follow
   * skips that transcript entry so there is never a QUERY + ASSIST duplicate.
   */
  const voiceQueryHandledIdRef = useRef<string | null>(null);

  // PIPELINE 1 — Continuous conversation context updater.
  // Every new transcript entry updates the meeting context (liveTranscript).
  // This effect ONLY triggers Pipeline 1 auto-mode responses (Assist / What to
  // say / Follow-up / Recap). It does NOT trigger for entries that Pipeline 2
  // (onVoiceQuery) is already handling — preventing QUERY + ASSIST duplicates.
  useEffect(() => {
    if (!autoFollowRef.current || liveTranscript.length === 0) return;
    const last = liveTranscript[liveTranscript.length - 1];
    if (!last || last.id === lastAutoAnsweredId.current) return;
    if (last.id.endsWith('-t') === false && (last.translatedText || '').includes('translating')) return;

    // PIPELINE SEPARATION: If Pipeline 2 (onVoiceQuery) is already handling
    // this exact transcript entry as an explicit question, skip the auto-follow
    // response entirely. One spoken question → one Pipeline 2 answer only.
    if (last.id === voiceQueryHandledIdRef.current) {
      lastAutoAnsweredId.current = last.id;
      return;
    }

    // A recognizer glitch (or an echo) can re-emit the same words as a new
    // entry. Asking again would just repeat the previous answer, so the
    // already-answered text is remembered and skipped.
    const text = (last.translatedText && !last.translatedText.includes('translating')
      ? last.translatedText
      : last.text || ''
    ).trim().toLowerCase();
    if (text && text === lastAutoAnsweredTextRef.current) {
      lastAutoAnsweredId.current = last.id;
      return;
    }
    lastAutoAnsweredId.current = last.id;
    lastAutoAnsweredTextRef.current = text;
    // Pipeline 1: update meeting context via auto-mode response.
    if (activeAssistantMode === 'whatToSay') void askAssistant('What should I say right now to the interviewer/meeting?', 'say', { auto: true });
    else if (activeAssistantMode === 'followUp') void askAssistant('Give me smart follow-up questions to ask.', 'followup', { auto: true });
    else if (activeAssistantMode === 'recap') void askAssistant('Give me a quick recap of the conversation so far.', 'recap', { auto: true });
    else void askAssistant('Please assist me with key points and advice for this meeting.', 'assist', { auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTranscript.length]);


  // --- Desktop always-on-top window (Document Picture-in-Picture) ----------
  // The React app (meeting, transcript, AI, persistence) always runs in THIS
  // opener document; the desktop window only hosts the widget's DOM through a
  // portal. Opening, closing or hiding that window therefore never starts or
  // stops a meeting — MeetingContext above is the single source of truth.
  const {
    isSupported: isDesktopWindowSupported,
    window: desktopWindow,
    container: desktopContainer,
    openWindow: openDesktopWindow,
    closeWindow: closeDesktopWindow,
  } = useDesktopAssistantWindow();
  // Event/viewport host: the PiP window while it is open (its events fire in
  // its own document), otherwise the app window.
  const hostEventTarget: Window = desktopWindow ?? window;
  const hostDocument: Document = desktopWindow?.document ?? document;

  // Initialize Speech-to-Text + real-time translation.
  // Voice -> text -> (translated) -> LLM answer: when a voice question is
  // detected, route it to the assistant for a text answer.
  const { startListening, stopListening, isTranslating, isListening, isSupported } = useSpeechToText({
    language: selectedLanguage.code,
    hostWindow: desktopWindow ?? undefined,
    targetLanguage: translationEnabled ? targetLanguage.code : undefined,
    speakTranslations,
    onTranscriptReceived: (entry) => {
      addTranscriptEntry(entry);
    },
    onVoiceQuery: (text) => {
      // PIPELINE 2: Voice question detected → route to the QA pipeline.
      // Record the latest transcript entry ID so Pipeline 1 auto-follow skips
      // this same entry and never produces a QUERY + ASSIST duplicate.
      const lastEntry = liveTranscript[liveTranscript.length - 1];
      if (lastEntry) {
        voiceQueryHandledIdRef.current = lastEntry.id;
      }
      askAssistant(text, 'query');
    },
  });
  // Start speech recognition when floating widget is active
  useEffect(() => {
    if (isFloatingActive) {
      startListening();
    } else {
      stopListening();
    }
    return () => {
      stopListening();
    };
  }, [isFloatingActive, startListening, stopListening]);

  // Desktop-window lifecycle tied to the MEETING (rising/falling edge):
  //   meeting starts → the always-on-top window opens (falling back to the
  //                     in-page widget when unsupported or when the browser
  //                     refuses the open, e.g. without a user gesture)
  //   meeting stops  → the window closes and cleans up (TEST 9/10)
  // Closing the window MANUALLY is deliberately not wired into this effect:
  // the meeting keeps running in MeetingContext and the widget simply
  // reappears in-page until the user restores the desktop window
  // (requirement: hiding/closing the assistant never ends the meeting).
  const wasMeetingActiveRef = useRef(false);
  useEffect(() => {
    if (!isDesktopWindowSupported) return;
    if (isFloatingActive && !wasMeetingActiveRef.current) {
      void openDesktopWindow();
    } else if (!isFloatingActive && wasMeetingActiveRef.current) {
      closeDesktopWindow();
    }
    wasMeetingActiveRef.current = isFloatingActive;
  }, [isFloatingActive, isDesktopWindowSupported, openDesktopWindow, closeDesktopWindow]);

  // Remember where the widget was last dragged (in-page position; the OS
  // position of the desktop window itself cannot be stored — the Document
  // PiP API does not let the website read or set it).
  useEffect(() => {
    if (isDragging) return;
    try {
      localStorage.setItem(WIDGET_POSITION_KEY, JSON.stringify(position));
    } catch {
      // Storage unavailable — position memory is optional.
    }
  }, [position, isDragging]);

  // Auto scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [assistantMessages, isWidgetCollapsed, answerCardSize, isThinking]);

  // Global Keybindings
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        setIsWidgetCollapsed(!isWidgetCollapsed);
      }
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (inputQuery.trim()) {
          handleSend();
        } else {
          askAssistant('What should I say right now based on our context?', 'say');
        }
      }
      if (e.ctrlKey && e.key === 'r' && e.shiftKey) {
        e.preventDefault();
        clearAssistantMessages();
      }
      if (e.ctrlKey && e.shiftKey && e.key === '|') {
        e.preventDefault();
        stopMeetingSession();
      }
    };

    hostEventTarget.addEventListener('keydown', handleKeyDown);
    return () => hostEventTarget.removeEventListener('keydown', handleKeyDown);
  }, [isWidgetCollapsed, inputQuery, askAssistant, clearAssistantMessages, stopMeetingSession, hostEventTarget]);

  // Close options menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    hostDocument.addEventListener('mousedown', handleOutsideClick);
    return () => hostDocument.removeEventListener('mousedown', handleOutsideClick);
  }, [hostDocument]);

  // Keep the floating shell within the viewport of whichever window hosts it
  // (the PiP window while open, otherwise the app window), and re-clamp
  // immediately whenever that host changes.
  useEffect(() => {
    const viewport = desktopWindow ?? window;
    const handleViewportResize = () => {
      setPosition((currentPosition) =>
        clampWidgetPosition(currentPosition, widgetRef.current, viewport)
      );
    };

    handleViewportResize();
    viewport.addEventListener('resize', handleViewportResize);
    return () => viewport.removeEventListener('resize', handleViewportResize);
  }, [desktopWindow]);

  // Draggable logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
      if (isNativeAssistant) {
        void getCurrentWebviewWindow().startDragging();
        return;
      }
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition(clampWidgetPosition(
          {
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y,
          },
          widgetRef.current
        ));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      hostEventTarget.addEventListener('mousemove', handleMouseMove);
      hostEventTarget.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      hostEventTarget.removeEventListener('mousemove', handleMouseMove);
      hostEventTarget.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, hostEventTarget]);

  if (!isFloatingActive) return null;

  // As requested: clicking the logo in the widget takes user to home page
  const handleLogoClick = () => {
    setIsPlatformClosed(false);
    navigate('/home');
  };

  const handleSend = () => {
    // A typed question is NEVER dropped. It used to return early while the
    // assistant was thinking, so pressing Enter during a queued burst silently
    // threw the question away. askAssistant serializes requests, so the question
    // simply joins the queue and is answered when its turn comes.
    const q = inputQuery.trim();
    if (!q) return;
    setInputQuery('');
    void askAssistant(q, 'query');
  };

  const handleAssistantModeChange = (mode: AssistantMode) => {
    setActiveAssistantMode(mode);

    switch (mode) {
      case 'assist':
        askAssistant('Please assist me with key points and advice for this meeting.', 'assist');
        break;
      case 'whatToSay':
        askAssistant('What should I say right now to the interviewer/meeting?', 'say');
        break;
      case 'followUp':
        askAssistant('Give me smart follow-up questions to ask.', 'followup');
        break;
      case 'recap':
        askAssistant('Give me a quick recap of the conversation so far.', 'recap');
        break;
    }
  };

  const assistantModeButtonClass = (mode: AssistantMode) => {
    const isActive = activeAssistantMode === mode;
    return `flex items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer ${isActive
      ? 'bg-white/15 text-white shadow-sm ring-1 ring-white/20'
      : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`;
  };

  const cardHeightClasses = {
    compact: 'max-h-36',
    normal: 'max-h-56',
    expanded: 'max-h-[380px]',
  };

  const widgetNode = (
    <div
      ref={widgetRef}
      style={isNativeAssistant
        ? { left: 0, top: 0, width: '100%', position: 'relative' }
        : { left: `${position.x}px`, top: `${position.y}px` }}
      onMouseDown={handleMouseDown}
      className="fixed z-[9999] flex flex-col items-center select-none font-sans"
    >
      {/* 1. Top Pill Header Control (Strictly matching reference screenshot) */}
      <div className="drag-handle cursor-move flex items-center gap-2 px-3 py-1.5 bg-[#232733]/95 hover:bg-[#232733] border border-slate-700/70 rounded-full shadow-2xl backdrop-blur-md transition-all">
        <button
          onClick={handleLogoClick}
          title="Return to Home Page"
          className="h-6 w-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 hover:scale-105 active:scale-95 flex items-center justify-center text-white shadow-sm transition-transform cursor-pointer overflow-hidden"
        >
          <span className="text-white text-sm font-extrabold leading-none">M</span>
        </button>

        <button
          onClick={() => setIsWidgetCollapsed(!isWidgetCollapsed)}
          title={isWidgetCollapsed ? 'Show assistant' : 'Hide assistant'}
          aria-label={isWidgetCollapsed ? 'Show assistant' : 'Hide assistant'}
          className="h-6 w-6 rounded-full text-slate-300 hover:text-white hover:bg-slate-700/50 flex items-center justify-center transition-colors cursor-pointer"
        >
          {isWidgetCollapsed ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          onClick={() => setIsWidgetCollapsed(!isWidgetCollapsed)}
          className="h-6 px-2 rounded-full text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-700/50 transition-colors cursor-pointer"
        >
          {isWidgetCollapsed ? 'Show' : 'Hide'}
        </button>

        {/* Desktop always-on-top window toggle (Document PiP; Chromium-only) */}
        {isDesktopWindowSupported && (
          <button
            type="button"
            onClick={() => {
              if (desktopWindow) closeDesktopWindow();
              else void openDesktopWindow();
            }}
            title={
              desktopWindow
                ? 'Close desktop floating window (meeting keeps running)'
                : 'Open desktop floating window (always on top)'
            }
            aria-label={
              desktopWindow
                ? 'Close desktop floating window'
                : 'Open desktop floating window'
            }
            className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${desktopWindow
              ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
          >
            <PictureInPicture className="w-3.5 h-3.5" />
          </button>
        )}

        {isNativeAssistant && (
          <button type="button" onClick={() => void hideNativeAssistantWindow()} title="Hide assistant window; meeting continues" aria-label="Hide assistant window" className="h-6 w-6 rounded-full flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700/50">
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Private mode indicator pill */}
        {!isDetectable && (
          <span
            title="Private Mode: the separate assistant window stays outside a Browser Tab or Application Window capture. Entire Screen sharing can include it."
            className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-400 font-medium cursor-help"
          >
            <EyeOff className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">Private Mode</span>
          </span>
        )}

        <button
          onClick={stopMeetingSession}
          title="Stop session (Ctrl+Shift+\)"
          aria-label="Stop session"
          className="h-6 w-6 rounded-full bg-slate-800 hover:bg-rose-600 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <Square className="w-2.5 h-2.5 fill-current" />
        </button>
      </div>

      {!isDetectable && (
        <div className={`mt-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${entireScreenWarning
          ? 'border-amber-400/50 bg-amber-950/90 text-amber-100 shadow-lg'
          : 'border-slate-700/70 bg-slate-900/95 text-slate-300'
          }`} role={entireScreenWarning ? 'alert' : 'status'}>
          {entireScreenWarning ? (
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div className="flex-1">
                <p className="font-semibold">Private Mode cannot hide the assistant during Entire Screen sharing. Please share the meeting tab or application window.</p>
                <p className="mt-0.5 text-amber-100/80">Your meeting, transcription, AI assistance, and saving continue. Participants may see the assistant in the shared screen.</p>
                <button type="button" onClick={() => setIsEntireScreenShareReported(false)} className="mt-1 text-amber-200 underline underline-offset-2">I stopped sharing Entire Screen</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><strong className="text-slate-100">Private Mode:</strong> Share a Browser Tab or Application Window to keep this separate assistant window outside the capture. Entire Screen may show it. MEETX cannot detect sharing started in another app.</span>
              <button type="button" onClick={() => setIsEntireScreenShareReported(true)} className="shrink-0 rounded-lg border border-amber-500/40 px-2 py-1 text-amber-200 hover:bg-amber-500/10">I’m sharing Entire Screen</button>
            </div>
          )}
        </div>
      )}

      {!isDetectable && isNativeAssistant && contentProtection && (
        <div role="status" className={`mt-1 rounded-lg px-3 py-1.5 text-[10px] ${contentProtection.status === 'protected' ? 'bg-emerald-950/80 text-emerald-200' : 'bg-amber-950/80 text-amber-200'}`}>
          <strong>OS content protection: {contentProtection.status === 'protected' ? 'Protected' : contentProtection.status === 'unsupported' ? 'Unsupported' : contentProtection.status === 'not-available' ? 'Not Available' : contentProtection.status === 'unknown' ? 'Unknown' : 'Not requested'}.</strong> {contentProtection.detail}
        </div>
      )}

      {/* 2. Main Floating Assistant Card (Strictly matching reference screenshot) */}
      {!isWidgetCollapsed && (
        <div className="mt-2.5 w-[460px] sm:w-[490px] bg-[#1a1d26]/95 border border-slate-700/70 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-visible animate-in fade-in zoom-in-95 duration-150 text-white">
          {/* Real-time translation bar: speech → subtitle language */}
          <div className="px-4 pt-3 flex items-center gap-2 text-[11px]">
            <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border ${translationEnabled ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-300' : 'bg-slate-800/60 border-slate-700/60 text-slate-300'}`}>
              <Languages className="w-3.5 h-3.5" />
              <span className="font-semibold">{translationEnabled ? `Live translate → ${targetLanguage.name}` : 'Translation off'}</span>
            </span>
            <select
              value={targetLanguage.code}
              onChange={(e) => {
                const found = SUPPORTED_LANGUAGES.find((l) => l.code === e.target.value);
                if (found) setTargetLanguage(found);
              }}
              title="Subtitle language — pick a different language than speech to translate live"
              className="px-2 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-200 text-[11px] outline-none focus:border-emerald-400 cursor-pointer max-w-[150px]"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code === selectedLanguage.code ? `✓ ${l.name} (speech)` : l.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSpeakTranslations(!speakTranslations)}
              title={speakTranslations ? 'Mute spoken translations' : 'Speak translations aloud'}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${speakTranslations ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300' : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white'}`}
            >
              {speakTranslations ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          </div>
          {/* Top Action Pills Row & Size Controls */}
          <div className="drag-handle cursor-move px-4 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-800/80 text-xs font-medium text-slate-300">
            <button
              type="button"
              onClick={() => handleAssistantModeChange('assist')}
              aria-pressed={activeAssistantMode === 'assist'}
              className={assistantModeButtonClass('assist')}
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Assist</span>
            </button>
            <span className="text-slate-600">•</span>

            <button
              type="button"
              onClick={() => handleAssistantModeChange('whatToSay')}
              aria-pressed={activeAssistantMode === 'whatToSay'}
              className={assistantModeButtonClass('whatToSay')}
            >
              <span>What should I say?</span>
            </button>
            <span className="text-slate-600">•</span>

            <button
              type="button"
              onClick={() => handleAssistantModeChange('followUp')}
              aria-pressed={activeAssistantMode === 'followUp'}
              className={assistantModeButtonClass('followUp')}
            >
              <MessageSquare className="w-3.5 h-3.5 text-teal-400" />
              <span>Follow-up questions</span>
            </button>
            <span className="text-slate-600">•</span>

            <button
              type="button"
              onClick={() => handleAssistantModeChange('recap')}
              aria-pressed={activeAssistantMode === 'recap'}
              className={assistantModeButtonClass('recap')}
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              <span>Recap</span>
            </button>

            {/* Answer Card Size Adjustment Controls */}
            <div className="flex items-center gap-1 ml-1 pl-2 border-l border-slate-700/80">
              <button
                onClick={decreaseCardSize}
                disabled={answerCardSize === 'compact'}
                title="Decrease answer card size"
                className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              >
                <Minimize2 className="w-3 h-3" />
              </button>
              <button
                onClick={increaseCardSize}
                disabled={answerCardSize === 'expanded'}
                title="Increase answer card size"
                className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Live tab switcher: Answers | Conversation | Brief */}
          <div className="px-4 pt-2 flex items-center gap-1.5 text-[11px]">
            <button type="button" onClick={() => setLiveTab('answers')} className={'px-2.5 py-1 rounded-lg border font-semibold transition-colors cursor-pointer ' + (liveTab === 'answers' ? 'bg-blue-600/20 border-blue-400/40 text-blue-200' : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white')}>Answers</button>
            <button type="button" onClick={() => setLiveTab('conversation')} className={'px-2.5 py-1 rounded-lg border font-semibold transition-colors cursor-pointer ' + (liveTab === 'conversation' ? 'bg-blue-600/20 border-blue-400/40 text-blue-200' : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white')}>Live conversation ({currentMeetingTranscript.length})</button>
            <button type="button" onClick={() => setLiveTab('brief')} className={'px-2.5 py-1 rounded-lg border font-semibold transition-colors cursor-pointer ' + (liveTab === 'brief' ? 'bg-blue-600/20 border-blue-400/40 text-blue-200' : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white')}>Title-Summary-Actions</button>
          </div>
          {/* Response Feed & Live Meeting Follow-up stream with Dynamic Height */}
          {liveTab === 'conversation' ? (
            <LiveConversationPane liveTranscript={currentMeetingTranscript} liveBrief={liveBrief} checkedActions={checkedActions} toggleActionCheck={toggleActionCheck} copiedId={copiedId} onCopy={handleCopy} onQuickAction={(m) => { setLiveTab('answers'); handleAssistantModeChange(m); }} isListening={isListening} isSupported={isSupported} />
          ) : liveTab === 'brief' ? (
            <LiveBriefPane liveBrief={liveBrief} checkedActions={checkedActions} toggleActionCheck={toggleActionCheck} />
          ) : (
            /* liveTab panes */
            <div className={`${cardHeightClasses[answerCardSize]} overflow-y-auto px-4 py-3 space-y-3 divide-y divide-slate-800/40 text-xs text-slate-200 transition-all duration-200`}>
              {assistantMessages.length === 0 ? (
                <div className="py-4 text-center text-slate-400 flex flex-col items-center gap-1.5">
                  <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span>MEETX is following the meeting in real-time...</span>
                  <span className="text-[10px] text-slate-500">
                    Topic: {activeMeeting?.topic} • {activeMeeting?.pastedNotes ? 'Knowledge-base loaded' : 'Default mode'}
                  </span>
                </div>
              ) : (
                assistantMessages.map((msg) => (
                  <div key={msg.id} className="pt-2.5 first:pt-0">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                      <span className="font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                        <span>{msg.sender === 'user' ? 'You' : `MeetX Assistant ${msg.actionType ? `• ${msg.actionType}` : ''}`}</span>
                      </span>

                      <div className="flex items-center gap-2">
                        {msg.sender === 'assistant' && (
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.id, msg.text)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-all cursor-pointer shadow-xs active:scale-95"
                            title="Copy full solution to clipboard"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-400" />
                                <span className="text-emerald-400 font-semibold text-[10px]">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-slate-400" />
                                <span className="text-[10px]">Copy Solution</span>
                              </>
                            )}
                          </button>
                        )}
                        <span>{msg.time}</span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-100">
                      {renderMessageContent(msg.text, msg.id, copiedId, handleCopy)}
                    </div>

                    {/* Proactive follow-up suggestion chips */}
                    {msg.followupSuggestions && msg.followupSuggestions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {msg.followupSuggestions.map((suggestion, sIdx) => (
                          <button
                            key={sIdx}
                            onClick={() => askAssistant(suggestion, 'query')}
                            className="px-2 py-0.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-400/20 text-[10px] text-blue-300 transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <span>{suggestion}</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}

              {/* Real-time Thinking & Synthesizing State Indicator */}
              {isThinking && (
                <div className="pt-2 flex items-center gap-2 text-xs text-blue-400 font-medium animate-in fade-in duration-150">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  <span className="animate-pulse text-blue-300">MEETX is synthesizing your real-time response...</span>
                </div>
              )}
              {liveTab === 'answers' && isTranslating && (
                <div className="pt-1 flex items-center gap-2 text-[11px] text-emerald-400 font-medium">
                  <Languages className="w-3.5 h-3.5 animate-pulse" />
                  <span>Translating live speech → {targetLanguage.name}…</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Prompt Input Box */}
          <div className="p-3 bg-[#13151c]/90 rounded-b-2xl border-t border-slate-800/80 flex flex-col gap-2 relative">
            <textarea
              rows={2}
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a question about this meeting — press Enter to send"
              className="w-full bg-transparent text-xs text-white placeholder:text-slate-500 resize-none outline-none leading-relaxed"
            />

            {/* Bottom Row inside Input: Smart Badge, Options Menu (•••), Send Button */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-medium text-slate-300 border border-slate-700">
                  Smart
                </span>

                {/* Three Dots Menu Button */}
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    title="Menu & Keybinds"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>

                  {/* Options Popover (Strictly matching reference screenshot) */}
                  {isMenuOpen && (
                    <div className="absolute left-0 bottom-9 w-64 bg-[#1e222e] border border-slate-700 rounded-xl shadow-2xl p-3 z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100">
                      <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Keybinds
                      </div>

                      <div className="space-y-2 pb-2.5 border-b border-slate-700/80 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="text-slate-400">▣</span> Show/hide MeetX
                          </span>
                          <span className="text-slate-400 font-mono bg-slate-800/80 px-1 rounded">Ctrl+\</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="text-slate-400">💬</span> Ask MeetX
                          </span>
                          <span className="text-slate-400 font-mono bg-slate-800/80 px-1 rounded">Ctrl+↵</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="text-slate-400">⟲</span> Clear chat
                          </span>
                          <span className="text-slate-400 font-mono bg-slate-800/80 px-1 rounded">Ctrl+Shift+R</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="text-slate-400">⏹</span> Stop session
                          </span>
                          <span className="text-slate-400 font-mono bg-slate-800/80 px-1 rounded">Ctrl+Shift+\</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="text-slate-400">✢</span> Move MeetX
                          </span>
                          <span className="text-slate-400 font-mono bg-slate-800/80 px-1 rounded">Ctrl+↘↛←→</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <span className="text-slate-400">↡</span> Scroll Chat
                          </span>
                          <span className="text-slate-400 font-mono bg-slate-800/80 px-1 rounded">Ctrl+Shift+↘↛</span>
                        </div>
                      </div>

                      {/* Settings, Undetectability & Choose Plan */}
                      <div className="pt-2.5 space-y-2.5 text-[11px]">
                        <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsDetectable(!isDetectable)}>
                          <span className="flex items-center gap-1.5 text-slate-300">
                            {isDetectable ? <Eye className="w-3.5 h-3.5 text-slate-400" /> : <EyeOff className="w-3.5 h-3.5 text-emerald-400" />}
                            <span>Undetectability</span>
                          </span>
                          <div className={`w-7 h-4 rounded-full relative p-0.5 transition-colors ${!isDetectable ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                            <div className={`w-3 h-3 bg-white rounded-full transition-transform ${!isDetectable ? 'ml-auto' : ''}`} />
                          </div>
                        </div>

                        {!isDetectable && (
                          <div className="p-2 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-[10px] text-emerald-300 space-y-1 animate-in fade-in duration-150">
                            <div className="flex items-center gap-1 font-semibold text-emerald-400">
                              <ShieldCheck className="w-3 h-3 flex-shrink-0" />
                              <span>Private Sharing Guide</span>
                            </div>
                            <p className="text-slate-300 text-[9.5px] leading-relaxed">
                              ✅ <strong>Supported:</strong> In your meeting app (Zoom/Meet/Teams), share a specific <strong>Browser Tab</strong> or <strong>Application Window</strong>. This assistant remains outside that capture.
                            </p>
                            <p className="text-amber-300/90 text-[9.5px] leading-relaxed">
                              ⚠️ <strong>Limitation:</strong> Do not select <strong>Entire Screen</strong>, which captures all desktop pixels.
                            </p>
                          </div>
                        )}

                        <div className="flex items-center justify-between cursor-pointer" onClick={() => setHideMeetxHidesWidget(!hideMeetxHidesWidget)}>
                          <span className="flex items-center gap-1.5 text-slate-300">
                            <Layers className="w-3.5 h-3.5 text-slate-400" />
                            <span>Hide MeetX hides widget</span>
                          </span>
                          <div className={`w-7 h-4 rounded-full relative p-0.5 transition-colors ${hideMeetxHidesWidget ? 'bg-blue-600' : 'bg-slate-700'}`}>
                            <div className={`w-3 h-3 bg-white rounded-full transition-transform ${hideMeetxHidesWidget ? 'ml-auto' : ''}`} />
                          </div>
                        </div>

                        {/* Upgrade / Billing Option from Image 2 */}
                        <div
                          onClick={() => {
                            setIsPlanModalOpen(true);
                            setIsMenuOpen(false);
                          }}
                          className="flex items-center justify-between text-blue-400 hover:text-blue-300 cursor-pointer pt-1 border-t border-slate-700/60"
                        >
                          <span className="flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Upgrade to Pro ({isProUser ? 'Active' : `${freeMeetingsLeft} free left`})</span>
                          </span>
                          <span>›</span>
                        </div>

                        <div
                          onClick={() => {
                            setIsPlatformClosed(false);
                            setIsMenuOpen(false);
                          }}
                          className="pt-1 text-slate-300 hover:text-white cursor-pointer font-medium flex items-center justify-between"
                        >
                          <span>Reopen Main Platform</span>
                          <Maximize2 className="w-3 h-3" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>


              </div>

              {/* Blue Send Arrow Button */}
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputQuery.trim()}
                className="w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30 transition-all cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Desktop mode: portal the SAME widget tree into the always-on-top window.
  // Meeting state is unaffected by this switch — it lives in MeetingContext
  // above; closing the window simply falls back to the in-page render until
  // the user restores the desktop window (same session, same state).
  if (desktopContainer) return createPortal(widgetNode, desktopContainer);
  return widgetNode;
};
