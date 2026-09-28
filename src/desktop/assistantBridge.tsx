import React, { createContext, useContext, useEffect, useState } from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { MeetingTranscriptEntry, SUPPORTED_LANGUAGES, SupportedLanguage } from '../types/meeting';
import { MeetingContext, MeetingContextType } from '../contexts/MeetingContext';

export type ProtectionStatus = {
  status: 'not-requested' | 'protected' | 'unsupported' | 'not-available' | 'unknown';
  detail: string;
};

export type AssistantSnapshot = Pick<MeetingContextType,
  | 'isFloatingActive' | 'isWidgetCollapsed' | 'answerCardSize' | 'activeMeeting'
  | 'selectedLanguage' | 'targetLanguage' | 'translationEnabled' | 'speakTranslations'
  | 'liveTranscript' | 'currentMeetingTranscript' | 'liveBrief' | 'isDetectable'
  | 'hideMeetxHidesWidget' | 'isEntireScreenShareReported' | 'freeMeetingsLeft'
  | 'isProUser' | 'assistantMessages' | 'isThinking'
> & { checkedActions: string[]; contentProtection: ProtectionStatus };

type AssistantWidgetContext = Pick<MeetingContextType,
  | 'isFloatingActive' | 'isWidgetCollapsed' | 'setIsWidgetCollapsed' | 'answerCardSize'
  | 'increaseCardSize' | 'decreaseCardSize' | 'stopMeetingSession' | 'activeMeeting'
  | 'selectedLanguage' | 'targetLanguage' | 'setTargetLanguage' | 'translationEnabled'
  | 'speakTranslations' | 'setSpeakTranslations' | 'liveTranscript' | 'currentMeetingTranscript'
  | 'liveBrief' | 'checkedActions' | 'toggleActionCheck' | 'isDetectable' | 'setIsDetectable'
  | 'hideMeetxHidesWidget' | 'setHideMeetxHidesWidget' | 'setIsPlatformClosed'
  | 'isEntireScreenShareReported' | 'setIsEntireScreenShareReported' | 'setIsPlanModalOpen'
  | 'freeMeetingsLeft' | 'isProUser' | 'assistantMessages' | 'clearAssistantMessages'
  | 'askAssistant' | 'addTranscriptEntry' | 'isThinking'
> & { contentProtection?: ProtectionStatus };

const AssistantBridgeContext = createContext<AssistantWidgetContext | null>(null);

const sendCommand = (command: string, payload?: unknown): void => {
  void emitTo('main', 'meetx:assistant-command', { command, payload }).catch((error) => {
    console.error('MEETX assistant command failed:', error);
  });
};

export const AssistantWindowBridgeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [snapshot, setSnapshot] = useState<AssistantSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    let unlistenSnapshot: (() => void) | undefined;
    void listen<AssistantSnapshot>('meetx:assistant-snapshot', ({ payload }) => {
      if (active) setSnapshot(payload);
    }).then((unlisten) => {
      if (!active) unlisten();
      else unlistenSnapshot = unlisten;
      void emitTo('main', 'meetx:assistant-ready').catch(() => {});
    });
    return () => {
      active = false;
      unlistenSnapshot?.();
    };
  }, []);

  if (!snapshot) return <div className="min-h-screen bg-[#151822] text-slate-300 p-5 text-sm">Connecting to the active MEETX session…</div>;

  const send = (command: string) => (...args: unknown[]) => sendCommand(command, args);
  const context: AssistantWidgetContext = {
    ...snapshot,
    checkedActions: new Set(snapshot.checkedActions),
    setIsWidgetCollapsed: (value) => sendCommand('setIsWidgetCollapsed', value),
    increaseCardSize: send('increaseCardSize'),
    decreaseCardSize: send('decreaseCardSize'),
    setTargetLanguage: (value: SupportedLanguage) => sendCommand('setTargetLanguage', value.code),
    setSpeakTranslations: (value) => sendCommand('setSpeakTranslations', value),
    setIsDetectable: (value) => sendCommand('setIsDetectable', value),
    setHideMeetxHidesWidget: (value) => sendCommand('setHideMeetxHidesWidget', value),
    setIsEntireScreenShareReported: (value) => sendCommand('setIsEntireScreenShareReported', value),
    toggleActionCheck: (id: string) => sendCommand('toggleActionCheck', id),
    addTranscriptEntry: (entry: MeetingTranscriptEntry) => sendCommand('addTranscriptEntry', entry),
    clearAssistantMessages: send('clearAssistantMessages'),
    askAssistant: async (...args) => { sendCommand('askAssistant', args); },
    stopMeetingSession: () => sendCommand('stopMeetingSession'),
    setIsPlanModalOpen: (value) => sendCommand('setIsPlanModalOpen', value),
    setIsPlatformClosed: (value) => sendCommand('setIsPlatformClosed', value),
  };

  return <AssistantBridgeContext.Provider value={context}>{children}</AssistantBridgeContext.Provider>;
};

export const useAssistantMeeting = (): AssistantWidgetContext => {
  const meeting = useContext(MeetingContext);
  const assistant = useContext(AssistantBridgeContext);
  if (meeting) return meeting;
  if (assistant) return assistant;
  throw new Error('Assistant requires the main meeting owner or assistant bridge.');
};

export const isAssistantWindow = (): boolean =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('window') === 'assistant';

export const getInitialAssistantSnapshot = (value: MeetingContextType, protection: ProtectionStatus): AssistantSnapshot => ({
  isFloatingActive: value.isFloatingActive,
  isWidgetCollapsed: value.isWidgetCollapsed,
  answerCardSize: value.answerCardSize,
  activeMeeting: value.activeMeeting,
  selectedLanguage: SUPPORTED_LANGUAGES.find((language) => language.code === value.selectedLanguage.code) || value.selectedLanguage,
  targetLanguage: value.targetLanguage,
  translationEnabled: value.translationEnabled,
  speakTranslations: value.speakTranslations,
  liveTranscript: value.liveTranscript,
  currentMeetingTranscript: value.currentMeetingTranscript,
  liveBrief: value.liveBrief,
  checkedActions: [...value.checkedActions],
  isDetectable: value.isDetectable,
  hideMeetxHidesWidget: value.hideMeetxHidesWidget,
  isEntireScreenShareReported: value.isEntireScreenShareReported,
  freeMeetingsLeft: value.freeMeetingsLeft,
  isProUser: value.isProUser,
  assistantMessages: value.assistantMessages,
  isThinking: value.isThinking,
  contentProtection: protection,
});

export const supportedLanguageForCode = (code: string): SupportedLanguage | undefined =>
  SUPPORTED_LANGUAGES.find((language) => language.code === code);
