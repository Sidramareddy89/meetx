import React from 'react';
import { Mic, Copy, Check } from 'lucide-react';
import { MeetingTranscriptEntry } from '../../types/meeting';
import { LiveBrief } from '../../services/meetingInsightService';
import { groupTranscriptBySpeaker } from '../../services/meetingInsightService';

interface Props {
  liveTranscript: MeetingTranscriptEntry[];
  liveBrief: LiveBrief | null;
  checkedActions: Set<string>;
  toggleActionCheck: (id: string) => void;
  copiedId: string | null;
  onCopy: (id: string, text: string) => void;
  onQuickAction: (mode: 'whatToSay' | 'followUp' | 'recap') => void;
  /** Real recognizer state, so an empty pane explains WHY there is no speech. */
  isListening?: boolean;
  isSupported?: boolean;
}

export const LiveConversationPane: React.FC<Props> = ({
  liveTranscript,
  onCopy,
  copiedId,
  onQuickAction,
  isListening,
  isSupported,
}) => {
  if (liveTranscript.length === 0) {
    // The assistant is asked questions from this meeting, so an empty pane must
    // say what is actually wrong instead of implying it is always listening:
    // a silent pane here is why the AI used to reply "no transcript given".
    const unsupported = isSupported === false;
    const head = unsupported
      ? 'Speech recognition is not available in this browser.'
      : isListening === false
        ? 'The microphone is off — no speech is being captured.'
        : 'Listening for the other side… speak now.';
    const hint = unsupported
      ? 'Open MEETX in Chrome or Edge (with mic permission) to capture the conversation. The AI can still answer from your topic, notes and documents until then.'
      : isListening === false
        ? 'Turn the microphone on in MEETX so the live conversation — and therefore the AI answers — are based on what is actually being said.'
        : 'Chrome/Edge + mic permission required. Each remark appears here instantly.';
    return (
      <div className="py-4 text-center text-slate-400 flex flex-col items-center gap-1.5">
        <Mic className={`w-4 h-4 ${isListening === false ? 'text-slate-500' : 'text-emerald-400 animate-pulse'}`} />
        <span>{head}</span>
        <span className="text-[10px] text-slate-500">{hint}</span>
      </div>
    );
  }
  const turns = groupTranscriptBySpeaker(liveTranscript);
  return (
    <div className="pt-1 space-y-2.5">
      {turns.map((turn, ti) => (
        <div key={ti} className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-emerald-300">{turn.speaker}</span>
            <span className="text-[10px] text-slate-500">
              {turn.lastAt} • {turn.lines.length} remark{turn.lines.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="space-y-1.5">
            {turn.lines.map((line) => {
              const shown =
                line.translatedText && !line.translatedText.includes('translating')
                  ? line.translatedText
                  : line.text;
              const pending = (line.translatedText || '').includes('translating');
              return (
                <div key={line.id} className="text-[11px] leading-relaxed">
                  <span className="text-slate-500 mr-1.5">{line.timestamp}</span>
                  <span className="text-slate-100">{shown}</span>
                  {line.originalText && !pending && line.originalText !== shown && (
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Original: {line.originalText}
                    </div>
                  )}
                  {pending && (
                    <div className="text-[10px] text-emerald-400 animate-pulse">
                      …translating…
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => onQuickAction('whatToSay')}
                      className="px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-400/20 text-[9px] text-blue-300 hover:bg-blue-500/20 cursor-pointer"
                    >
                      What to say
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuickAction('followUp')}
                      className="px-1.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-400/20 text-[9px] text-teal-300 hover:bg-teal-500/20 cursor-pointer"
                    >
                      Follow-up
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuickAction('recap')}
                      className="px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-400/20 text-[9px] text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                    >
                      Recap
                    </button>
                    <button
                      type="button"
                      onClick={() => onCopy(line.id, shown)}
                      className="px-1.5 py-0.5 rounded-full bg-slate-700/60 border border-slate-600/60 text-[9px] text-slate-300 hover:text-white cursor-pointer"
                    >
                      {copiedId === line.id ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
