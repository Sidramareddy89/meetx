import { Meeting, MeetingSummary, MeetingTranscriptEntry, getLanguageDisplayName } from '../types/meeting';

/**
 * Phase 8: derive structured insights from the ACTUAL stored transcript.
 * Nothing is invented: overview, key points and actions are extracted from
 * real transcript entries. When the transcript is empty, the summary is
 * null and the UI must show "not available yet" (never fake content).
 */

const ACTION_PATTERNS =
    /\b(action item|to-do|follow ?up|deadline|due|next step|we need to|i need to|you need to|we should|need to (do|deliver|send|update|test|fix)|will (be )?(sending|delivering|updating|following up))\b/i;

export function buildSummaryFromTranscript(
    meeting: Meeting,
    transcript: MeetingTranscriptEntry[]
): MeetingSummary | null {
    const entries = (transcript || []).filter((t: MeetingTranscriptEntry) => t && (t.text || '').trim().length > 0);

    if (entries.length === 0) {
        return null;
    }

    // ---- Key points: real remarks, evenly sampled up to 6 entries ----
    const MAX_POINTS = 6;
    let pointEntries: MeetingTranscriptEntry[];
    if (entries.length <= MAX_POINTS) {
        pointEntries = entries;
    } else {
        const step = (entries.length - 1) / (MAX_POINTS - 1);
        pointEntries = Array.from(
            { length: MAX_POINTS },
            (_, i) => entries[Math.round(i * step)]
        );
    }
    const keyPoints = pointEntries.map((e) => {
        const speaker = e.speakerName || e.speakerId || 'Speaker';
        const text = e.text.trim();
        const trimmed = text.length > 160 ? `${text.slice(0, 157)}...` : text;
        return `${speaker}: "${trimmed}"`;
    });

    // ---- Actions: only entries whose real content signals work items ----
    const actions = entries
        .filter((e) => ACTION_PATTERNS.test(e.text))
        .slice(0, 5)
        .map((e) => e.text.trim());

    // ---- Overview: factual description of the real conversation ----
    const speakers = Array.from(
        new Set(entries.map((e: MeetingTranscriptEntry) => e.speakerName || e.speakerId || 'Speaker'))
    );
    const firstAt = entries[0].timestamp || 'start';
    const lastAt = entries[entries.length - 1].timestamp || 'end';
    const languageLabel = getLanguageDisplayName(meeting.selectedLanguage);
    const overview = `Meeting "${meeting.topic || meeting.title || 'Untitled Meeting'}" on ${meeting.platform} (${languageLabel}) recorded ${entries.length} spoken remark${entries.length === 1 ? '' : 's'} between ${firstAt} and ${lastAt} with ${speakers.length} speaker${speakers.length === 1 ? '' : 's'} (${speakers.join(', ')}). This summary is generated directly from the recorded transcript.`;

    return {
        overview,
        keyPoints,
        actions,
    };
}

/**
 * Human-readable minutes built from the actual stored data — used by the
 * share controls. Includes only real content; sections with no data are
 * omitted entirely.
 */
export function buildShareableMinutes(
    meeting: Meeting,
    transcript: MeetingTranscriptEntry[]
): string {
    const lines: string[] = [];
    lines.push(`MEETX Meeting: ${meeting.title || meeting.topic || 'Untitled Meeting'}`);
    lines.push(`Platform: ${meeting.platform}`);
    lines.push(`Language: ${getLanguageDisplayName(meeting.selectedLanguage)}`);
    lines.push(`Date: ${new Date(meeting.createdAt).toLocaleString()}`);
    lines.push(`Status: ${meeting.status}`);
    if (meeting.meetingLink) lines.push(`Join link: ${meeting.meetingLink}`);

    const summary = buildSummaryFromTranscript(meeting, transcript || []);
    if (summary) {
        lines.push('', 'Summary:');
        if (summary.overview) lines.push(summary.overview);
        if (summary.keyPoints?.length) {
            lines.push('', 'Key points:');
            summary.keyPoints.forEach((p) => lines.push(`  • ${p}`));
        }
        if (summary.actions?.length) {
            lines.push('', 'Actions:');
            summary.actions.forEach((a) => lines.push(`  • ${a}`));
        }
    } else {
        lines.push('', 'Transcript: no recorded remarks yet.');
    }

    return lines.join('\n');
}


