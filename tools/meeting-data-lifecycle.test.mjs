/**
 * MEETX — meeting data lifecycle verification (transcript → persistence →
 * history → detail).
 *
 * Runs the REAL `MeetingProvider` (via tools/react-hook-shim.mjs) with the REAL
 * meetingService and the REAL meetingInsightService. Only boundaries Node cannot
 * provide are stubbed: `react` (hook runtime), `./AuthContext` and the Firebase
 * surface (an in-memory document store that records every write, so the exact
 * Firestore document the app would produce is asserted).
 *
 * Cases:
 *   1 NEW MEETING   3 entries captured -> live -> persisted -> reload -> 3
 *   2 RESUMED       stored 3 + new 2 -> stored 5 (never 2, never 0)
 *   3 MULTIPLE      A(3) and B(2) stay separate; another user's never leaks
 *   4 EMPTY         start/stop with no speech = valid completed, nothing invented
 *   5 REFRESH       pending debounce is flushed on pagehide/reload
 *   6 FIRESTORE     the Firestore document really carries transcript + completed
 *
 * Run it through the bundler harness:
 *   node tools/run-meeting-data-lifecycle.mjs
 */

import { __hookTest } from 'react';
import { MeetingProvider } from '../src/contexts/MeetingContext';
import {
  saveMeeting,
  getMeetingById,
  getUserMeetings,
  updateStoredMeeting,
} from '../src/services/meetingService';
import {
  buildSummaryFromTranscript,
  buildLiveBrief,
  mergeTranscriptEntriesById,
} from '../src/services/meetingInsightService';

const USER_A = 'user-lifecycle-a';
const USER_B = 'user-lifecycle-b';

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

// ------------------------------------------------------------------- shims
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
  // Pro plan so the 3-meeting free quota never blocks the scenarios.
  localStorage.setItem('meetx_is_pro', 'true');
};

const windowHandlers = new Map();
const installWindow = () => {
  globalThis.window = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    addEventListener: (type, fn) => {
      if (!windowHandlers.has(type)) windowHandlers.set(type, []);
      windowHandlers.get(type).push(fn);
    },
    removeEventListener: (type, fn) => {
      const list = windowHandlers.get(type) || [];
      const at = list.indexOf(fn);
      if (at !== -1) list.splice(at, 1);
    },
  };
};

/** Dispatch a real browser event the app listens for (pagehide / beforeunload). */
const fireEvent = (type) => {
  for (const handler of (windowHandlers.get(type) || []).slice()) handler();
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tick = () => sleep(0);

// --------------------------------------------------------------- utilities
const mountProvider = () => {
  const element = __hookTest.render(() => MeetingProvider({ children: null }));
  return element && element.props ? element.props.value : null;
};
/** Simulate a browser refresh: all React state is thrown away. */
const simulateReload = () => __hookTest.reset();

const keyFor = (uid) => `meetx_meetings_${uid}`;
const readStore = (uid) => JSON.parse(localStorage.getItem(keyFor(uid)) || '[]');
const storedLocal = (uid, id) => readStore(uid).find((m) => m.id === id);
const idsOf = (meeting) => (meeting?.transcript || []).map((e) => e.id);
const listKeys = () => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
  return keys.sort();
};

const entry = (id, text, seconds = 0) => ({
  id,
  speakerId: 'speaker-1',
  speakerName: 'Dana',
  text,
  timestamp: `00:${String(seconds).padStart(2, '0')}`,
});

const fsCalls = () => globalThis.__meetxCalls || [];
const fsDoc = (path) => (globalThis.__meetxFs || new Map()).get(path);
const fsWrites = (path) => fsCalls().filter((c) => c.fn === 'setDoc' && c.path === path);

const startNewMeeting = (id, topic) => {
  let ctx = mountProvider();
  const started = ctx.startMeetingSession({
    meetingId: id,
    userId: USER_A,
    platform: 'Browser / Other',
    topic,
    meetingLink: '',
    selectedLanguage: 'en-US',
  });
  return { ctx: mountProvider(), started };
};

