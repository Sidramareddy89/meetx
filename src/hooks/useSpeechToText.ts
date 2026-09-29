import { useState, useEffect, useRef, useCallback } from 'react';
import { MeetingTranscriptEntry } from '../types/meeting';
import { translateText } from '../services/translationService';

interface UseSpeechToTextProps {
  language: string;
  /** Target subtitle language (BCP-47). When different from `language`,
   * each final transcript is translated in real time and the entry stores
   * the translation in `text` with the original kept in `originalText`. */
  targetLanguage?: string;
  /** When true, speak every translated/final line aloud via SpeechSynthesis. */
  speakTranslations?: boolean;
  onTranscriptReceived: (entry: MeetingTranscriptEntry) => void;
  onVoiceQuery?: (text: string, transcriptEntryId: string) => void;
  /**
   * Window whose realm hosts the Web Speech recognizer. Defaults to the app
   * window. The browser floating assistant window (Document Picture-in-Picture) passes
   * its own window so recognition runs in the ALWAYS-VISIBLE document: the
   * opener tab can be backgrounded when the user switches tabs or
   * applications — which may stall recognition — while the PiP window itself
   * stays visible and on top of other apps.
   */
  hostWindow?: Window;
}

/** Heuristic: does this utterance look like a question worth sending to the LLM? */
const looksLikeQuestion = (text: string): boolean => {
  const t = text.toLowerCase().trim();
  if (t.endsWith('?')) return true;
  return /^(what|how|should|can|could|would|tell me|explain|summar|giv|recap|assist|advise|help|meaning|reason|why)\b/.test(t);
};