/**
 * F4: assemble the transcript context for the CURRENT meeting by combining the
 * conversation already persisted on that meeting record with the remarks
 * captured in the live session.
 *
 * A resumed / past meeting keeps its conversation on the meeting record while
 * the live session starts empty and only holds newly captured lines, so the
 * assistant needs both. Entries are merged in chronological order (persisted
 * first) and deduplicated by their existing `id` — a remark captured twice
 * keeps its newest version instead of appearing again. Nothing is invented:
 * with no entries on either side the result is an empty array.
 *
 * This is only ever called with the transcript of ONE meeting (the currently
 * selected/resumed one), so no other meeting can contribute context.
 */
export function mergeTranscriptEntriesById(
  base: MeetingTranscriptEntry[] | undefined,
  incoming: MeetingTranscriptEntry[] | undefined
): MeetingTranscriptEntry[] {
  const merged: MeetingTranscriptEntry[] = [];
  const indexById = new Map<string, number>();
  // Base ids a completed translation has already taken over.
  const superseded = new Set<string>();

  const add = (entry: MeetingTranscriptEntry): void => {
    if (!entry || !(entry.text || '').trim()) return;
    const id = entry.id;
    const isTranslated = id.endsWith('-t') && id.length > 2;
    const targetId = isTranslated ? id.slice(0, -2) : id;

    if (isTranslated && superseded.has(targetId)) {
      // A newer translation of an already-translated line: replace in place.
      const at = indexById.get(id);
      if (at !== undefined) merged[at] = entry;
      return;
    }
    if (isTranslated) {
      // A completed translation takes the place of the untranslated line it
      // replaces, so one remark can never be stored/displayed twice.
      const at = indexById.get(targetId);
      superseded.add(targetId);
      indexById.set(id, at === undefined ? merged.length : at);
      if (at === undefined) merged.push(entry);
      else merged[at] = entry;
      return;
    }
    const at = indexById.get(id);
    if (at === undefined) {
      indexById.set(id, merged.length);
      merged.push(entry);
    } else {
      merged[at] = entry;
    }
  };

  for (const entry of base || []) add(entry);
  for (const entry of incoming || []) add(entry);
  return merged;
}

export function buildMeetingTranscriptContext(
  persistedTranscript: MeetingTranscriptEntry[] | undefined,
  liveTranscript: MeetingTranscriptEntry[] | undefined
): MeetingTranscriptEntry[] {
  // PERSISTENCE + DISPLAY + ASSISTANT CONTEXT all merge through the single
  // rule above, so the conversation a meeting stores, the conversation the
  // user sees live and the conversation the assistant reads can never diverge.
  return mergeTranscriptEntriesById(persistedTranscript, liveTranscript);
}

// ---- Real-time conversation intelligence (all derived from actual speech) ----
export interface ConversationActionItem {
  id: string;
  text: string;
  assignee?: string;
  dueDate?: string;
  done: boolean;
}

export interface ConversationDeadline {
  id: string;
  text: string;
  date?: string;
}

export interface LiveBrief {
  title: string;
  summary: string;
  keyPoints: string[];
  actions: ConversationActionItem[];
  deadlines: ConversationDeadline[];
  reminders: string[];
  updatedAt: number;
}

const ACTION_VERBS =
  /\b(will|shall|must|need to|needs to|should|going to|action item|to-?do|follow ?up|send|share|deliver|submit|prepare|schedule|call|email|review|update|fix|test|deploy|deadline|due|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|eod|end of (day|week))|\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?)\b/i;
const QUESTION_RE = /\?\s*$/;
const NAME_PREFIX = /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[:\-–]\s*(.+)$/;

/** Split transcript lines into per-speaker turns, detecting "Name: ..." prefixes. */
export interface SpeakerTurn {
  speaker: string;
  lines: MeetingTranscriptEntry[];
  lastAt: string;
}

export function groupTranscriptBySpeaker(
  transcript: MeetingTranscriptEntry[]
): SpeakerTurn[] {
  const groups: SpeakerTurn[] = [];
  for (const entry of transcript) {
    let speaker = entry.speakerName || entry.speakerId || 'Speaker';
    let text = entry.translatedText && entry.translatedText !== '…translating…'
      ? entry.translatedText
      : entry.text;
    const m = text.match(NAME_PREFIX);
    if (m) {
      speaker = m[1];
      text = m[2];
    }
    const last = groups[groups.length - 1];
    if (last && last.speaker === speaker) {
      last.lines.push({ ...entry, text });
      last.lastAt = entry.timestamp;
    } else {
      groups.push({ speaker, lines: [{ ...entry, text }], lastAt: entry.timestamp });
    }
  }
  return groups;
}