const resumeMeeting = async (id) => {
  const loaded = await getMeetingById(id, USER_A);
  let ctx = mountProvider();
  ctx.startMeetingSession({ meeting: loaded, userId: USER_A });
  return { ctx: mountProvider(), loaded };
};

const addLines = (ctx, lines) => {
  let next = ctx;
  for (const line of lines) {
    next.addTranscriptEntry(line);
    next = mountProvider();
  }
  return next;
};

const durationSeconds = (value) => {
  const m = /(\d+)\s*m\s*(\d+)\s*s/.exec(value || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};


// ================================================================= main
const main = async () => {
  installStorage();
  installWindow();
  globalThis.__meetxTestAuth = { currentUser: { uid: USER_A } };

  // ------------------------------------------------------------- CASE 1
  report.push('--- CASE 1: new meeting ---');
  const A1 = 'meet-case1-a';
  let { ctx, started } = startNewMeeting(A1, 'Quarterly planning');
  check('case 1: session starts', started === true);
  check('case 1: the session owns the authoritative meeting id', ctx.activeMeeting?.id === A1);

  ctx = addLines(ctx, [
    entry('a-1', 'Welcome everyone, let us start the quarterly planning.', 1),
    entry('a-2', 'We shipped the beta in March as planned.', 2),
    entry('a-3', 'Priya owns the pricing page refresh.', 3),
  ]);
  check(
    'case 1: the 3 lines appear in the live conversation immediately',
    ctx.liveTranscript.length === 3 && ctx.currentMeetingTranscript.length === 3,
    `live=${ctx.liveTranscript.length}`
  );
  check(
    'case 1: the live conversation shows exactly this meeting',
    ctx.currentMeetingTranscript.map((e) => e.id).join(',') === 'a-1,a-2,a-3'
  );

  // The conversation is continuously persisted (here: the pagehide flush stands
  // in for the debounce, which is exercised in case 2 and case 5).
  fireEvent('pagehide');
  check(
    'case 1: the captured lines are already persisted during the session',
    idsOf(storedLocal(USER_A, A1)).join(',') === 'a-1,a-2,a-3',
    `ids=${idsOf(storedLocal(USER_A, A1)).join(',')}`
  );

  // The HomePage background save always carries transcript: [] and can land
  // AFTER the conversation was already flushed.
  await saveMeeting(
    USER_A,
    {
      title: 'Quarterly planning',
      platform: 'Browser / Other',
      topic: 'Quarterly planning',
      selectedLanguage: 'en-US',
      transcript: [],
      status: 'completed',
    },
    A1
  );
  check(
    'case 1: a late empty initial save cannot blank the captured lines',
    idsOf(storedLocal(USER_A, A1)).join(',') === 'a-1,a-2,a-3',
    `ids=${idsOf(storedLocal(USER_A, A1)).join(',')}`
  );

  ctx = mountProvider();
  ctx.stopMeetingSession();
  await tick();
  const stoppedA1 = storedLocal(USER_A, A1);
  check(
    'case 1: stop keeps all 3 lines in the stored record',
    idsOf(stoppedA1).join(',') === 'a-1,a-2,a-3',
    `ids=${idsOf(stoppedA1).join(',')}`
  );
  check('case 1: stop sets status completed', stoppedA1?.status === 'completed', stoppedA1?.status);
  check(
    'case 1: stop saves a real duration',
    durationSeconds(stoppedA1?.duration) >= 0,
    `duration=${stoppedA1?.duration}`
  );
  check(
    'case 1: stop preserves the meeting metadata',
    stoppedA1?.title === 'Quarterly planning' && stoppedA1?.topic === 'Quarterly planning'
  );

  simulateReload();
  const reopenedA1 = await getMeetingById(A1, USER_A);
  check(
    'case 1: after reload the meeting still has its 3 lines',
    idsOf(reopenedA1).join(',') === 'a-1,a-2,a-3',
    `ids=${idsOf(reopenedA1).join(',')}`
  );
  check(
    'case 1: the reopened meeting is completed and has a duration',
    reopenedA1?.status === 'completed' && !!reopenedA1?.duration
  );

  // ---------------------------------- stored insights (not empty sections)
  const insights = reopenedA1?.summary;
  check('case 1: the stored record carries a summary (it used to be undefined)', !!insights, `summary=${JSON.stringify(insights)}`);
  check('case 1: the stored summary has a real overview', !!(insights && insights.overview && insights.overview.includes('Quarterly planning')), `overview=${insights && insights.overview ? insights.overview.slice(0, 60) : 'none'}`);
  check(
    'case 1: key points are stored',
    !!(insights && insights.keyPoints && insights.keyPoints.length > 0),
    `keyPoints=${insights && insights.keyPoints ? insights.keyPoints.length : 0}`
  );
  check(
    'case 1: tasks/actions are stored (this conversation states no task, so the list is empty - never invented)',
    !!(insights && Array.isArray(insights.actions)),
    `actions=${insights && insights.actions ? insights.actions.length : 'missing'}`
  );
  check(
    'case 1: the stored insights come from the real spoken lines',
    JSON.stringify(insights || {}).includes('beta in March') || JSON.stringify(insights || {}).includes('pricing page')
  );
  check(
    'case 1: deadlines is a stored array (empty here - nothing was said about one)',
    !!(insights && Array.isArray(insights.deadlines)),
    `deadlines=${insights && insights.deadlines}`
  );
  check('case 1: the insights record when they were derived', !!(insights && typeof insights.updatedAt === 'number'));

  // A meeting with a real deadline must have it stored, not just derived at view time.
  simulateReload();
  let withDeadline = startNewMeeting('meet-insights-deadline', 'Launch sync');
  withDeadline.ctx = addLines(withDeadline.ctx, [
    entry('dl-1', 'We need to ship the beta by Friday.', 1),
    entry('dl-2', 'Legal review is due next Friday.', 2),
  ]);
  fireEvent('pagehide');
  await tick();
  const deadlineRecord = storedLocal(USER_A, 'meet-insights-deadline');
  check(
    'a spoken deadline is stored on the record',
    !!(deadlineRecord?.summary?.deadlines && deadlineRecord.summary.deadlines.length > 0),
    `deadlines=${JSON.stringify(deadlineRecord?.summary?.deadlines)}`
  );
  check(
    'a spoken action item is stored on the record',
    !!(deadlineRecord?.summary?.actions && deadlineRecord.summary.actions.length > 0),
    `actions=${JSON.stringify(deadlineRecord?.summary?.actions)}`
  );
  withDeadline.ctx = mountProvider();
  withDeadline.ctx.stopMeetingSession();
  await tick();

  // ------------------------------------------------------------- CASE 2
  report.push('--- CASE 2: resumed meeting ---');
  simulateReload();
  let resumed = await resumeMeeting(A1);
  check('case 2: the resumed session starts with an empty live state', resumed.ctx.liveTranscript.length === 0);
  check(
    'case 2: the resumed session already shows the stored conversation',
    resumed.ctx.currentMeetingTranscript.map((e) => e.id).join(',') === 'a-1,a-2,a-3',
    `ids=${resumed.ctx.currentMeetingTranscript.map((e) => e.id).join(',')}`
  );

  // THE AUDITED BUG: this first debounced flush used to write only the new line.
  resumed.ctx = addLines(resumed.ctx, [entry('a-4', 'Legal review is due next Friday.', 4)]);
  await sleep(1400); // let the real 1.2 s debounce fire
  check(
    'case 2: the debounced flush keeps A1..A3 and appends A4 (never [A4])',
    idsOf(storedLocal(USER_A, A1)).join(',') === 'a-1,a-2,a-3,a-4',
    `ids=${idsOf(storedLocal(USER_A, A1)).join(',')}`
  );

  resumed.ctx = addLines(resumed.ctx, [entry('a-5', 'Ad budget is capped at twenty thousand.', 5)]);
  resumed.ctx = mountProvider();
  resumed.ctx.stopMeetingSession();
  await tick();
  const afterResumeStop = storedLocal(USER_A, A1);
  check(
    'case 2: stopping the resume stores all 5 lines in order',
    idsOf(afterResumeStop).join(',') === 'a-1,a-2,a-3,a-4,a-5',
    `ids=${idsOf(afterResumeStop).join(',')}`
  );
  check('case 2: the resumed meeting is completed', afterResumeStop?.status === 'completed');
  check(
    'case 2: duration accumulates instead of being reset',
    durationSeconds(afterResumeStop?.duration) >= durationSeconds(stoppedA1?.duration),
    `${stoppedA1?.duration} -> ${afterResumeStop?.duration}`
  );

  // A resume that captures NOTHING must not wipe the stored conversation.
  simulateReload();
  let silentResume = await resumeMeeting(A1);
  silentResume.ctx = mountProvider();
  silentResume.ctx.stopMeetingSession();
  await tick();
  check(
    'case 2: stopping a resume with no new speech keeps the 5 stored lines',
    idsOf(storedLocal(USER_A, A1)).join(',') === 'a-1,a-2,a-3,a-4,a-5',
    `ids=${idsOf(storedLocal(USER_A, A1)).join(',')}`
  );

  simulateReload();
  const reopenedA2 = await getMeetingById(A1, USER_A);
  check(
    'case 2: after reload the resumed meeting has all 5 lines',
    idsOf(reopenedA2).join(',') === 'a-1,a-2,a-3,a-4,a-5',
    `ids=${idsOf(reopenedA2).join(',')}`
  );


  // ------------------------------------------------------------- CASE 3
  report.push('--- CASE 3: multiple meetings ---');
  const A3 = 'meet-case3-a';
  const B3 = 'meet-case3-b';
  simulateReload();
  let multi = startNewMeeting(A3, 'Design review');
  multi.ctx = addLines(multi.ctx, [
    entry('ma-1', 'The mockups are ready for review.', 1),
    entry('ma-2', 'We will iterate on the empty states.', 2),
    entry('ma-3', 'Ship the dark theme next sprint.', 3),
  ]);
  multi.ctx = mountProvider();
  multi.ctx.stopMeetingSession();
  await tick();

  simulateReload();
  let other = startNewMeeting(B3, 'Vendor call');
  other.ctx = addLines(other.ctx, [
    entry('mb-1', 'The vendor quoted nine thousand.', 1),
    entry('mb-2', 'They can deliver in two weeks.', 2),
  ]);
  other.ctx = mountProvider();
  other.ctx.stopMeetingSession();
  await tick();

  simulateReload();
  const openA = await getMeetingById(A3, USER_A);
  const openB = await getMeetingById(B3, USER_A);
  check(
    "case 3: meeting A returns only A's conversation",
    idsOf(openA).join(',') === 'ma-1,ma-2,ma-3',
    `ids=${idsOf(openA).join(',')}`
  );
  check(
    "case 3: meeting B returns only B's conversation",
    idsOf(openB).join(',') === 'mb-1,mb-2',
    `ids=${idsOf(openB).join(',')}`
  );
  check(
    'case 3: no cross-meeting leakage in either record',
    !idsOf(openA).some((id) => id.startsWith('mb-')) &&
      !idsOf(openB).some((id) => id.startsWith('ma-'))
  );

  const historyList = await getUserMeetings(USER_A);
  const historyIds = historyList.map((m) => m.id);
  check(
    'case 3: history lists every meeting of this user, with its transcript',
    historyIds.includes(A1) && historyIds.includes(A3) && historyIds.includes(B3) &&
      (historyList.find((m) => m.id === A1)?.transcript || []).length === 5,
    `history=${historyIds.join(',')}`
  );
  check(
    'case 3: history rows carry real status / date data',
    historyList.every((m) => typeof m.status === 'string' && typeof m.createdAt === 'number')
  );

  // The live view of a resumed meeting must never contain another meeting's lines.
  simulateReload();
  let liveA = await resumeMeeting(A3);
  liveA.ctx = addLines(liveA.ctx, [entry('ma-4', 'One more comment on the pricing page.', 4)]);
  check(
    "case 3: the live conversation of A stays inside A",
    liveA.ctx.currentMeetingTranscript.map((e) => e.id).join(',') === 'ma-1,ma-2,ma-3,ma-4',
    `ids=${liveA.ctx.currentMeetingTranscript.map((e) => e.id).join(',')}`
  );
  liveA.ctx = mountProvider();
  liveA.ctx.stopMeetingSession();
  await tick();
  check(
    'case 3: stopping A still leaves B untouched',
    idsOf(storedLocal(USER_A, B3)).join(',') === 'mb-1,mb-2'
  );

  // Authenticated-user scoping.
  const FOREIGN = 'meet-case3-foreign';
  globalThis.__meetxTestAuth = { currentUser: { uid: USER_B } };
  await saveMeeting(
    USER_B,
    {
      title: 'Private 1:1',
      platform: 'Browser / Other',
      topic: 'Private 1:1',
      selectedLanguage: 'en-US',
      transcript: [entry('ub-1', 'Confidential feedback for user B only.', 1)],
      status: 'completed',
    },
    FOREIGN
  );
  check(
    "case 3: another user's meeting never appears in this user's history",
    !(await getUserMeetings(USER_A)).some((m) => m.id === FOREIGN)
  );
  check(
    "case 3: another user's meeting cannot be opened by id",
    (await getMeetingById(FOREIGN, USER_A)) === null
  );
  check(
    'case 3: the owner still sees their own meeting',
    idsOf(await getMeetingById(FOREIGN, USER_B)).join(',') === 'ub-1'
  );
  globalThis.__meetxTestAuth = { currentUser: { uid: USER_A } };

  // ------------------------------------------------------------- CASE 4
  report.push('--- CASE 4: empty meeting ---');
  const E4 = 'meet-case4-empty';
  simulateReload();
  let empty = startNewMeeting(E4, 'Silent standup');
  empty.ctx = mountProvider();
  empty.ctx.stopMeetingSession();
  await tick();
  const emptyRecord = storedLocal(USER_A, E4);
  check('case 4: a meeting with no conversation is still stored', !!emptyRecord);
  check('case 4: it is a valid completed meeting', emptyRecord?.status === 'completed', emptyRecord?.status);
  check('case 4: it has an empty transcript (nothing fabricated)', (emptyRecord?.transcript || []).length === 0);
  check(
    'case 4: it keeps its title and a duration',
    emptyRecord?.title === 'Silent standup' && durationSeconds(emptyRecord?.duration) >= 0,
    `duration=${emptyRecord?.duration}`
  );

  simulateReload();
  const reopenedEmpty = await getMeetingById(E4, USER_A);
  check(
    'case 4: the empty meeting reopens as a real record',
    reopenedEmpty?.id === E4 && reopenedEmpty?.status === 'completed'
  );
  check(
    'case 4: no summary is invented (detail page shows its honest empty state)',
    buildSummaryFromTranscript(reopenedEmpty, reopenedEmpty.transcript) === null
  );
  check(
    'case 4: no brief is invented',
    buildLiveBrief(reopenedEmpty.topic, reopenedEmpty.transcript) === null
  );
  check(
    'case 4: a real meeting DOES produce real insights from its stored lines',
    (buildSummaryFromTranscript(reopenedA1, reopenedA1.transcript)?.keyPoints || []).length > 0 &&
      buildLiveBrief(reopenedA1.topic, reopenedA1.transcript) !== null
  );


  // ------------------------------------------------------------- CASE 5
  report.push('--- CASE 5: refresh during an active meeting ---');
  const R5 = 'meet-case5-refresh';
  simulateReload();
  let refreshing = startNewMeeting(R5, 'Refresh test');
  refreshing.ctx = addLines(refreshing.ctx, [
    entry('r-1', 'First remark before the refresh.', 1),
    entry('r-2', 'Second remark before the refresh.', 2),
  ]);
  // No debounce wait: the page is hidden / reloaded right now.
  fireEvent('pagehide');
  const afterPagehide = storedLocal(USER_A, R5);
  check(
    'case 5: pagehide flushes the pending transcript immediately',
    idsOf(afterPagehide).join(',') === 'r-1,r-2',
    `ids=${idsOf(afterPagehide).join(',')}`
  );
  check(
    'case 5: the record is still live before the stop',
    afterPagehide?.status === 'live',
    afterPagehide?.status
  );

  simulateReload();
  const afterReload = await getMeetingById(R5, USER_A);
  check(
    'case 5: a reload recovers the in-progress meeting data',
    idsOf(afterReload).join(',') === 'r-1,r-2' && afterReload?.status === 'live',
    `ids=${idsOf(afterReload).join(',')}`
  );

  // The continuous (debounced) persistence path as well.
  simulateReload();
  let debounced = await resumeMeeting(R5);
  debounced.ctx = addLines(debounced.ctx, [entry('r-3', 'Third remark after resuming.', 3)]);
  await sleep(1400);
  check(
    'case 5: the debounced flush appends to the recovered transcript',
    idsOf(storedLocal(USER_A, R5)).join(',') === 'r-1,r-2,r-3',
    `ids=${idsOf(storedLocal(USER_A, R5)).join(',')}`
  );
  debounced.ctx = mountProvider();
  debounced.ctx.stopMeetingSession();
  await tick();
  check(
    'case 5: the completed meeting keeps all 3 lines',
    idsOf(storedLocal(USER_A, R5)).join(',') === 'r-1,r-2,r-3' &&
      storedLocal(USER_A, R5)?.status === 'completed'
  );

  // A pagehide after the stop must not duplicate or drop anything.
  fireEvent('pagehide');
  await tick();
  check(
    'case 5: pagehide after stop does not duplicate or drop lines',
    idsOf(storedLocal(USER_A, R5)).join(',') === 'r-1,r-2,r-3'
  );

  // ------------------------------------------------------------- CASE 6
  report.push('--- CASE 6: Firestore ---');
  globalThis.__firebaseConfigured = true;
  const F6 = 'meet-case6-firestore';
  simulateReload();
  let cloud = startNewMeeting(F6, 'Cloud meeting');
  cloud.ctx = addLines(cloud.ctx, [
    entry('f-1', 'We agreed to ship on Friday.', 1),
    entry('f-2', 'Ana will write the release notes.', 2),
    entry('f-3', 'Budget approval lands next week.', 3),
  ]);
  await sleep(1400);
  cloud.ctx = mountProvider();
  cloud.ctx.stopMeetingSession();
  await tick();

  const fsPath = `meetings/${F6}`;
  const writes = fsWrites(fsPath);
  check('case 6: the meeting document was written to Firestore', writes.length > 0, `writes=${writes.length}`);
  const flushWrite = writes.find(
    (w) => Array.isArray(w.data.transcript) && w.data.status === 'live'
  );
  check(
    'case 6: a live flush carried all 3 lines with merge:true',
    !!flushWrite && flushWrite.merge === true && flushWrite.data.transcript.length === 3,
    `transcript=${flushWrite ? flushWrite.data.transcript.length : 'none'}`
  );
  const completionWrite = writes.find((w) => w.data.status === 'completed');
  check(
    'case 6: the completion write carried transcript + status + duration',
    !!completionWrite &&
      completionWrite.data.transcript.length === 3 &&
      typeof completionWrite.data.duration === 'string',
    `fields=${completionWrite ? Object.keys(completionWrite.data).join(',') : 'none'}`
  );

  const doc = fsDoc(fsPath);
  check('case 6: the stored document has the 3 lines', (doc?.transcript || []).length === 3, `lines=${(doc?.transcript || []).length}`);
  check(
    'case 6: the document is completed, timed and owned by the real uid',
    doc?.status === 'completed' && !!doc?.duration && doc?.userId === USER_A,
    `status=${doc?.status} userId=${doc?.userId}`
  );
  check(
    'case 6: the document text is the real conversation, not a placeholder',
    (doc?.transcript || []).every((e) => typeof e.text === 'string' && e.text.length > 0) &&
      (doc?.transcript || []).map((e) => e.text).join(' | ').includes('Ana will write the release notes.')
  );
  check(
    'case 6: the document is the meeting record itself (no new collection)',
    Object.keys(doc || {}).includes('transcript') && Object.keys(doc || {}).includes('id')
  );

  const cloudRead = await getMeetingById(F6, USER_A);
  check(
    'case 6: the meeting reads back from Firestore with its 3 lines',
    idsOf(cloudRead).join(',') === 'f-1,f-2,f-3',
    `ids=${idsOf(cloudRead).join(',')}`
  );

  // Resume in Firestore mode: the flush must merge, not replace, remotely.
  simulateReload();
  let cloudResume = await resumeMeeting(F6);
  cloudResume.ctx = addLines(cloudResume.ctx, [
    entry('f-4', 'Ana will also update the changelog.', 4),
    entry('f-5', 'Legal signs off on Monday.', 5),
  ]);
  await sleep(1400);
  check(
    'case 6: the resumed flush merged 5 lines in the Firestore document',
    (fsDoc(fsPath)?.transcript || []).map((e) => e.id).join(',') === 'f-1,f-2,f-3,f-4,f-5',
    `ids=${(fsDoc(fsPath)?.transcript || []).map((e) => e.id).join(',')}`
  );
  cloudResume.ctx = mountProvider();
  cloudResume.ctx.stopMeetingSession();
  await tick();
  const cloudFinal = fsDoc(fsPath);
  check(
    'case 6: the completed Firestore document holds all 5 lines',
    cloudFinal?.status === 'completed' && cloudFinal.transcript.length === 5,
    `status=${cloudFinal?.status} lines=${cloudFinal?.transcript?.length}`
  );


  // A record that exists ONLY in Firestore (written on another device) must be
  // merged into by the flush, never overwritten.
  const DEVICE = 'meet-case6-other-device';
  globalThis.__meetxFs.set(`meetings/${DEVICE}`, {
    id: DEVICE,
    userId: USER_A,
    title: 'From another device',
    platform: 'Browser / Other',
    topic: 'From another device',
    selectedLanguage: 'en-US',
    createdAt: Date.now(),
    status: 'live',
    transcript: [
      entry('d-1', 'Recorded on my phone.', 1),
      entry('d-2', 'And a second line from the phone.', 2),
    ],
  });
  await updateStoredMeeting(DEVICE, USER_A, {
    transcript: [entry('d-3', 'Added from this device.', 3)],
    status: 'live',
  });
  check(
    'case 6: a flush merges into a Firestore-only record instead of replacing it',
    idsOf(fsDoc(`meetings/${DEVICE}`)).join(',') === 'd-1,d-2,d-3',
    `ids=${idsOf(fsDoc(`meetings/${DEVICE}`)).join(',')}`
  );
  check(
    'case 6: merging read the document first (no blind overwrite)',
    fsCalls().some((c) => c.fn === 'getDoc' && c.path === `meetings/${DEVICE}`)
  );

  // History in Firestore mode must show the cloud meetings AND the local-only
  // ones (the latter used to vanish as soon as Firestore answered).
  const cloudHistory = await getUserMeetings(USER_A);
  const cloudHistoryIds = cloudHistory.map((m) => m.id);
  check(
    'case 6: history merges the Firestore and local records by id',
    cloudHistoryIds.includes(F6) && cloudHistoryIds.includes(E4) && cloudHistoryIds.includes(A1),
    `records=${cloudHistoryIds.length}`
  );
  check(
    'case 6: history rows keep their real transcript data in Firestore mode',
    (cloudHistory.find((m) => m.id === F6)?.transcript || []).length === 5
  );

  // A foreign user's document must never surface in this user's history.
  globalThis.__meetxFs.set('meetings/meet-case6-foreign-doc', {
    id: 'meet-case6-foreign-doc',
    userId: USER_B,
    title: 'User B private',
    platform: 'Browser / Other',
    topic: 'User B private',
    selectedLanguage: 'en-US',
    createdAt: Date.now(),
    status: 'completed',
    transcript: [entry('x-1', 'Not for user A.', 1)],
  });
  check(
    "case 6: a foreign Firestore document never appears for this user",
    !(await getUserMeetings(USER_A)).some((m) => m.id === 'meet-case6-foreign-doc')
  );
  check(
    "case 6: a foreign Firestore document cannot be opened by id",
    (await getMeetingById('meet-case6-foreign-doc', USER_A)) === null
  );
  globalThis.__firebaseConfigured = false;

  // ------------------------------------------------- store integrity + rule
  report.push('--- single transcript store / merge rule ---');
  const keys = listKeys();
  check(
    'no second transcript store was created (per-user meeting lists only)',
    keys.every((k) => /^meetx_(meetings_|is_pro|plan_type|free_meetings_(left|limit))/.test(k)),
    `keys=${keys.join(',')}`
  );
  const aStore = readStore(USER_A);
  check(
    'every meeting of the user is exactly one record',
    new Set(aStore.map((m) => m.id)).size === aStore.length,
    `rows=${aStore.length}`
  );
  check('the transcript lives on the meeting record itself', aStore.every((m) => Array.isArray(m.transcript)));
  check(
    'every stored meeting carries a userId, a title and a createdAt',
    aStore.every((m) => m.userId === USER_A && !!m.title && typeof m.createdAt === 'number')
  );

  check(
    'merge: a repeated entry id replaces in place instead of duplicating',
    mergeTranscriptEntriesById([entry('x', 'old', 1)], [entry('x', 'new', 1)])
      .map((e) => e.text).join(',') === 'new'
  );
  check(
    'merge: a completed translation supersedes its untranslated line',
    mergeTranscriptEntriesById(
      [entry('y', 'hello', 1)],
      [{ ...entry('y-t', 'hola', 1), originalText: 'hello', translatedText: 'hola' }]
    ).map((e) => e.id).join(',') === 'y-t'
  );
  check(
    'merge: a translated line is never stored twice',
    mergeTranscriptEntriesById(
      [entry('z', 'bonjour', 1), { ...entry('z-t', 'hello', 1), translatedText: 'hello' }],
      []
    ).map((e) => e.id).join(',') === 'z-t'
  );
  check(
    'merge: empty input yields an empty transcript',
    mergeTranscriptEntriesById(undefined, undefined).length === 0
  );

  // -------------------------------------------------------------- report
  console.log(report.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    failed === 0
      ? 'RESULT: meeting data lifecycle verified'
      : 'RESULT: meeting data lifecycle FAILED'
  );
  if (failed > 0) process.exitCode = 1;
};

await main();
