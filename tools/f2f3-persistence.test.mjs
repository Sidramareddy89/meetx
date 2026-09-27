/**
 * MEETX — F2/F3 meeting-persistence verification.
 *
 * Exercises the REAL `src/services/meetingService.ts` (it is bundled as-is and
 * only the Firebase import boundary is stubbed) to prove:
 *
 *  F2  one authoritative meeting id is used for the local record, the Firestore
 *      document, the resource storage path, the transcript flushes and the
 *      completion write — and no duplicate meeting is produced.
 *  F3  the background initial save (which always carries `transcript: []`)
 *      cannot overwrite remarks that the live-transcript debounce already
 *      persisted, in either the localStorage record or the Firestore document.
 *  plus: a flush that lands BEFORE the initial save is no longer dropped, a
 *      zero-transcript meeting still becomes `completed`, and existing
 *      meetings are never deleted or duplicated.
 *
 * Run it through the bundler harness:  node tools/run-f2f3-verification.mjs
 */

import {
  createMeetingId,
  saveMeeting,
  updateStoredMeeting,
  uploadMeetingResourceFile,
} from '../src/services/meetingService';

const UID = 'user-f2f3-test';
const KEY = `meetx_meetings_${UID}`;

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

/** Minimal browser localStorage shim — the service under test only uses this API. */
const installStorageShim = () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
};

const readList = () => JSON.parse(localStorage.getItem(KEY) || '[]');
const rowsFor = (id) => readList().filter((m) => m.id === id);
const stored = (id) => readList().find((m) => m.id === id);

const fsCalls = () => (globalThis.__meetxCalls || []);
const fsMeetingWrites = (id) =>
  fsCalls().filter((c) => c.fn === 'setDoc' && c.path === `meetings/${id}`);

/** What HomePage/MeetingContext build for a live session. */
const snapshotFor = (id) => ({
  id,
  userId: UID,
  title: 'Weekly Sync',
  platform: 'Browser / Other',
  topic: 'Weekly Sync',
  selectedLanguage: 'en-US',
  resources: [],
  createdAt: Date.now(),
  transcript: [],
  status: 'live',
});

/** What HomePage passes to saveMeeting (always `transcript: []` at start). */
const savePayload = {
  title: 'Weekly Sync',
  platform: 'Browser / Other',
  topic: 'Weekly Sync',
  selectedLanguage: 'en-US',
  resources: [],
  status: 'live',
  transcript: [],
};

const entryFor = (i) => ({
  id: `t-${i}`,
  speakerId: 'Speaker',
  text: `Remark number ${i}`,
  timestamp: `0:0${i}`,
  language: 'en-US',
});

