import React, { useEffect, useRef, useState } from 'react';
import { emitTo, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useMeeting } from '../contexts/MeetingContext';
import {
  AssistantSnapshot,
  getInitialAssistantSnapshot,
  ProtectionStatus,
  supportedLanguageForCode,
} from './assistantBridge';
import { closeNativeAssistantWindow, isNativeDesktop, openOrRestoreNativeAssistant } from './nativeAssistantWindow';

type CommandMessage = { command: string; payload?: unknown };

export const DesktopAssistantHost: React.FC = () => {
  const meeting = useMeeting();
  const [protection, setProtection] = useState<ProtectionStatus>({ status: 'not-requested', detail: 'Private Mode is off.' });
  const meetingRef = useRef(meeting);
  const protectionRef = useRef(protection);
  const snapshotRef = useRef<AssistantSnapshot>(getInitialAssistantSnapshot(meeting, protection));
  const assistantReadyRef = useRef(false);
  const isOpeningRef = useRef(false);

  meetingRef.current = meeting;
  protectionRef.current = protection;
  snapshotRef.current = getInitialAssistantSnapshot(meeting, protection);

  useEffect(() => {
    if (!isNativeDesktop()) return;
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const publish = () => {
      if (assistantReadyRef.current) {
        void emitTo('assistant', 'meetx:assistant-snapshot', snapshotRef.current).catch(() => {});
      }
    };

    void listen('meetx:assistant-ready', () => {
      assistantReadyRef.current = true;
      publish();
    }).then((unlisten) => { if (disposed) unlisten(); else unlisteners.push(unlisten); });

    void listen<CommandMessage>('meetx:assistant-command', ({ payload }) => {
      const owner = meetingRef.current;
      const value = payload.payload;
      switch (payload.command) {
        case 'setIsWidgetCollapsed': owner.setIsWidgetCollapsed(Boolean(value)); break;
        case 'increaseCardSize': owner.increaseCardSize(); break;
        case 'decreaseCardSize': owner.decreaseCardSize(); break;
        case 'setTargetLanguage': {
          const language = supportedLanguageForCode(String(value));
          if (language) owner.setTargetLanguage(language);
          break;
        }
        case 'setSpeakTranslations': owner.setSpeakTranslations(Boolean(value)); break;
        case 'setIsDetectable': owner.setIsDetectable(Boolean(value)); break;
        case 'setHideMeetxHidesWidget': owner.setHideMeetxHidesWidget(Boolean(value)); break;
        case 'setIsEntireScreenShareReported': owner.setIsEntireScreenShareReported(Boolean(value)); break;
        case 'setIsPlanModalOpen': owner.setIsPlanModalOpen(Boolean(value)); break;
        case 'setIsPlatformClosed': owner.setIsPlatformClosed(Boolean(value)); break;
        case 'toggleActionCheck': owner.toggleActionCheck(String(value)); break;
        case 'addTranscriptEntry': owner.addTranscriptEntry(value as Parameters<typeof owner.addTranscriptEntry>[0]); break;
        case 'clearAssistantMessages': owner.clearAssistantMessages(); break;
        case 'stopMeetingSession': owner.stopMeetingSession(); break;
        case 'askAssistant': {
          const [query, action, options] = (Array.isArray(value) ? value : []) as Parameters<typeof owner.askAssistant>;
          void owner.askAssistant(query, action, options);
          break;
        }
      }
    }).then((unlisten) => { if (disposed) unlisten(); else unlisteners.push(unlisten); });

    return () => {
      disposed = true;
      assistantReadyRef.current = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (!isNativeDesktop()) return;
    if (!meeting.isFloatingActive) {
      setProtection({ status: 'not-requested', detail: 'No active meeting.' });
      void closeNativeAssistantWindow();
      return;
    }
    if (!isOpeningRef.current) {
      isOpeningRef.current = true;
      void openOrRestoreNativeAssistant().finally(() => { isOpeningRef.current = false; });
    }
  }, [meeting.isFloatingActive]);

  useEffect(() => {
    if (!isNativeDesktop() || !meeting.isFloatingActive) return;
    let cancelled = false;
    const isDetectable = meeting.isDetectable;
    void (async () => {
      // Wait until the single native top-level window exists before asking the
      // Rust layer to update and verify its OS-level affinity.
      for (let attempts = 0; attempts < 30 && !cancelled; attempts += 1) {
        if (await WebviewWindow.getByLabel('assistant')) break;
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      if (cancelled) return;
      try {
        const next = await invoke<ProtectionStatus>('set_assistant_content_protection', { enabled: !isDetectable });
        if (!cancelled) setProtection(next);
      } catch (error) {
        if (!cancelled) setProtection({ status: 'unknown', detail: `Could not verify OS content protection: ${String(error)}` });
      }
    })();

    return () => { cancelled = true; };
  }, [meeting.isFloatingActive, meeting.isDetectable]);

  useEffect(() => {
    if (!isNativeDesktop() || !meeting.isFloatingActive || !assistantReadyRef.current) return;
    void emitTo('assistant', 'meetx:assistant-snapshot', snapshotRef.current).catch(() => {});
  }, [meeting, protection]);

  return null;
};
