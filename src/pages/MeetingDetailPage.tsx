import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Copy,
  Check,
  Play,
  Send,
  Loader2,
  Video,
  ExternalLink,
  Paperclip,
  FileText,
  Clock,
  ShieldCheck,
  XCircle,
  Share2,
  Mic,
  Lightbulb,
  ListChecks,
  Users,
  Bell,
  CalendarClock,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMeeting } from '../contexts/MeetingContext';
import { Meeting, getLanguageDisplayName } from '../types/meeting';
import { getMeetingById } from '../services/meetingService';
import { buildSummaryFromTranscript, buildShareableMinutes, buildLiveBrief, buildMeetingTranscriptContext } from '../services/meetingInsightService';

const formatDateTime = (ts?: number): string => {
  if (!ts) return '';
  return new Date(ts).toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const MeetingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { startMeetingSession, askAssistant, activeMeeting, assistantMessages, isThinking, liveTranscript } =
    useMeeting();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [accessDenied, setAccessDenied] = useState<boolean>(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [askQuery, setAskQuery] = useState('');
  const [convFilter, setConvFilter] = useState('');

  // Phase 4: retrieve the ACTUAL saved meeting and verify it belongs to the
  // authenticated user. No fake records are rendered.
  useEffect(() => {
    let cancelled = false;
    async function fetchMeeting() {
      if (!id || !currentUser?.uid) {
        setIsLoading(false);
        setAccessDenied(true);
        return;
      }
      setIsLoading(true);
      const found = await getMeetingById(id, currentUser.uid);
      if (cancelled) return;
      if (found) {
        setMeeting(found);
        setAccessDenied(false);
      } else {
        setMeeting(null);
        setAccessDenied(true);
      }
      setIsLoading(false);
    }
    fetchMeeting();
    return () => {
      cancelled = true;
    };
  }, [id, currentUser?.uid]);

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sessionIsActiveForThisMeeting = activeMeeting?.id === meeting?.id;
  // Phase 8: all insights are derived from the ACTUAL stored transcript.
  // Nothing is invented — if there is no recorded conversation, each section
  // honestly reports that. While a live session is running for THIS meeting the
  // lines captured since it started are shown together with the persisted ones
  // (the debounced write may not have landed yet); both sides are this
  // meeting's own data, so nothing from another meeting can appear.
  const transcript = meeting
    ? buildMeetingTranscriptContext(
        meeting.transcript,
        sessionIsActiveForThisMeeting ? liveTranscript : []
      )
    : [];
  const summary = meeting ? buildSummaryFromTranscript(meeting, transcript) : null;
  const shareableText = meeting ? buildShareableMinutes(meeting, transcript) : '';

  const brief = meeting ? buildLiveBrief(meeting.topic || meeting.title, transcript) : null;

  // Participants overview: remarks + first/last spoken line per speaker.
  const participantStats = Array.from(
    transcript.reduce((map, t) => {
      const name = t.speakerName || t.speakerId || 'Speaker';
      const cur = map.get(name) || { count: 0, first: '', last: '' };
      cur.count += 1;
      if (t.timestamp) {
        if (!cur.first) cur.first = t.timestamp;
        cur.last = t.timestamp;
      }
      return map;
    }, new Map<string, { count: number; first: string; last: string }>())
  );

  const handleLaunchAssistant = () => {
    if (!meeting || !currentUser?.uid) return;
    // Start the live session from the persisted meeting record (Phase 4)
    startMeetingSession({
      meeting,
      userId: currentUser.uid,
      platform: meeting.platform,
      topic: meeting.topic,
      meetingLink: meeting.meetingLink,
      pastedNotes: meeting.pastedNotes,
      resources: meeting.resources,
    });
  };

  const handleSendAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuery.trim() || !meeting || !currentUser?.uid) return;
    // Make sure the assistant context points to this meeting before asking
    if (!sessionIsActiveForThisMeeting) {
      startMeetingSession({
        meeting,
        userId: currentUser.uid,
        platform: meeting.platform,
        topic: meeting.topic,
        meetingLink: meeting.meetingLink,
        pastedNotes: meeting.pastedNotes,
        resources: meeting.resources,
      });
    }
    const question = askQuery.trim();
    setAskQuery('');
    void askAssistant(question, 'query');
  };

  // Phase 8: share controls — native share when the browser supports it,
  // otherwise copy the real meeting minutes to the clipboard.
  const handleShare = async () => {
    if (!meeting) return;
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: meeting.title || meeting.topic || 'MEETX Meeting',
          text: shareableText,
          url,
        });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // User cancelled the share sheet — do nothing.
      }
    } else {
      navigator.clipboard?.writeText(`${shareableText}\n\nDetails: ${url}`);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-xs text-slate-400 mt-3">Retrieving meeting...</p>
      </div>
    );
  }

  if (accessDenied || !meeting) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mb-4">
          <XCircle className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Meeting not found</h1>
        <p className="text-xs text-slate-500 mt-2 max-w-sm">
          No saved meeting exists for this link, or it is not associated with your account.
        </p>
        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={() => navigate('/history')}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Back to History
          </button>
          <button
            onClick={() => navigate('/home')}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors"
          >
            New Meeting
          </button>
        </div>
      </div>
    );
  }

  const resources = meeting.resources || [];
  const totalResourceBytes = resources.reduce((sum, r) => sum + (r.size || 0), 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-24">
      {/* Top Breadcrumb & Share Controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/history')}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Meeting History</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCopy(window.location.href)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copy link</span>
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium shadow-sm transition-colors"
          >
            {shared ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{shared ? 'Shared / Copied' : 'Share meeting'}</span>
          </button>
        </div>
      </div>

      {/* Meeting Header (real saved data) */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 font-medium">{formatDateTime(meeting.createdAt)}</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            {meeting.platform}
          </span>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${meeting.status === 'live'
              ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
              : meeting.status === 'completed'
                ? 'bg-slate-100 text-slate-600 border-slate-200'
                : 'bg-blue-50 text-blue-600 border-blue-200'
              }`}
          >
            {meeting.status}
          </span>
          {meeting.duration && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <Clock className="w-3 h-3" />
              {meeting.duration}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
            <ShieldCheck className="w-3 h-3" />
            Verified: your account
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
          {meeting.title || meeting.topic || 'Untitled Meeting'}
        </h1>
        {meeting.topic && meeting.title && meeting.topic !== meeting.title && (
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Topic: {meeting.topic}</p>
        )}
      </div>

      {/* 1 + 2. Meeting Information (real saved data) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-slate-900">Meeting Information</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-slate-400 flex items-center gap-1.5 mb-1">
              <Video className="w-3.5 h-3.5" />
              Platform
            </div>
            <div className="font-semibold text-slate-800">{meeting.platform}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-slate-400 flex items-center gap-1.5 mb-1">
              <FileText className="w-3.5 h-3.5" />
              Selected Language
            </div>
            <div className="font-semibold text-slate-800">{getLanguageDisplayName(meeting.selectedLanguage)}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-slate-400 flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5" />
              Duration
            </div>
            <div className="font-semibold text-slate-800">{meeting.duration || '—'}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-slate-400 flex items-center gap-1.5 mb-1">
              <Mic className="w-3.5 h-3.5" />
              Recorded Remarks
            </div>
            <div className="font-semibold text-slate-800">
              {transcript.length}
              {totalResourceBytes > 0 && (
                <span className="text-slate-400 font-medium"> • {resources.length} resource{resources.length === 1 ? '' : 's'} ({formatFileSize(totalResourceBytes)})</span>
              )}
            </div>
          </div>
        </div>

        {/* Join Link */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-slate-400 text-[11px] uppercase tracking-wider mb-1.5">Join Link</div>
          {meeting.meetingLink ? (
            <div className="flex items-center justify-between gap-2">
              <a
                href={meeting.meetingLink}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:text-blue-700 font-medium truncate max-w-[70%] inline-flex items-center gap-1"
              >
                <span className="truncate">{meeting.meetingLink}</span>
                <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              </a>
              <button
                onClick={() => handleCopy(meeting.meetingLink || '')}
                className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors"
              >
                <Copy className="w-3 h-3" />
                Copy
              </button>
            </div>
          ) : (
            <div className="text-slate-500 text-xs italic">No join link provided</div>
          )}
        </div>

        {/* Pasted Notes / Resume */}
        <div>
          <div className="text-slate-400 text-[11px] uppercase tracking-wider mb-1.5">
            Notes / Resume Context
          </div>
          {meeting.pastedNotes ? (
            <pre className="whitespace-pre-wrap text-xs sm:text-sm text-slate-700 bg-white border border-slate-200 rounded-xl p-3.5 leading-relaxed max-h-64 overflow-y-auto">
              {meeting.pastedNotes}
            </pre>
          ) : (
            <div className="text-xs text-slate-400 italic">No notes or resume were pasted for this meeting.</div>
          )}
        </div>

        {/* Uploaded Resources */}
        <div>
          <div className="text-slate-400 text-[11px] uppercase tracking-wider mb-1.5">
            Uploaded Resources
          </div>
          {resources.length > 0 ? (
            <div className="space-y-1.5">
              {resources.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200 text-xs"
                >
                  <span className="flex items-center gap-2 font-medium text-slate-700 min-w-0">
                    <Paperclip className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <span className="truncate">{r.name}</span>
                    {r.size ? <span className="text-slate-400 flex-shrink-0">{formatFileSize(r.size)}</span> : null}
                  </span>
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      download={r.url.startsWith('data:') ? r.name : undefined}
                      className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 flex-shrink-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open
                    </a>
                  ) : (
                    <span className="text-slate-400 text-[11px] flex-shrink-0">metadata only</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic">No resources were uploaded for this meeting.</div>
          )}
        </div>
      </div>

      {/* 3. Structured Summary — generated from the actual stored transcript */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-blue-500" />
          <h2 className="text-sm font-bold text-slate-900">Structured Summary</h2>
        </div>
        {summary ? (
          <>
          {brief ? (
            <div className="mb-2 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-2.5 py-1.5 inline-block">
              {brief.title}
            </div>
          ) : null}
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{summary.overview}</p>
          {brief?.summary ? (
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">{brief.summary}</p>
          ) : null}
          </>
        ) : (
          <div className="text-xs text-slate-400 italic py-2">
            No summary is available yet — this meeting has no recorded conversation. Start (or resume)
            the meeting with the assistant; remarks are recorded and the summary is generated from the
            real transcript when the session ends.
          </div>
        )}
      </div>

      {/* 4. Important Key Points — from the actual conversation */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-900">Important Key Points</h2>
        </div>
        {summary?.keyPoints?.length ? (
          <ul className="space-y-2">
            {summary.keyPoints.map((point, i) => (
              <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700">
                <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs text-slate-400 italic py-2">
            No key points yet — key points are extracted from the recorded conversation.
          </div>
        )}
      </div>

      {/* Participants - who spoke in this conversation */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-bold text-slate-900">Participants</h2>
          {participantStats.length > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
              {participantStats.length}
            </span>
          )}
        </div>
        {participantStats.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {participantStats.map(([name, stat], idx) => (
              <div key={name} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ backgroundColor: ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"][idx % 5] }}
                >
                  {name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{name}</div>
                  <div className="text-[10px] text-slate-400">
                    {stat.count} remark{stat.count === 1 ? '' : 's'} · {stat.first || '-'} → {stat.last || '-'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 italic">No participants recorded yet.</div>
        )}
      </div>
      {/* 5. Transcript — the actual stored transcript */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-bold text-slate-900">Meeting Conversation</h2>
          </div>
          {transcript.length > 0 && (
            <button
              onClick={() => handleCopy(transcript.map((t) => `[${t.timestamp}] ${t.speakerName || t.speakerId}: ${t.translatedText || t.text}`).join('\n'))}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 transition-colors"
            >
              <Copy className="w-3 h-3" />
              Copy transcript
            </button>
          )}
        </div>
        {transcript.length > 0 && (
          <input
            type="text"
            value={convFilter}
            onChange={(e) => setConvFilter(e.target.value)}
            placeholder="Search conversation by speaker or text..."
            className="w-full mb-3 px-3 py-2 text-xs bg-slate-50 border border-slate-200 focus:border-blue-400 rounded-lg outline-none transition-colors"
          />
        )}
        {transcript.length > 0 ? (
          <div className="max-h-96 overflow-y-auto space-y-2.5 pr-1">
            {transcript
              .filter((t) => {
                if (!convFilter.trim()) return true;
                const q = convFilter.toLowerCase();
                return (
                  (t.speakerName || t.speakerId || '').toLowerCase().includes(q) ||
                  (t.text || '').toLowerCase().includes(q) ||
                  (t.translatedText || '').toLowerCase().includes(q)
                );
              })
              .map((t, i) => (
              <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-slate-700">
                    {t.speakerName || t.speakerId || 'Speaker'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {t.translatedText && t.targetLanguage ? (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-100">translated</span>
                    ) : null}
                  <span className="text-[10px] text-slate-400 font-mono">{t.timestamp}</span>
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 italic py-2">
            No transcript stored for this meeting yet.
          </div>
        )}
      </div>

      {/* 6. Actions, Deadlines and Reminders - extracted from the real conversation */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ListChecks className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-900">Actions</h2>
            {brief?.actions?.length ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                {brief.actions.length}
              </span>
            ) : null}
          </div>
          {brief?.actions?.length ? (
            <ul className="space-y-2">
              {brief.actions.map((action) => (
                <li key={action.id} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700">
                  <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                  <span className="leading-relaxed">
                    {action.text}
                    {action.assignee || action.dueDate ? (
                      <span className="ml-1.5 inline-flex gap-1 align-middle">
                        {action.assignee ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">{action.assignee}</span>
                        ) : null}
                        {action.dueDate ? (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-100">{action.dueDate}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : summary?.actions?.length ? (
            <ul className="space-y-2">
              {summary.actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700">
                  <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                  <span className="leading-relaxed">{action}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-slate-400 italic py-2">No action items detected in the conversation content.</div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CalendarClock className="w-4 h-4 text-rose-500" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Deadlines</h3>
          </div>
          {brief?.deadlines?.length ? (
            <ul className="space-y-1.5">
              {brief.deadlines.map((d) => (
                <li key={d.id} className="flex items-start gap-2 text-xs text-slate-700">
                  <span className="mt-0.5">⏰</span>
                  <span><span className="font-semibold text-rose-600 mr-1">{d.date}</span>{d.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-slate-400 italic">No deadlines were mentioned in the conversation.</div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Reminders</h3>
          </div>
          {brief?.reminders?.length ? (
            <ul className="space-y-1.5">
              {brief.reminders.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                  <span className="mt-0.5">🔔</span>
                  <span className="leading-relaxed">{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-xs text-slate-400 italic">No reminders yet - deadlines and open questions appear here.</div>
          )}
        </div>
      </div>
      {/* Meeting Inquiries (real assistant responses, when a session is active) */}
      {sessionIsActiveForThisMeeting && assistantMessages.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-sm space-y-3">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Meeting Inquiries
          </h4>
          {assistantMessages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded-xl text-xs sm:text-sm ${msg.sender === 'user'
                ? 'bg-blue-50 text-blue-900 border border-blue-100 ml-auto max-w-md'
                : 'bg-slate-50 text-slate-800 border border-slate-200 mr-auto max-w-md'
                }`}
            >
              <div className="font-semibold text-[11px] mb-1 opacity-70">
                {msg.sender === 'user' ? 'You' : 'MEETX AI'}
              </div>
              <div>{msg.text}</div>
            </div>
          ))}
          {isThinking && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              MEETX is thinking...
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Bar: Resume Session + Ask about this meeting */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 max-w-2xl w-[92%] z-40 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 p-2 flex items-center gap-2">
        <button
          onClick={handleLaunchAssistant}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-all flex-shrink-0 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>{sessionIsActiveForThisMeeting ? 'Assistant Active' : 'Launch Assistant'}</span>
        </button>

        <form onSubmit={handleSendAsk} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            placeholder="Ask about this meeting..."
            value={askQuery}
            onChange={(e) => setAskQuery(e.target.value)}
            className="flex-1 px-3.5 py-2 text-xs sm:text-sm bg-slate-100 focus:bg-white border border-transparent focus:border-blue-400 rounded-xl outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!askQuery.trim()}
            className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors flex-shrink-0"
            title="Ask"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