const main = async () => {
  installStorageShim();
  globalThis.__meetxCalls = [];
  // Exercise the Firestore branch as well: the boundary is stubbed, not skipped.
  globalThis.__firebaseConfigured = true;

  console.log('=== MEETX F2/F3 persistence verification ===\n');

  // ---------------------------------------------------------------- 1. one id
  const first = createMeetingId();
  const second = createMeetingId();
  check('createMeetingId keeps the existing "meet-<epoch-ms>" format', /^meet-\d+$/.test(first), first);
  check('ids created in the same millisecond never collide', first !== second, `${first} / ${second}`);

  const meetingId = first;
  const snapshot = snapshotFor(meetingId);

  // ------------------------------------------------- 2. resource storage path
  await uploadMeetingResourceFile(UID, meetingId, {
    name: 'resume.pdf',
    size: 100,
    type: 'application/pdf',
  });
  const storageWrite = fsCalls().find((c) => c.fn === 'ref');
  check(
    'resource storage path is scoped to the authoritative meeting id',
    !!storageWrite && storageWrite.path === `users/${UID}/meetings/${meetingId}/resources/resume.pdf`,
    storageWrite && storageWrite.path
  );

  // ------------------------------------------------- 3. initial background save
  await saveMeeting(UID, savePayload, meetingId);
  check('initial save stores the record under the authoritative id', !!stored(meetingId));
  check('initial save creates exactly one row', rowsFor(meetingId).length === 1, `rows=${rowsFor(meetingId).length}`);

  const initWrites = fsMeetingWrites(meetingId);
  check(
    'Firestore initial save uses merge (never a full document replace)',
    initWrites.length === 1 && initWrites[0].options?.merge === true,
    JSON.stringify(initWrites.map((w) => w.options))
  );
  check(
    'Firestore initial save omits the empty transcript',
    initWrites.length === 1 && !('transcript' in initWrites[0].data),
    initWrites.length === 1 ? Object.keys(initWrites[0].data).join(',') : 'no write captured'
  );

  // ------------------------------------------------- 4. live debounce flush
  const entries = [entryFor(1), entryFor(2), entryFor(3)];
  await updateStoredMeeting(meetingId, UID, { transcript: entries, status: 'live' }, snapshot);
  check(
    'transcript flush persists all remarks',
    (stored(meetingId)?.transcript || []).length === 3,
    `len=${(stored(meetingId)?.transcript || []).length}`
  );

  // ------------------------------------------------- 5. the late initial save (F3)
  await saveMeeting(UID, savePayload, meetingId);
  check(
    'F3: late initial save cannot blank the stored transcript',
    (stored(meetingId)?.transcript || []).length === 3,
    `len=${(stored(meetingId)?.transcript || []).length}`
  );
  check('F3: late initial save does not duplicate the meeting', rowsFor(meetingId).length === 1, `rows=${rowsFor(meetingId).length}`);
  const lateWrites = fsMeetingWrites(meetingId);
  const lastMeetingWrite = lateWrites[lateWrites.length - 1];
  check(
    'F3: no Firestore meeting write ever contains an empty transcript',
    lateWrites.every((w) => !('transcript' in w.data) || (w.data.transcript || []).length > 0),
    lateWrites.map((w) => ('transcript' in w.data ? `len=${(w.data.transcript || []).length}` : 'omitted')).join(' / ')
  );
  check(
    'F3: the late initial save keeps the newer remarks instead of blanking them',
    !!lastMeetingWrite &&
      (lastMeetingWrite.data.transcript === undefined || lastMeetingWrite.data.transcript.length === 3),
    lastMeetingWrite
      ? `last write transcript=${lastMeetingWrite.data.transcript === undefined ? 'omitted' : lastMeetingWrite.data.transcript.length}`
      : 'no write'
  );
  check(
    'the transcript flush is persisted to Firestore with the real remarks',
    lateWrites.filter((w) => (w.data.transcript || []).length === 3).length >= 1
  );

  // ------------------------------------------------- 6. completion flush
  await updateStoredMeeting(meetingId, UID, { transcript: entries, status: 'completed', duration: '2m 5s' }, snapshot);
  check('completion marks the meeting completed', stored(meetingId)?.status === 'completed', stored(meetingId)?.status);
  check('completion keeps the full transcript', (stored(meetingId)?.transcript || []).length === 3);
  check('completion records the duration', stored(meetingId)?.duration === '2m 5s', stored(meetingId)?.duration);


  // ------------------------------------------------- 7. local === Firestore id
  const fsMeetingDocPaths = [
    ...new Set(fsCalls().filter((c) => c.fn === 'setDoc' && c.path.startsWith('meetings/')).map((c) => c.path)),
  ];
  check(
    'every Firestore meeting write targets one single id',
    fsMeetingDocPaths.length === 1 && fsMeetingDocPaths[0] === `meetings/${meetingId}`,
    fsMeetingDocPaths.join(', ')
  );
  const localDocPaths = [...new Set(readList().map((m) => `meetings/${m.id}`))];
  check(
    'local storage and Firestore reference the same meeting id(s)',
    localDocPaths.every((p) => fsMeetingDocPaths.includes(p)) &&
      fsMeetingDocPaths.every((p) => localDocPaths.includes(p)),
    `local=${localDocPaths.join(',')} firestore=${fsMeetingDocPaths.join(',')}`
  );

  // ------------------------------------------------- 8. flush before initial save (F2 safety net)
  const id2 = createMeetingId();
  const snap2 = snapshotFor(id2);
  await updateStoredMeeting(id2, UID, { transcript: [entryFor(4)], status: 'live' }, snap2);
  check('F2: a flush landing before the initial save is not dropped', !!stored(id2));
  check(
    'F2: the created record carries the snapshot metadata and the remark',
    stored(id2)?.topic === 'Weekly Sync' && (stored(id2)?.transcript || []).length === 1,
    `topic=${stored(id2)?.topic} len=${(stored(id2)?.transcript || []).length}`
  );
  check('F2: the created record uses the authoritative id', rowsFor(id2).length === 1 && stored(id2)?.id === id2);

  // ------------------------------------------------- 9. mismatched snapshot is ignored
  const id3 = createMeetingId();
  await updateStoredMeeting(id3, UID, { transcript: [entryFor(9)], status: 'live' }, snap2);
  check('a snapshot for a different id never creates another meeting', !stored(id3));
  check('no duplicate or extra meeting rows were produced', readList().length === 2, `rows=${readList().length}`);

  // ------------------------------------------------- 10. zero-transcript meeting
  const id4 = createMeetingId();
  await saveMeeting(UID, savePayload, id4);
  await updateStoredMeeting(id4, UID, { transcript: [], status: 'completed', duration: '0m 0s' }, snapshotFor(id4));
  check('zero-transcript meeting becomes completed (never stuck live)', stored(id4)?.status === 'completed', stored(id4)?.status);
  check(
    'zero-transcript meeting keeps an empty transcript array',
    Array.isArray(stored(id4)?.transcript) && stored(id4).transcript.length === 0
  );
  check('existing meetings are preserved (nothing deleted)', readList().length === 3, `rows=${readList().length}`);

  // ------------------------------------------------- 11. default id path
  const auto = await saveMeeting(UID, savePayload);
  check(
    'saveMeeting without a custom id uses the shared generator',
    /^meet-\d+(-\d+)?$/.test(auto.id) && !readList().slice(1).some((m) => m.id === auto.id),
    auto.id
  );

  console.log(report.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed === 0 ? 'RESULT: F2/F3 persistence verified' : 'RESULT: verification failed');
  return failed === 0 ? 0 : 1;
};

main()
  .then((code) => { process.exit(code); })
  .catch((err) => { console.error('verification crashed:', err); process.exit(1); });

