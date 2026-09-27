import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  ChevronRight,
  Plus,
  Video,
  FileText,
  Loader2,
  Paperclip,
  MoreVertical,
  Share2,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useMeeting } from '../contexts/MeetingContext';
import { Meeting, getLanguageDisplayName } from '../types/meeting';
import { getUserMeetings, deleteMeeting } from '../services/meetingService';
import { buildSummaryFromTranscript } from '../services/meetingInsightService';

type PeriodFilter = '1day' | '1week' | '1month' | 'custom';
type MeetingBucket = 'today' | 'week' | 'month' | 'earlier';

const startOfToday = (): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const bucketFor = (createdAt: number): MeetingBucket => {
  const now = Date.now();
  if (createdAt >= startOfToday()) return 'today';
  if (createdAt >= now - 7 * 24 * 60 * 60 * 1000) return 'week';
  if (createdAt >= now - 30 * 24 * 60 * 60 * 1000) return 'month';
  return 'earlier';
};

const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDateLabel = (ts: number): string => {
  const bucket = bucketFor(ts);
  if (bucket === 'today') return 'Today';
  const yesterdayStart = startOfToday() - 24 * 60 * 60 * 1000;
  if (ts >= yesterdayStart) return 'Yesterday';
  return new Date(ts).toLocaleDateString([], { month: 'short', day: '2-digit' });
};

// Short summary preview for each meeting card, generated from the actual
// stored transcript (null when the meeting has no conversation yet).
const meetingSummaryPreview = (m: Meeting): string | null => {
  const transcript = m.transcript || [];
  if (transcript.length === 0) return null;
  return buildSummaryFromTranscript(m, transcript)?.overview || null;
};

