import React from 'react';
import { LiveBrief } from '../../services/meetingInsightService';

interface Props {
  liveBrief: LiveBrief | null;
  checkedActions: Set<string>;
  toggleActionCheck: (id: string) => void;
}

export const LiveBriefPane: React.FC<Props> = ({ liveBrief, checkedActions, toggleActionCheck }) => {
  if (!liveBrief) {
    return (
      <div className="py-4 text-center text-slate-400 text-[11px]">
        No conversation yet — the live title, summary, actions, deadlines and
        reminders appear here as people speak.
      </div>
    );
  }
  const doneCount = liveBrief.actions.filter((a) => checkedActions.has(a.id)).length;
  return (
    <div className="pt-1 space-y-2.5">
      <div className="rounded-xl bg-blue-500/10 border border-blue-400/25 p-2.5">
        <div className="text-[10px] uppercase tracking-wider text-blue-300 font-bold mb-0.5">
          Title
        </div>
        <div className="text-xs font-semibold text-white">{liveBrief.title}</div>
        <div className="text-[11px] text-slate-300 mt-1 leading-relaxed">
          {liveBrief.summary}
        </div>
      </div>

      {liveBrief.keyPoints.length > 0 && (
        <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
            Summary • key points
          </div>
          <ul className="space-y-1 text-[11px] text-slate-200">
            {liveBrief.keyPoints.map((k, i) => (
              <li key={i}>• {k}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl bg-slate-800/50 border border-slate-700/60 p-2.5">
        <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
          Actions ({doneCount}/{liveBrief.actions.length} done)
        </div>
        {liveBrief.actions.length === 0 ? (
          <div className="text-[11px] text-slate-500">
            No action items detected yet.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {liveBrief.actions.map((a) => (
              <li key={a.id} className="flex items-start gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={checkedActions.has(a.id)}
                  onChange={() => toggleActionCheck(a.id)}
                  className="mt-0.5 accent-emerald-500 w-3 h-3"
                />
                <span
                  className={checkedActions.has(a.id) ? 'line-through text-slate-500' : 'text-slate-200'}
                >
                  {a.text}
                  {a.assignee && (
                    <span className="ml-1 px-1 rounded bg-indigo-500/20 text-indigo-300 text-[9px]">
                      @{a.assignee}
                    </span>
                  )}
                  {a.dueDate && (
                    <span className="ml-1 px-1 rounded bg-amber-500/20 text-amber-300 text-[9px]">
                      {a.dueDate}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {liveBrief.deadlines.length > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold mb-1">
            Deadlines
          </div>
          <ul className="space-y-1 text-[11px] text-amber-100">
            {liveBrief.deadlines.map((d) => (
              <li key={d.id}>
                ⏰ {d.date} — {d.text.slice(0, 120)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {liveBrief.reminders.length > 0 && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-400/25 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold mb-1">
            Reminders
          </div>
          <ul className="space-y-1 text-[11px] text-emerald-100">
            {liveBrief.reminders.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
