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
}

export const LiveConversationPane: React.FC<Props> = ({
  liveTranscript,
  onCopy,
  copiedId,
  onQuickAction,
}) => {
  if (liveTranscript.length === 0) {
    return (
      <div className="py-4 text-center text-slate-400 flex flex-col items-center gap-1.5">
        <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />
        <span>Listening for the other side… speak now.</span>
        <span className="text-[10px] text-slate-500">
          Chrome/Edge + mic permission required. Each remark appears here instantly.
        </span>
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
