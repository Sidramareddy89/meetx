/**
 * MEETX — meeting display verification (History + Detail read the real store).
 *
 * Renders the REAL `MeetingHistoryPage` and `MeetingDetailPage` against records
 * that were persisted by the REAL `meetingService`, and asserts that what they
 * render comes from that stored data: real titles, real transcript lines, real
 * derived summary/points/actions, real duration/status/line counts, and honest
 * empty states for a meeting that has no conversation. Nothing may be a
 * hardcoded placeholder.
 *
 * Only the boundaries Node cannot provide are stubbed: `react` (hook runtime),
 * `react-router-dom`, `lucide-react` (icons), `./AuthContext`,
 * `../contexts/MeetingContext` (the page's session value is injected) and the
 * Firebase surface.
 *
 * Run it through the bundler harness:
 *   node tools/run-meeting-display.mjs
 */

import { __hookTest } from 'react';
import { MeetingHistoryPage } from '../src/pages/MeetingHistoryPage';
import { MeetingDetailPage } from '../src/pages/MeetingDetailPage';
import {
  saveMeeting,
  updateStoredMeeting,
  getMeetingById,
} from '../src/services/meetingService';
import {
  buildSummaryFromTranscript,
  buildLiveBrief,
} from '../src/services/meetingInsightService';

const USER_A = 'user-display-a';
const USER_B = 'user-display-b';

let passed = 0;
let failed = 0;
const report = [];

const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    report.push(`PASS  ${label}`);
  } else {
    failed += 1;
    report.push(`FAIL  ${label}${detail ? `  [${detail}]` : ''}`);
  }
};

const installStorage = () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
  localStorage.setItem('meetx_is_pro', 'true');
};

const entry = (id, text, seconds = 0) => ({
  id,
  speakerId: 'speaker-1',
  speakerName: 'Dana Reyes',
  text,
  timestamp: `00:${String(seconds).padStart(2, '0')}`,
});

/** Every piece of text a rendered element tree contains, in order. */
const collectText = (node, out = []) => {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (node && node.props) collectText(node.props.children, out);
  return out;
};
const textOf = (node) => collectText(node).join(' | ');

/**
 * Render a page component, let its real `useEffect` data load resolve, then
 * re-render so the loaded state is what we inspect.
 */
const renderLoadedPage = async (Component) => {
  __hookTest.render(() => Component());
  await new Promise((resolve) => setTimeout(resolve, 10));
  const element = __hookTest.render(() => Component());
  return textOf(element);
};

const noop = async () => {};
const sessionValue = () => ({
  isDetectable: false,
  setIsDetectable: () => {},
  selectedLanguage: { code: 'en-US', name: 'English (US)', nativeName: 'English (US)' },
  setSelectedLanguage: () => {},
  targetLanguage: { code: 'en-US', name: 'English (US)', nativeName: 'English (US)' },
  setTargetLanguage: () => {},
  translationEnabled: false,
  speakTranslations: false,
  setSpeakTranslations: () => {},
  activeMeeting: null,
  setActiveMeeting: () => {},
  searchQuery: '',
  setSearchQuery: () => {},
  isFloatingActive: false,
  setIsFloatingActive: () => {},
  isWidgetCollapsed: false,
  setIsWidgetCollapsed: () => {},
  answerCardSize: 'normal',
  setAnswerCardSize: () => {},
  increaseCardSize: () => {},
  decreaseCardSize: () => {},
  hideMeetxHidesWidget: false,
  setHideMeetxHidesWidget: () => {},
  isPlatformClosed: false,
  setIsPlatformClosed: () => {},
  freeMeetingsLeft: 3,
  isProUser: true,
  isPlanModalOpen: false,
  setIsPlanModalOpen: () => {},
  upgradeToPro: () => {},
  liveTranscript: [],
  currentMeetingTranscript: [],
  addTranscriptEntry: () => {},
  clearTranscript: () => {},
  liveBrief: null,
  checkedActions: new Set(),
  toggleActionCheck: () => {},
  assistantMessages: [],
  addAssistantMessage: () => {},
  clearAssistantMessages: () => {},
  sessionStartTime: Date.now(),
  startMeetingSession: () => true,
  stopMeetingSession: () => {},
  askAssistant: noop,
  isThinking: false,
});

