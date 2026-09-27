import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Maximize2,
  Minimize2,
  CreditCard,
  Layers,
  Loader2,
  Copy,
  Check,
  Languages,
  Volume2,
  VolumeX
} from 'lucide-react';
import { useMeeting } from '../../contexts/MeetingContext';
import { useSpeechToText } from '../../hooks/useSpeechToText';
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
  widget: HTMLDivElement | null
): WidgetPosition => {
  const width = widget?.offsetWidth || FALLBACK_WIDGET_WIDTH;
  const height = widget?.offsetHeight || FALLBACK_WIDGET_HEIGHT;
  const availableWidth = Math.max(0, window.innerWidth - width);
  const availableHeight = Math.max(0, window.innerHeight - height);
  const minX = Math.min(VIEWPORT_MARGIN, availableWidth);
  const minY = Math.min(VIEWPORT_MARGIN, availableHeight);
  const maxX = Math.max(minX, availableWidth - VIEWPORT_MARGIN);
  const maxY = Math.max(minY, availableHeight - VIEWPORT_MARGIN);

  return {
    x: Math.min(Math.max(nextPosition.x, minX), maxX),
    y: Math.min(Math.max(nextPosition.y, minY), maxY),
  };
};

const getInitialWidgetPosition = (): WidgetPosition => {
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
    setIsPlanModalOpen,
    freeMeetingsLeft,
    isProUser,
    assistantMessages,
    clearAssistantMessages,
    askAssistant,
    addTranscriptEntry,
    isThinking,
  } = useMeeting();

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
  const autoFollowRef = useRef(true);

  // Auto-follow: every new participant remark produces its own answer for the
  // active mode (What to say / Follow-up / Recap / Assist), so the widget keeps
  // pace with the conversation without another click.
  //
  // There is deliberately NO isThinking gate and no debounce timer here: with
  // both, a remark arriving while another answer was still in flight was
  // dropped, and a burst of remarks collapsed into a single answer. Requests are
  // serialized by askAssistant instead, so every remark is answered and the
  // answers appear one by one.
  useEffect(() => {
    if (!autoFollowRef.current || liveTranscript.length === 0) return;
    const last = liveTranscript[liveTranscript.length - 1];
    if (!last || last.id === lastAutoAnsweredId.current) return;
    if (last.id.endsWith('-t') === false && (last.translatedText || '').includes('translating')) return;
    lastAutoAnsweredId.current = last.id;
    if (activeAssistantMode === 'whatToSay') askAssistant('What should I say right now to the interviewer/meeting?', 'say');
    else if (activeAssistantMode === 'followUp') askAssistant('Give me smart follow-up questions to ask.', 'followup');
    else if (activeAssistantMode === 'recap') askAssistant('Give me a quick recap of the conversation so far.', 'recap');
    else askAssistant('Please assist me with key points and advice for this meeting.', 'assist');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTranscript.length]);


  // Initialize Speech-to-Text + real-time translation.
  // Voice -> text -> (translated) -> LLM answer: when a voice question is
  // detected, route it to the assistant for a text answer.
  const { startListening, stopListening, isTranslating, isListening, isSupported } = useSpeechToText({
    language: selectedLanguage.code,
    targetLanguage: translationEnabled ? targetLanguage.code : undefined,
    speakTranslations,
    onTranscriptReceived: (entry) => {
      addTranscriptEntry(entry);
    },
    onVoiceQuery: (text) => {
      // Voice question detected → send it to the LLM for an answer.
      // The response is text and appears in the widget card; answers are never
      // spoken aloud (only translated participant lines can be, via the mute
      // toggle, and that is off by default).
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

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isWidgetCollapsed, inputQuery, askAssistant, clearAssistantMessages, stopMeetingSession]);

  // Close options menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Keep the floating shell within the viewport when the window changes.
  useEffect(() => {
    const handleViewportResize = () => {
      setPosition((currentPosition) =>
        clampWidgetPosition(currentPosition, widgetRef.current)
      );
    };

    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, []);

  // Draggable logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.drag-handle')) {
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
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!isFloatingActive) return null;

  // As requested: clicking the logo in the widget takes user to home page
  const handleLogoClick = () => {
    setIsPlatformClosed(false);
    navigate('/home');
  };

  const handleSend = () => {
    if (!inputQuery.trim() || isThinking) return;
    const q = inputQuery;
    setInputQuery('');
    askAssistant(q, 'query');
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
    return `flex items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer ${
      isActive
        ? 'bg-white/15 text-white shadow-sm ring-1 ring-white/20'
        : 'text-slate-300 hover:bg-white/10 hover:text-white'
    }`;
  };

  const cardHeightClasses = {
    compact: 'max-h-36',
    normal: 'max-h-56',
    expanded: 'max-h-[380px]',
  };

  return (
    <div
      ref={widgetRef}
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
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

        <button
          onClick={stopMeetingSession}
          title="Stop session (Ctrl+Shift+\)"
          aria-label="Stop session"
          className="h-6 w-6 rounded-full bg-slate-800 hover:bg-rose-600 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
        >
          <Square className="w-2.5 h-2.5 fill-current" />
        </button>
      </div>

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
              placeholder="Ask about your screen or conversation, or Ctrl ↵ for Assist"
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
                disabled={!inputQuery.trim() || isThinking}
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
};