export const useSpeechToText = ({ language, targetLanguage, speakTranslations, onTranscriptReceived, onVoiceQuery, hostWindow }: UseSpeechToTextProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const recognitionRef = useRef<any>(null);
  const startTimeRef = useRef<number>(Date.now());
  // The processed mic stream feeding the recognizer. Held so it can be released
  // on stop/unmount - otherwise the browser's recording indicator would stay on
  // after the meeting ends.
  const audioStreamRef = useRef<MediaStream | null>(null);

  /**
   * Audio tuned to pick the MEETING out of the room instead of every noise in it:
   *  - echoCancellation  drops the meeting audio played back through the speakers
   *                      (without it MEETX transcribes itself in a loop)
   *  - noiseSuppression  attenuates fans, typing, chairs, background chatter
   *  - autoGainControl   keeps the level steady when someone speaks quietly
   *  - channelCount 1    mono is what the recognizer actually consumes, so the
   *                      device is not asked for channels it will discard
   * Returns null when the browser denies the mic or offers no devices, so the
   * caller can still run with the recognizer's own default input.
   */
  const openFocusedMicStream = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const md = typeof navigator !== 'undefined' ? (navigator as any).mediaDevices : null;
      if (!md || typeof md.getUserMedia !== 'function') return null;
      const stream = await md.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      audioStreamRef.current = stream;
      return stream;
    } catch {
      // Permission denied or no input device: the recognizer falls back to its
      // default input rather than the meeting going silent.
      return null;
    }
  }, []);

  const releaseMicStream = useCallback(() => {
    const stream = audioStreamRef.current;
    audioStreamRef.current = null;
    try {
      stream?.getTracks?.().forEach((track: any) => track.stop());
    } catch {
      // best effort
    }
  }, []);

  // F1: volatile inputs live in refs so that a new callback identity (the widget
  // passes inline arrow functions) or an unrelated state change can never tear
  // the recognizer down and recreate it. `language` is the only value that
  // actually configures the recognizer (`recognition.lang`), so the callback is
  // allowed to change only when it changes.
  const callbacksRef = useRef({ onTranscriptReceived, onVoiceQuery });
  const optionsRef = useRef({ targetLanguage, speakTranslations });
  // Mirrors `isListening` synchronously for the recognizer's own handlers.
  const isListeningRef = useRef(false);

  // Refreshed after every render: the recognizer's handlers read `.current` at
  // event time, so they always use the latest callbacks / target language /
  // speak-aloud flag without needing a new recognizer instance.
  useEffect(() => {
    callbacksRef.current = { onTranscriptReceived, onVoiceQuery };
    optionsRef.current = { targetLanguage, speakTranslations };
  });

  const formatTimestamp = (millis: number) => {
    const totalSecs = Math.floor(millis / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Bumped by every start AND every stop. The mic permission prompt is async, so
  // without this token a stop (or a second start) while the prompt is open would
  // still start a recognizer afterwards - leaving the mic live after the meeting.
  const startTokenRef = useRef(0);

  const startListening = useCallback(() => {
    // Prefer the constructors of the HOST window (the floating assistant window
    // when it is open) and fall back to the app window, so a host without the
    // Web Speech API degrades to the opener instead of to "unsupported".
    const host = hostWindow ?? window;
    const SpeechRecognition =
      (host as any).SpeechRecognition || (host as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setIsListening(true);
      isListeningRef.current = true;
      return;
    }
    if (isListeningRef.current) return;

    const token = (startTokenRef.current += 1);
    isListeningRef.current = true;

    // Create + start a recognizer, optionally fed by the processed mic stream.
    const buildAndStart = (stream: MediaStream | null) => {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        // One alternative only: extra alternatives are the most common way a
        // stray noise turns into a bogus "transcript".
        recognition.maxAlternatives = 1;
        recognition.lang = language || 'en-US';
        if (stream) {
          try {
            recognition.stream = stream;
          } catch {
            // Stream not accepted: keep the recognizer's own default input.
          }
        }

      recognition.onresult = (event: any) => {
        // F1: resolved from refs at event time — always the newest callbacks and
        // options, regardless of how many times the widget re-rendered.
        const { onTranscriptReceived: emitTranscript, onVoiceQuery: emitVoiceQuery } = callbacksRef.current;
        const { targetLanguage: liveTargetLanguage, speakTranslations: liveSpeakTranslations } = optionsRef.current;
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          const text = lastResult[0].transcript.trim();
          if (text) {
            const timeOffset = Date.now() - startTimeRef.current;
            const id = Date.now().toString();
            const srcLang = language;
            const dstLang = liveTargetLanguage && liveTargetLanguage !== srcLang ? liveTargetLanguage : undefined;

            if (dstLang) {
              // Show the original instantly, then swap in the translation
              // when it arrives — true real-time subtitles.
              emitTranscript({
                id,
                speakerId: 'Speaker',
                text,
                originalText: text,
                translatedText: '…translating…',
                timestamp: formatTimestamp(timeOffset),
                language: srcLang,
                targetLanguage: dstLang,
              });
              setIsTranslating(true);
              translateText(text, { from: srcLang, to: dstLang })
                .then((translated) => {
                  emitTranscript({
                    id: `${id}-t`,
                    speakerId: 'Speaker',
                    text: translated,
                    originalText: text,
                    translatedText: translated,
                    timestamp: formatTimestamp(Date.now() - startTimeRef.current),
                    language: dstLang,
                    targetLanguage: dstLang,
                  });
                  if (liveSpeakTranslations && 'speechSynthesis' in window) {
                    try {
                      const utter = new SpeechSynthesisUtterance(translated);
                      utter.lang = dstLang;
                      window.speechSynthesis.speak(utter);
                    } catch {
                      // Audio output is best-effort only.
                    }
                  }
                  if (emitVoiceQuery && looksLikeQuestion(translated)) {
                    emitVoiceQuery(translated, `${id}-t`);
                  }
                })
                .finally(() => setIsTranslating(false));
            } else {
              emitTranscript({
                id,
                speakerId: 'Speaker',
                text,
                timestamp: formatTimestamp(timeOffset),
                language: srcLang,
              });
              if (liveSpeakTranslations && 'speechSynthesis' in window) {
                try {
                  const utter = new SpeechSynthesisUtterance(text);
                  utter.lang = srcLang;
                  window.speechSynthesis.speak(utter);
                } catch {
                  // Audio output is best-effort only.
                }
              }

              // Voice -> text -> LLM answer: if the utterance is a question,
              // route it to the assistant for a text answer via the LLM + RAG.
              if (emitVoiceQuery && looksLikeQuestion(text)) {
                emitVoiceQuery(text, id);
              }
            }
          }
        }
      };

      recognition.onerror = (err: any) => {
        console.warn('Speech recognition warning:', err);
      };

      recognition.onend = () => {
        // F1: only THIS recognizer may auto-restart, and only while the listening
        // session is genuinely active. A deliberate stop clears both, so stopping
        // still stops recognition.
        if (recognitionRef.current === recognition && isListeningRef.current) {
          try {
            recognition.start();
          } catch {
            // Restart if continuous
          }
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      // F1: the timestamp baseline is set when a NEW listening session starts.
      // Since the instance is no longer recreated on every render, this now runs
      // only on a genuine start (or an intentional reconfiguration such as a
      // language change) — never on an unrelated re-render. Automatic restarts
      // after `onend` reuse the instance and keep the baseline untouched.
      startTimeRef.current = Date.now();
      isListeningRef.current = true;
      setIsListening(true);
      } catch (err) {
        console.warn('Error starting speech recognition:', err);
        setIsListening(true);
        isListeningRef.current = true;
      }
    };

    // Start right away on the default input: the meeting must never wait on a
    // microphone permission prompt.
    buildAndStart(null);

    // Then upgrade once, to the echo-cancelled / noise-suppressed stream, as
    // soon as the browser grants it. The first recognizer is retired: its onend
    // guard (identity check) means it cannot auto-restart over the new one.
    void (async () => {
      const stream = await openFocusedMicStream();
      if (!stream || startTokenRef.current !== token || !isListeningRef.current) {
        // Stopped (or already upgraded) while the prompt was open.
        if (stream && audioStreamRef.current !== stream) {
          try { stream.getTracks().forEach((t: any) => t.stop()); } catch { /* best effort */ }
        }
        return;
      }
      try {
        recognitionRef.current?.stop();
      } catch {
        // Already stopped.
      }
      buildAndStart(stream);
    })();
    // F1: `language` and `hostWindow` are the only values that genuinely
    // configure the recognizer (`recognition.lang` + which realm it lives in).
    // Callbacks, target language and the speak-aloud flag are read from refs,
    // so new callback identities and unrelated state changes no longer tear
    // the instance down.
  }, [language, hostWindow, openFocusedMicStream, releaseMicStream]);

  const stopListening = useCallback(() => {
    // F1: mark the session stopped BEFORE stopping the recognizer so its onend
    // handler cannot auto-restart it.
    isListeningRef.current = false;
    // Cancel a start that is still waiting on the mic permission prompt.
    startTokenRef.current += 1;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    // Release the mic, otherwise the browser keeps showing "recording" after the
    // meeting has ended.
    releaseMicStream();
    setIsListening(false);
  }, [releaseMicStream]);

  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      startTokenRef.current += 1;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      releaseMicStream();
    };
  }, [releaseMicStream]);

  return {
    isListening,
    isSupported,
    isTranslating,
    startListening,
    stopListening
  };
};