const main = async () => {
  installStorage();
  globalThis.__meetxTestAuth = { currentUser: { uid: USER_A } };
  globalThis.__meetxTestMeeting = sessionValue();

  // ------------------------------------------ real persisted records
  const RICH = 'meet-display-rich';
  const EMPTY = 'meet-display-empty';
  const FOREIGN = 'meet-display-foreign';
  const LINES = [
    entry('d-1', 'Welcome everyone, we need to ship the beta by Friday.', 1),
    entry('d-2', 'Priya owns the pricing page refresh.', 2),
    entry('d-3', 'The ad budget is capped at twenty thousand dollars.', 3),
  ];
  const snapshot = (id, title, topic) => ({
    id,
    userId: USER_A,
    title,
    platform: 'Google Meet',
    topic,
    selectedLanguage: 'en-US',
    createdAt: Date.now(),
    resources: [],
    transcript: [],
  });

  await saveMeeting(
    USER_A,
    {
      title: 'Beta launch sync',
      platform: 'Google Meet',
      topic: 'Beta launch sync',
      selectedLanguage: 'en-US',
      pastedNotes: 'Agenda: launch date, owners, budget.',
      resources: [],
      transcript: [],
      status: 'live',
    },
    RICH
  );
  await updateStoredMeeting(
    RICH,
    USER_A,
    { transcript: LINES, status: 'live' },
    snapshot(RICH, 'Beta launch sync', 'Beta launch sync')
  );
  await updateStoredMeeting(RICH, USER_A, { status: 'completed', duration: '12m 34s' });

  await saveMeeting(
    USER_A,
    {
      title: 'Silent standup',
      platform: 'Browser / Other',
      topic: 'Silent standup',
      selectedLanguage: 'en-US',
      transcript: [],
      status: 'live',
    },
    EMPTY
  );
  await updateStoredMeeting(EMPTY, USER_A, { transcript: [], status: 'completed', duration: '0m 3s' });

  // Another user's meeting, in their own store only.
  await saveMeeting(
    USER_B,
    {
      title: 'User B confidential',
      platform: 'Browser / Other',
      topic: 'User B confidential',
      selectedLanguage: 'en-US',
      transcript: [entry('b-1', 'Private line for user B.', 1)],
      status: 'completed',
    },
    FOREIGN
  );
  await updateStoredMeeting(FOREIGN, USER_B, { status: 'completed', duration: '1m 1s' });

  // ----------------------------------------- MeetingHistoryPage
  report.push('--- MeetingHistoryPage (real saved records) ---');
  __hookTest.reset();
  const historyText = await renderLoadedPage(MeetingHistoryPage);
  check('history: shows the real saved meeting titles', historyText.includes('Beta launch sync') && historyText.includes('Silent standup'));
  check("history: never shows another user's meeting", !historyText.includes('User B confidential'));
  check('history: shows the real status of a completed meeting', historyText.includes('Completed'));
  check(
    'history: shows the real recorded duration',
    historyText.includes('12m 34s') && historyText.includes('0m 3s'),
    'duration missing'
  );
  check('history: shows real conversation availability (3 lines)', historyText.includes('3 lines'), 'line count missing');
  check('history: states honestly that the empty meeting has no conversation', historyText.includes('No conversation yet'));
  check(
    'history: shows a real date group',
    /Today|Yesterday|\b[A-Z][a-z]{2} \d{2}\b/.test(historyText),
    'no date label'
  );
  check('history: does not render the "no meetings" placeholder', !historyText.includes('No meetings saved yet'));

  // ----------------------------------------- MeetingDetailPage (real data)
  report.push('--- MeetingDetailPage (real saved record) ---');
  const storedRich = await getMeetingById(RICH, USER_A);
  const realSummary = buildSummaryFromTranscript(storedRich, storedRich.transcript);
  const realBrief = buildLiveBrief(storedRich.topic, storedRich.transcript);
  check('fixture: the record read back really has 3 lines', storedRich.transcript.length === 3);
  check('fixture: real insights are derived from it', !!realSummary && !!realBrief);

  globalThis.__meetxTestRouteId = RICH;
  __hookTest.reset();
  const detailText = await renderLoadedPage(MeetingDetailPage);
  check('detail: shows the real stored title', detailText.includes('Beta launch sync'));
  check(
    'detail: shows every stored transcript line',
    LINES.every((l) => detailText.includes(l.text)),
    'a stored line is missing'
  );
  check('detail: shows the speaker recorded on the line', detailText.includes('Dana Reyes'));
  check('detail: shows the real derived summary', detailText.includes(realSummary.overview), 'overview missing');
  check(
    'detail: shows the real key points',
    realSummary.keyPoints.every((k) => detailText.includes(k)),
    'a key point is missing'
  );
  check(
    'detail: shows the real action item',
    realBrief.actions.some((a) => detailText.includes(a.text)),
    'action missing'
  );
  check(
    'detail: shows the real deadline',
    realBrief.deadlines.some((d) => detailText.includes(d.text)),
    'deadline missing'
  );
  check(
    'detail: shows the real platform and pasted notes',
    detailText.includes('Google Meet') && detailText.includes('Agenda: launch date')
  );
  check(
    'detail: shows the real date of the meeting',
    detailText.includes(String(new Date(storedRich.createdAt).getFullYear())),
    'date missing'
  );
  check(
    'detail: does not claim there is no transcript',
    !detailText.includes('No transcript stored for this meeting yet.')
  );
  check("detail: never shows another user's content", !detailText.includes('Private line for user B'));

  // ----------------------------------------- MeetingDetailPage (empty record)
  report.push('--- MeetingDetailPage (meeting with no conversation) ---');
  globalThis.__meetxTestRouteId = EMPTY;
  __hookTest.reset();
  const emptyText = await renderLoadedPage(MeetingDetailPage);
  check('detail (empty): still shows the real stored meeting', emptyText.includes('Silent standup'));
  check('detail (empty): honest empty state for the transcript', emptyText.includes('No transcript stored for this meeting yet.'));
  check('detail (empty): honest empty state for the summary', emptyText.includes('No summary is available yet'));
  check('detail (empty): honest empty state for participants', emptyText.includes('No participants recorded yet.'));
  check('detail (empty): honest empty state for actions', emptyText.includes('No action items detected'));
  check(
    'detail (empty): no fabricated conversation is rendered',
    !emptyText.includes('ship the beta') && !emptyText.includes('Priya owns')
  );
  check(
    'detail (empty): it is not reported as broken/missing',
    !emptyText.includes('No saved meeting exists for this link')
  );

  // ----------------------------------------- MeetingDetailPage (user scoping)
  report.push("--- MeetingDetailPage (user scoping) ---");
  globalThis.__meetxTestRouteId = FOREIGN;
  __hookTest.reset();
  const foreignText = await renderLoadedPage(MeetingDetailPage);
  check(
    "detail (foreign): another user's meeting id is not readable",
    foreignText.includes('No saved meeting exists for this link'),
    foreignText.slice(0, 140)
  );
  check(
    "detail (foreign): none of its content is rendered",
    !foreignText.includes('Private line for user B') && !foreignText.includes('User B confidential')
  );

  globalThis.__meetxTestRouteId = 'meet-does-not-exist';
  __hookTest.reset();
  const missingText = await renderLoadedPage(MeetingDetailPage);
  check('detail (missing): an unknown id shows the honest empty state', missingText.includes('No saved meeting exists for this link'));

  console.log(report.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    failed === 0 ? 'RESULT: meeting display verified' : 'RESULT: meeting display FAILED'
  );
  if (failed > 0) process.exitCode = 1;
};

await main();
