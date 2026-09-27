export type MeetingPlatform = 'Zoom' | 'Google Meet' | 'Microsoft Teams' | 'Webex' | 'Browser / Other';

export interface MeetingTranscriptEntry {
  id: string;
  speakerId: string;
  speakerName?: string;
  text: string;
  /** Original utterance before translation (present when live-translated). */
  originalText?: string;
  /** Completed translation (present when live-translated). */
  translatedText?: string;
  timestamp: string;
  /** BCP-47 code of the language this line is written in. */
  language?: string;
  /** BCP-47 code of the live subtitle target (when translation is on). */
  targetLanguage?: string;
}

export interface MeetingResource {
  id: string;
  name: string;
  url?: string;
  type: string;
  size?: number;
  content?: string;
}

export interface MeetingSummary {
  overview?: string;
  keyPoints: string[];
  actions: string[];
}

export interface Meeting {
  id: string;
  userId: string;
  title: string;
  platform: MeetingPlatform;
  meetingLink?: string;
  topic: string;
  /** Phase 9: stores the BCP-47 language CODE selected on the Home page,
   * the same value the Web Speech API recognizer uses for transcription. */
  selectedLanguage: string;
  resources?: MeetingResource[];
  pastedNotes?: string;
  createdAt: number;
  duration?: string;
  recordingUrl?: string;
  transcript: MeetingTranscriptEntry[];
  summary?: MeetingSummary;
  status: 'scheduled' | 'live' | 'completed';
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
}

/**
 * Phase 9: languages genuinely supported by the implemented transcription
 * system (browser Web Speech API recognizer) and the AI copilot.
 * No unsupported languages are offered.
 */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en-US', name: 'English (US)', nativeName: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)', nativeName: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr-FR', name: 'French', nativeName: 'Français' },
  { code: 'de-DE', name: 'German', nativeName: 'Deutsch' },
  { code: 'hi-IN', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'ja-JP', name: 'Japanese', nativeName: '日本語' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文' }
];

/** Resolve a stored language code/name to its display name (falls back to raw value). */
export const getLanguageDisplayName = (codeOrName?: string): string => {
  if (!codeOrName) return '—';
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === codeOrName || l.name === codeOrName);
  return found ? found.name : codeOrName;
};
