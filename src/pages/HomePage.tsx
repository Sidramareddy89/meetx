import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  UploadCloud,
  Link as LinkIcon,
  ArrowRight,
  Play,
  Clock,
  ChevronRight, ShieldCheck,
  CheckCircle2,
  FileCheck,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useProfileGate } from '../hooks/useProfileGate';
import { useMeeting } from '../contexts/MeetingContext';
import { MeetingPlatform, MeetingResource } from '../types/meeting';
import { saveMeeting, uploadMeetingResourceFile, createMeetingId } from '../services/meetingService';

// Phase 4: resource validation limits
const MAX_FILE_SIZE_MB = 15;
const MAX_FILE_COUNT = 5;
const ALLOWED_FILE_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt'];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  useProfileGate();
  const { selectedLanguage, isDetectable, setIsDetectable, startMeetingSession, freeMeetingsLeft, isProUser } = useMeeting();

  const [platform, setPlatform] = useState<MeetingPlatform | null>(null);
  const [meetingLink, setMeetingLink] = useState('');
  const [topic, setTopic] = useState('');
  const [pastedNotes, setPastedNotes] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; size: string }[]>([]);
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState<'paste' | 'upload'>('paste');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  

  const platforms: { name: MeetingPlatform; icon: string; color: string }[] = [
    { name: 'Google Meet', icon: '🌐', color: 'border-emerald-200 hover:border-emerald-400' },
    { name: 'Zoom', icon: '📹', color: 'border-blue-200 hover:border-blue-400' },
    { name: 'Microsoft Teams', icon: '👥', color: 'border-indigo-200 hover:border-indigo-400' },
    { name: 'Webex', icon: '🟢', color: 'border-teal-200 hover:border-teal-400' },
    { name: 'Browser / Other', icon: '💻', color: 'border-slate-200 hover:border-slate-400' },
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      const accepted: File[] = [];
      const rejected: string[] = [];

      // Validate each file: extension, size
      for (const f of filesArray) {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        if (!ALLOWED_FILE_EXTENSIONS.includes(ext)) {
          rejected.push(`"${f.name}" is not supported (PDF, DOC, DOCX, TXT only).`);
          continue;
        }
        if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          rejected.push(`"${f.name}" exceeds the ${MAX_FILE_SIZE_MB}MB size limit.`);
          continue;
        }
        accepted.push(f);
      }

      // Validate total file count
      const slotsLeft = MAX_FILE_COUNT - rawFiles.length;
      if (accepted.length > slotsLeft) {
        rejected.push(`A maximum of ${MAX_FILE_COUNT} files can be attached (${rawFiles.length} already selected).`);
        accepted.length = Math.max(slotsLeft, 0);
      }

      if (rejected.length > 0) {
        setFileError(rejected.join(' '));
      }

      if (accepted.length > 0) {
        const newFiles = accepted.map((f) => ({
          name: f.name,
          size: (f.size / (1024 * 1024)).toFixed(2) + ' MB',
        }));
        setUploadedFiles((prev) => [...prev, ...newFiles]);
        setRawFiles((prev) => [...prev, ...accepted]);
      }

      e.target.value = '';
    }
  };

  const handleStartMeetX = () => {
    setValidationError(null);
    setFileError(null);

    // Validate required information
    if (!topic.trim()) {
      setValidationError('Please enter a Meeting Topic / Purpose to configure your assistant.');
      return;
    }

    if (!currentUser) {
      setValidationError('You must be signed in to start a meeting.');
      return;
    }

    const userId = currentUser?.uid || 'user-anonymous';
    // F2: ONE authoritative id for the whole lifecycle. It is created here and
    // passed to the live session, so the session state, the local record, the
    // Firestore document, the resource upload paths, every transcript flush and
    // the completion write all reference the same meeting.
    const meetingId = createMeetingId();

    // ACTIVATE THE FLOATING WIDGET IMMEDIATELY. No await, no save barrier:
    // the widget must open instantly and the backend task runs in the
    // background so the user never sees a "Saving…" spinner.
    const sessionLaunched = startMeetingSession({
      meetingId,
      userId,
      platform: 'Browser / Other',
      meetingLink: meetingLink.trim() || undefined,
      topic: topic.trim(),
      pastedNotes: pastedNotes.trim() || undefined,
      resources: rawFiles.map((f) => ({
        id: `file-${Date.now()}-${f.name}`,
        name: f.name,
        type: f.type || 'document',
        size: f.size,
        content: f.name,
      })), // Phase 4: background upload replaces with proper MeetingResource objects
    });

    if (!sessionLaunched) {
      setValidationError('Unable to start the meeting session. Please try again.');
      return;
    }

    // Fire-and-forget: upload resources + persist the meeting record.
    // Any failure is logged but cannot stall the live session.
    (async () => {
      try {
        const uploadedResources: MeetingResource[] = [];
        for (const file of rawFiles) {
          const resource = await uploadMeetingResourceFile(userId, meetingId, file);
          uploadedResources.push(resource);
        }

        await saveMeeting(
          userId,
          {
            title: topic.trim(),
            platform: 'Browser / Other',
            topic: topic.trim(),
            selectedLanguage: selectedLanguage.code, // Phase 9: the BCP-47 code the transcription engine uses
            pastedNotes: pastedNotes.trim() || undefined,
            resources: uploadedResources,
            status: 'live',
            transcript: [],
          },
          meetingId
        );
      } catch (err: any) {
        console.warn('Background meeting save failed (non-blocking):', err?.message || err);
      }
    })();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-12">
      {/* Top Banner / Announcement */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-50 via-indigo-50/50 to-white border border-blue-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Welcome to MEETX {currentUser?.displayName ? `, ${currentUser.displayName}` : ''}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-slate-500">
                Language: <span className="font-medium text-slate-700">{selectedLanguage.name}</span>
              </span>
              <span className="text-slate-300">•</span>
              <button
                type="button"
                onClick={() => setIsDetectable(!isDetectable)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                  !isDetectable
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
                title="Toggle Detectable vs Undetectable Mode"
              >
                {!isDetectable ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Mode: Undetectable (Private)</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-slate-500" />
                    <span>Mode: Detectable</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center sm:items-end gap-1">
          <button
            onClick={handleStartMeetX}
            className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md shadow-blue-600/20 hover:shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <>
              <Play className="w-4 h-4 fill-white" />
              <span>Start MEETX</span>
            </>
          </button>
          <span className="text-[11px] text-slate-500 font-medium">
            {isProUser ? 'Unlimited meetings (Pro Plan)' : `${freeMeetingsLeft} free meetings left`}
          </span>
        </div>
      </div>

      {/* Undetectable Mode Guidance & Limitation Box */}
      {!isDetectable && (
        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 text-xs text-emerald-950 space-y-2 animate-in fade-in duration-200 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>Undetectable Mode Active — Screen Sharing Guidance</span>
            </div>
            <span className="text-[10px] font-medium bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
              Private Sharing Supported
            </span>
          </div>
          <p className="text-slate-600 text-[11.5px] leading-relaxed">
            The assistant opens in a separate OS-level desktop window visible to you. To ensure meeting participants cannot see the assistant while you share your screen, follow this supported sharing rule:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 text-[11px]">
            <div className="p-2.5 rounded-xl bg-white border border-emerald-200 flex items-start gap-2 shadow-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-900">Supported Sharing (Invisible to Participants):</span>
                <p className="text-slate-600 mt-0.5">
                  When starting screen share in Zoom, Meet, or Teams, choose <strong>Browser Tab</strong> or <strong>Application Window</strong> (e.g. VS Code, Word, slides). The assistant window remains outside that capture boundary.
                </p>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-start gap-2 shadow-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-amber-900">Entire Screen Limitation (Visible to Participants):</span>
                <p className="text-amber-800 mt-0.5">
                  Selecting <strong>Entire Screen</strong> captures your whole desktop including the floating assistant. Never select Entire Screen if you want the assistant to remain private.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Section: Start or Join a Live Meeting */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-100 gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Start or Join a Live Meeting
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Configure your meeting platform, topic, and context before starting.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            AI Live Co-pilot Enabled
          </span>
        </div>

        {/* Validation Error Banner */}
        {validationError && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span className="font-medium">{validationError}</span>
          </div>
        )}

        <div className="mt-6 space-y-6">
          {/* SECTION 1: 1. Meeting Topic / Purpose */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              1. Meeting Topic / Purpose
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="e.g. Software Developer Interview, Architecture Review, Client Discovery"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-none transition-colors placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* SECTION 2: 2. Resume / Document Knowledge Base */}
          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
              2. Resume / Document Knowledge Base
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Attach your resume summary, talking points, or reference document for context.
            </p>

            {/* Toggle Tabs */}
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${activeTab === 'paste'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                Paste Resume / Notes
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${activeTab === 'upload'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                Upload File
              </button>
            </div>

            {activeTab === 'paste' ? (
              <div>
                <textarea
                  rows={4}
                  placeholder="Paste your resume summary, project details, key questions, or meeting agenda here..."
                  value={pastedNotes}
                  onChange={(e) => setPastedNotes(e.target.value)}
                  className="w-full p-3.5 text-sm bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl outline-none transition-colors placeholder:text-slate-400"
                />
              </div>
            ) : (
              <div>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center bg-slate-50/50 hover:bg-blue-50/30 hover:border-blue-300 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <UploadCloud className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    Click or drag files here to upload resume or briefing docs
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Supports PDF, DOC, DOCX, TXT • max 15MB per file • up to 5 files
                  </p>
                </div>

                {fileError && (
                  <div className="mt-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                    <span className="font-medium">{fileError}</span>
                  </div>
                )}
              </div>
            )}

            {uploadedFiles.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {uploadedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                    <span className="flex items-center gap-2 font-medium text-slate-700">
                      <FileCheck className="w-4 h-4 text-emerald-600" />
                      {file.name}
                    </span>
                    <span className="text-slate-400">{file.size}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Row */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Ready to start session with active configurations</span>
            </div>

            <button
              type="button"
              onClick={handleStartMeetX}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <>
                <span>Start MEETX</span>
                <ArrowRight className="w-4 h-4" />
              </>
            </button>
          </div>
        </div>
      </div>

      {/* Quick History Overview Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-800">
              Recent Meeting History
            </h3>
            <p className="text-[11px] text-slate-500">
              Review your past transcripts, structured summaries, and action points.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/history')}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline"
        >
          <span>View All History</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