export const MeetingHistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { searchQuery } = useMeeting();
  const [userMeetings, setUserMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filterPeriod, setFilterPeriod] = useState<PeriodFilter>('1week');
  // Three-dots menu state (Share / Delete) per meeting row.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDeleteFor, setConfirmDeleteFor] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Phase 4: retrieve ONLY meetings actually saved for the authenticated user.
  useEffect(() => {
    let cancelled = false;
    async function fetchUserMeetings() {
      if (currentUser?.uid) {
        setIsLoading(true);
        const list = await getUserMeetings(currentUser.uid);
        if (!cancelled) {
          setUserMeetings([...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
          setIsLoading(false);
        }
      } else {
        setUserMeetings([]);
        setIsLoading(false);
      }
    }
    fetchUserMeetings();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.uid]);

  const matchesSearch = (m: Meeting): boolean => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (m.title || '').toLowerCase().includes(q) ||
      (m.topic || '').toLowerCase().includes(q) ||
      (m.platform || '').toLowerCase().includes(q)
    );
  };

  const matchesPeriod = (m: Meeting): boolean => {
    const ts = m.createdAt || 0;
    if (filterPeriod === 'custom') {
      if (customStartDate) {
        const start = new Date(customStartDate + 'T00:00:00').getTime();
        if (ts < start) return false;
      }
      if (customEndDate) {
        const end = new Date(customEndDate + 'T23:59:59.999').getTime();
        if (ts > end) return false;
      }
      return true;
    }
    const bucket = bucketFor(ts);
    if (filterPeriod === '1day') return bucket === 'today';
    if (filterPeriod === '1week') return bucket === 'today' || bucket === 'week';
    return bucket !== 'earlier';
  };


  // Close the three-dots menu when clicking anywhere outside of it.
  useEffect(() => {
    if (!menuFor) return;
    const closeMenu = () => {
      setMenuFor(null);
      setConfirmDeleteFor(null);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [menuFor]);

  const showActionToast = (message: string) => {
    setActionToast(message);
    window.setTimeout(() => setActionToast(null), 2200);
  };

  // Share: native share sheet when available, otherwise copy the meeting link.
  const handleShareMeeting = async (m: Meeting) => {
    const url = `${window.location.origin}/meeting/${m.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: m.title || m.topic || 'MEETX Meeting', url });
        return;
      } catch {
        // User cancelled the native share sheet.
      }
    }
    try {
      await navigator.clipboard?.writeText(url);
      showActionToast('Meeting link copied');
    } catch {
      showActionToast('Could not copy link');
    }
  };

  // Delete: removes the meeting from the local store + Firestore, then the list.
  const handleDeleteMeeting = async (m: Meeting) => {
    if (!currentUser?.uid) return;
    try {
      await deleteMeeting(m.id, currentUser.uid);
      setUserMeetings((prev) => prev.filter((x) => x.id !== m.id));
      showActionToast('Meeting deleted');
    } catch {
      showActionToast('Could not delete meeting');
    }
    setMenuFor(null);
    setConfirmDeleteFor(null);
  };
  const filteredMeetings = userMeetings.filter((m) => matchesSearch(m) && matchesPeriod(m));

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Meeting History</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Meetings you configured and saved, tied to your account.
          </p>
        </div>

        <button
          onClick={() => navigate('/home')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Meeting</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2">Filter:</span>
          {(
            [
              { id: '1day', label: '1 Day' },
              { id: '1week', label: '1 Week' },
              { id: '1month', label: '1 Month' },
              { id: 'custom', label: 'Custom Range' },
            ] as { id: PeriodFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterPeriod(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${filterPeriod === tab.id
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filterPeriod === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-700"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none text-slate-700"
            />
          </div>
        )}
      </div>

      {/* Meetings List (real saved meetings only — no placeholder records) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm divide-y divide-slate-100 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs text-slate-400 mt-2">Loading your meetings...</p>
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-700">
              {userMeetings.length === 0 ? 'No meetings saved yet' : 'No meetings found'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {userMeetings.length === 0
                ? 'Configure your first meeting on the home screen to get started.'
                : 'Try adjusting your search or filter range.'}
            </p>
            {userMeetings.length === 0 && (
              <button
                onClick={() => navigate('/home')}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Create Meeting</span>
              </button>
            )}
          </div>
        ) : (
          filteredMeetings.map((item) => {
            const summaryPreview = meetingSummaryPreview(item);
            return (
            <div
              key={item.id}
              onClick={() => navigate(`/meeting/${item.id}`)}
              className="p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50/80 transition-colors cursor-pointer group"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                      {item.title || item.topic || 'Untitled Meeting'}
                    </h3>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      {item.platform}
                    </span>
                    {item.status === 'live' && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                        Live
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                    {item.selectedLanguage && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="w-3 h-3 text-slate-400" />
                        {getLanguageDisplayName(item.selectedLanguage)}
                      </span>
                    )}
                    {(item.resources?.length || 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="w-3 h-3 text-slate-400" />
                        {item.resources?.length} resource{(item.resources?.length || 0) > 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                {summaryPreview ? (
                  <div className="mt-1.5 flex items-start gap-1.5 max-w-xl">
                    <FileText className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" />
                    <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">{summaryPreview}</p>
                  </div>
                ) : null}
                </div>
              </div>

              <div className="flex items-center gap-4 text-right">
              {/* Three-dots menu: Share / Delete */}
              <div className="relative" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    setMenuFor(menuFor === item.id ? null : item.id);
                    setConfirmDeleteFor(null);
                  }}
                  aria-label="Meeting options"
                  title="More options"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuFor === item.id && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg z-30 overflow-hidden text-left">
                    <button
                      onClick={() => {
                        setMenuFor(null);
                        void handleShareMeeting(item);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5 text-blue-500" />
                      Share
                    </button>
                    <div className="border-t border-slate-100" />
                    {confirmDeleteFor === item.id ? (
                      <div className="px-3 py-2.5 bg-rose-50">
                        <p className="text-[11px] font-semibold text-rose-600 mb-1.5">Delete permanently?</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => void handleDeleteMeeting(item)}
                            className="flex-1 px-2 py-1 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteFor(null)}
                            className="flex-1 px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[11px] font-semibold transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteFor(item.id)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
                <div>
                  <div className="text-xs font-semibold text-slate-700">{formatTime(item.createdAt || Date.now())}</div>
                  <div className="text-[11px] text-slate-400">{formatDateLabel(item.createdAt || Date.now())}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
            );
          })
        )}
      </div>
      {/* Action toast for Share / Delete feedback */}
      {actionToast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg">
          {actionToast}
        </div>
      )}
    </div>
  );
};