const extractAssignee = (text: string): string | undefined => {
  const m = text.match(/\b([A-Z][a-z]+)\s+(will|shall|should|must|needs?\s+to|is\s+going\s+to)\b/);
  return m ? m[1] : undefined;
};

const extractDueDate = (text: string): string | undefined => {
  const m = text.match(
    /\b(by|due|before|deadline:?)\s+([A-Z][a-z]+day|tomorrow|today|next week|EOD|end of (day|week)|\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?)/i
  );
  return m ? m[0] : undefined;
};

const STOPWORDS = new Set(
  'the,a,an,and,or,but,is,are,was,were,be,been,to,of,in,on,for,with,that,this,it,as,at,by,we,you,they,he,she,i,my,our,your,his,her,its,so,do,does,did,have,has,had,will,shall,can,could,should,would,what,when,where,who,how,why,not,no,yes,yeah,okay,ok,um,uh,like,just,very,really,also,well,now,then,there,here,from,about,into,over,after,before,me,him,us,them,all,any,each,more,most,some,such,only,own,same,than,too'.split(',')
);

function extractKeywords(text: string): string[] {
  const freq = new Map<string, number>();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (raw.length < 4 || STOPWORDS.has(raw)) continue;
    freq.set(raw, (freq.get(raw) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

/** Build a live brief (title/summary/actions/deadlines/reminders) from real transcript lines. */
export function buildLiveBrief(
  topic: string,
  transcript: MeetingTranscriptEntry[]
): LiveBrief | null {
  const entries = (transcript || []).filter((t: MeetingTranscriptEntry) => t && (t.text || '').trim());
  if (entries.length === 0) return null;

  const speakers = Array.from(
    new Set(entries.map((e: MeetingTranscriptEntry) => e.speakerName || e.speakerId || 'Speaker'))
  );
  const lastLineTexts = entries.slice(-5).map((e) => e.text.trim());
  const keywords = extractKeywords(entries.map((e: MeetingTranscriptEntry) => e.text).join(' '));

  const title =
    topic && topic !== 'Active Meeting'
      ? topic
      : keywords.length > 0
        ? 'Meeting: ' + keywords.slice(0, 4).join(', ')
        : 'Live meeting \u2014 ' + entries.length + ' remarks';

  const lastLine = lastLineTexts[lastLineTexts.length - 1];
  const summary =
    entries.length + ' remark' + (entries.length === 1 ? '' : 's') + ' from ' + speakers.length + ' speaker' + (speakers.length === 1 ? '' : 's') +
    ' (' + speakers.join(', ') + '). Latest: "' + lastLine.slice(0, 140) + (lastLine.length > 140 ? '\u2026' : '') + '"';

  const keyPoints = entries.slice(-6).map((e: MeetingTranscriptEntry) => e.text.trim().slice(0, 180));

  const actions: ConversationActionItem[] = [];
  const deadlines: ConversationDeadline[] = [];
  for (const e of entries) {
    if (!ACTION_VERBS.test(e.text)) continue;
    const text = e.text.trim().slice(0, 220);
    const due = extractDueDate(e.text);
    actions.push({
      id: e.id + '-action',
      text,
      assignee: extractAssignee(e.text),
      dueDate: due,
      done: false,
    });
    if (due && deadlines.length < 8) {
      deadlines.push({ id: e.id + '-due', text, date: due });
    }
    if (actions.length >= 10) break;
  }

  const questions = entries.filter((e: MeetingTranscriptEntry) => QUESTION_RE.test(e.text.trim())).slice(-3);
  const reminders = [
    ...deadlines.slice(0, 3).map((d) => '\u23F0 Reminder: ' + d.date + ' \u2014 ' + d.text.slice(0, 100)),
    ...questions.map((q: MeetingTranscriptEntry) => '\u2753 Open question: "' + q.text.trim().slice(0, 110) + '"'),
  ].slice(0, 6);

  return {
    title,
    summary,
    keyPoints,
    actions: actions.slice(0, 10),
    deadlines,
    reminders,
    updatedAt: Date.now(),
  };
}
