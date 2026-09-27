/**
 * MEETX — F4 assistant-context verification.
 *
 * Runs the REAL `MeetingProvider` (via tools/react-hook-shim.mjs) with the REAL
 * aiAssistantService → llmProviders prompt builder, the REAL meetingService and
 * the REAL meetingInsightService. Only `react`, `./AuthContext` and the Firebase
 * boundary are stubbed (they cannot run in Node), and `globalThis.fetch` is
 * captured so the assertions inspect the ACTUAL request the assistant sends to
 * the LLM — not the UI.
 *
 * Cases covered: persisted transcript available after opening/resuming (A),
 * the assistant request carries it (B), new live remarks join it (C), switching
 * meetings switches context (D), an empty meeting fabricates nothing (E),
 * authenticated-user isolation (F), no duplicate entries (G) and single
 * authoritative meeting id (case 5).
 *
 * Run it through the bundler harness:  node tools/run-f4-verification.mjs
 */

import { __hookTest } from 'react';
import { MeetingProvider } from '../src/contexts/MeetingContext';
import { buildMeetingTranscriptContext } from '../src/services/meetingInsightService';
import { saveMeeting, getMeetingById } from '../src/services/meetingService';

const USER_A = 'user-a';
const USER_B = 'user-b';

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

// ------------------------------------------------------------ storage shim
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
};

// The provider/service layer uses window timers for its debounces.
const installWindowTimers = () => {
  globalThis.window = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
  };
};

// ------------------------------------------------------- LLM request capture
const requests = [];

const installFetch = () => {
  globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    let body = null;
    try {
      body = init && init.body ? JSON.parse(init.body) : null;
    } catch {
      body = null;
    }
    requests.push({ url: urlStr, body });
    if (urlStr.includes('generativelanguage.googleapis.com')) {
      // Echo the user question into the answer so ordering/one-by-one delivery
      // can be asserted (the prefix is unchanged for the existing assertions).
      const promptEcho = body && body.contents && body.contents[0] && body.contents[0].parts[0].text || '';
      const question = (promptEcho.split('User Question:')[1] || '').trim();
      return {
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: `Grounded stub answer: ${question.slice(0, 40)}` }] } }],
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
};

/** The exact prompt text the assistant sent in the most recent LLM request. */
const lastPrompt = () => {
  for (let i = requests.length - 1; i >= 0; i -= 1) {
    const text = requests[i].body && requests[i].body.contents && requests[i].body.contents[0];
    const part = text && text.parts && text.parts[0];
    if (part && typeof part.text === 'string') return part.text;
  }
  return '';
};

const countOf = (haystack, needle) => haystack.split(needle).length - 1;
const idxOf = (haystack, needle) => haystack.indexOf(needle);

// ------------------------------------------------ mount the REAL provider
const mountProvider = () => {
  const element = __hookTest.render(() => MeetingProvider({ children: null }));
  return element && element.props ? element.props.value : null;
};

const lastAssistantText = (ctx) => {
  const messages = (ctx && ctx.assistantMessages) || [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].sender === 'assistant') return messages[i].text;
  }
  return '';
};

// ----------------------------------------------------------- test fixtures
const entry = (id, text, timestamp) => ({
  id,
  speakerId: 'Speaker',
  text,
  timestamp,
  language: 'en-US',
});

const P1 = entry('p-1', 'We agreed to ship the beta in March.', '0:10');
const P2 = entry('p-2', 'Priya owns the pricing page.', '0:22');
const Q1 = entry('q-1', 'Budget review for Q3 advertising.', '0:05');
const R1 = entry('r-1', 'Other user confidential remark.', '0:01');
const L1 = entry('l-1', 'New live remark about the launch date.', '12:01');
const L2 = entry('l-2', 'Second live remark about hiring.', '12:20');

const meetingPayload = (topic, transcript) => ({
  title: topic,
  platform: 'Google Meet',
  topic,
  selectedLanguage: 'en-US',
  resources: [],
  pastedNotes: '',
  status: 'live',
  transcript,
});

const seedMeetings = async () => {
  await saveMeeting(USER_A, meetingPayload('Beta planning', [P1, P2]), 'meet-a');
  await saveMeeting(USER_A, meetingPayload('Q3 budget', [Q1]), 'meet-b');
  await saveMeeting(USER_A, meetingPayload('Empty meeting', []), 'meet-c');
  await saveMeeting(USER_B, meetingPayload('Other user meeting', [R1]), 'meet-x');
};

/** Resume/select a meeting exactly the way MeetingDetailPage does. */
const openMeeting = (ctx, meeting) =>
  ctx.startMeetingSession({
    meeting,
    userId: USER_A,
    topic: meeting.topic,
    platform: meeting.platform,
    meetingLink: meeting.meetingLink,
    pastedNotes: meeting.pastedNotes,
    resources: meeting.resources,
  });

const main = async () => {
  installStorage();
  installWindowTimers();
  installFetch();
  globalThis.__firebaseConfigured = false; // use the real localStorage store path
  globalThis.__meetxTestAuth = {
    currentUser: {
      uid: USER_A,
      email: 'a@example.com',
      displayName: 'User A',
      phoneNumber: '1234',
      hasCompletedOnboarding: true,
    },
  };
  localStorage.setItem('meetx_is_pro', 'true'); // bypass the free-meeting gate
  localStorage.removeItem('meetx_gemini_api_key'); // start on the offline engine
  localStorage.removeItem('meetx_groq_api_key');

  console.log('=== MEETX F4 assistant-context verification ===\n');

  await seedMeetings();

  // ---------------------------------------------------------------- A + case 5
  const loadedA = await getMeetingById('meet-a', USER_A);
  check(
    'A: opening a saved meeting loads its persisted transcript',
    !!loadedA && (loadedA.transcript || []).length === 2,
    `len=${loadedA && loadedA.transcript ? loadedA.transcript.length : 'null'}`
  );
  check(
    'A: the loaded entries are the persisted conversation',
    (loadedA.transcript || []).some((e) => e.text === P1.text) &&
      (loadedA.transcript || []).some((e) => e.text === P2.text)
  );
  check('case 5: loaded meeting id === requested id (one authoritative id)', loadedA.id === 'meet-a', loadedA.id);

  // ------------------------------------------------------- pure helper contract
  const h1 = buildMeetingTranscriptContext(loadedA.transcript, []);
  check('helper: persisted only -> persisted entries', h1.length === 2 && h1[0].id === 'p-1', `ids=${h1.map((e) => e.id).join(',')}`);
  const h2 = buildMeetingTranscriptContext(undefined, [L1]);
  check('helper: live only -> live entries', h2.length === 1 && h2[0].id === 'l-1');
  const h3 = buildMeetingTranscriptContext(loadedA.transcript, [L1, L2]);
  check(
    'helper: persisted + live -> both, persisted first',
    h3.map((e) => e.id).join(',') === 'p-1,p-2,l-1,l-2',
    h3.map((e) => e.id).join(',')
  );
  const h4 = buildMeetingTranscriptContext(loadedA.transcript, [{ ...P1, text: 'We agreed to ship the beta in April.' }]);
  check(
    'helper: a repeated entry id replaces in place (no duplicate)',
    h4.length === 2 && h4[0].text.includes('April'),
    `len=${h4.length} first=${h4[0].text}`
  );
  check(
    'helper: no transcript anywhere -> empty array (nothing fabricated)',
    buildMeetingTranscriptContext([], []).length === 0 &&
      buildMeetingTranscriptContext(undefined, undefined).length === 0
  );

  // ------------------------------- B (offline engine, ground-truth transcript)
  let ctx = mountProvider();
  openMeeting(ctx, loadedA);
  ctx = mountProvider();
  await ctx.askAssistant('Based on our previous conversation, what did we discuss?', 'query');
  ctx = mountProvider();
  const offlineAnswer = lastAssistantText(ctx);
  check(
    'B: the assistant answer uses the persisted conversation',
    offlineAnswer.includes(P1.text) && offlineAnswer.includes(P2.text),
    offlineAnswer.slice(0, 140)
  );
  check('B: no network request was made on the offline path', requests.length === 0, `requests=${requests.length}`);

  // ------------------------- B/CASE 1 via the REAL LLM request (captured)
  localStorage.setItem('meetx_gemini_api_key', 'test-key-f4');
  ctx = mountProvider();
  await ctx.askAssistant('Based on our previous conversation, what did we discuss?', 'query');
  const promptA = lastPrompt();
  check(
    'B: the ACTUAL LLM request carries the persisted transcript',
    promptA.includes(P1.text) && promptA.includes(P2.text),
    promptA.slice(0, 160)
  );
  check('case 1: the request is scoped to the opened meeting topic', promptA.includes('Beta planning'));
  check('case 1: no other meeting contributes context', !promptA.includes(Q1.text) && !promptA.includes(R1.text));
  check(
    'the captured request is a real generateContent call',
    requests[requests.length - 1].url.includes('generativelanguage.googleapis.com') &&
      requests[requests.length - 1].url.includes(':generateContent')
  );

  // ------------------------------------------------------ C + case 2 + G
  ctx = mountProvider();
  ctx.addTranscriptEntry(L1);
  ctx.addTranscriptEntry(L2);
  ctx = mountProvider();
  check('C: new live remarks are captured in the live session state', (ctx.liveTranscript || []).length === 2, `len=${(ctx.liveTranscript || []).length}`);
  await ctx.askAssistant('Summarize the recent points.', 'query');
  const promptA2 = lastPrompt();
  check(
    'case 2: persisted + live remarks both reach the LLM request',
    [P1, P2, L1, L2].every((e) => promptA2.includes(e.text))
  );
  check(
    'G: no remark is duplicated in the request',
    [P1, P2, L1, L2].every((e) => countOf(promptA2, e.text) === 1),
    [P1, P2, L1, L2].map((e) => `${e.id}=${countOf(promptA2, e.text)}`).join(' ')
  );
  check('case 2: persisted remarks precede the new live ones', idxOf(promptA2, P1.text) < idxOf(promptA2, L1.text));

  // ------------------------------------------------------- D + case 3 (switch)
  const loadedB = await getMeetingById('meet-b', USER_A);
  ctx = mountProvider();
  openMeeting(ctx, loadedB);
  ctx = mountProvider();
  check('case 3: switching meetings resets the live transcript', (ctx.liveTranscript || []).length === 0);
  await ctx.askAssistant('What do you remember from this conversation?', 'query');
  const promptB = lastPrompt();
  check('D: the context switched to the newly opened meeting', promptB.includes(Q1.text));
  check(
    'D: the previous meeting persisted transcript is gone',
    !promptB.includes(P1.text) && !promptB.includes(P2.text)
  );
  check('D: the previous meeting LIVE remarks are gone too', !promptB.includes(L1.text) && !promptB.includes(L2.text));
  check('D: the topic switched with the meeting', promptB.includes('Q3 budget') && !promptB.includes('Beta planning'));

  // ----------------------------------------------------------- E (empty meeting)
  const loadedC = await getMeetingById('meet-c', USER_A);
  ctx = mountProvider();
  openMeeting(ctx, loadedC);
  ctx = mountProvider();
  await ctx.askAssistant('What did we discuss earlier?', 'query');
  const promptC = lastPrompt();
  check(
    'E: an empty meeting sends no transcript and fabricates nothing',
    promptC.includes('(no speech captured yet') && [P1, P2, Q1, L1, L2, R1].every((e) => !promptC.includes(e.text)),
    promptC.slice(promptC.indexOf('Recent Transcript'), promptC.indexOf('Recent Transcript') + 120)
  );
  check('E: the meeting topic is still provided', promptC.includes('Empty meeting'));
  // F4 must not turn an empty meeting into a refusal: the model is told to
  // answer from the topic/notes and to point the user at the microphone.
  check(
    'E: an empty meeting is answered, not refused',
    /NO TRANSCRIPT HAS BEEN CAPTURED YET/i.test(promptC) && /Never refuse/i.test(promptC)
  );

  localStorage.removeItem('meetx_gemini_api_key');
  ctx = mountProvider();
  await ctx.askAssistant('What did we discuss earlier?', 'query');
  ctx = mountProvider();
  const emptyOffline = lastAssistantText(ctx);
  check(
    'E: the existing "no conversation captured" behaviour is preserved',
    emptyOffline.includes('no live conversation has been captured yet'),
    emptyOffline.slice(0, 140)
  );

  // ------------------------------------------------ F (authenticated isolation)
  const crossA = await getMeetingById('meet-a', USER_B);
  const crossX = await getMeetingById('meet-x', USER_A);
  const userBStore = JSON.parse(localStorage.getItem(`meetx_meetings_${USER_B}`) || '[]');
  check('F: another user cannot load this meeting', crossA === null, crossA ? 'record leaked' : 'null');
  check('F: a meeting owned by another user is not loadable', crossX === null, crossX ? 'record leaked' : 'null');
  check('F: the other user meeting does exist, under that user only', userBStore.some((m) => m.id === 'meet-x'));
  check(
    "F: no captured prompt ever contains another user's content",
    [promptA, promptA2, promptB, promptC].every((p) => !p.includes(R1.text))
  );

  // ------------------------------------------- G (no duplicate/extra records)
  const userAStore = JSON.parse(localStorage.getItem(`meetx_meetings_${USER_A}`) || '[]');
  check('no meeting record was duplicated by resuming', userAStore.filter((m) => m.id === 'meet-a').length === 1);
  check(
    'resuming/asking created no extra meeting records',
    userAStore.map((m) => m.id).sort().join(',') === 'meet-a,meet-b,meet-c',
    userAStore.map((m) => m.id).join(',')
  );
  check('the assistant produced an answer for every question asked', lastAssistantText(ctx).length > 0);

  // ------------------------- H (realtime answers go up ONE BY ONE, none dropped)
  // A burst of participant remarks used to fire several LLM calls at once: they
  // raced and could land out of order, and a remark that arrived while another
  // request was still in flight was dropped entirely. askAssistant is now
  // serialized, so every request is answered, in the order it was made.
  const ctxBeforeQueue = (mountProvider().assistantMessages || []).length;
  const burst = ['What did they just say?', 'What should I answer now?', 'What comes next?'];
  // Fired WITHOUT awaiting, exactly like the auto-answer effect does when
  // several remarks land in quick succession.
  const inFlight = burst.map((q) => mountProvider().askAssistant(q, 'query'));
  await Promise.all(inFlight);
  ctx = mountProvider();
  const queueMessages = (ctx.assistantMessages || []).slice(ctxBeforeQueue);
  const assistantReplies = queueMessages.filter((m) => m.sender === 'assistant');
  const userEchoes = queueMessages.filter((m) => m.sender === 'user');
  check(
    'a burst of questions produces one answer each (nothing dropped)',
    assistantReplies.length === burst.length,
    `asked=${burst.length} answered=${assistantReplies.length}`
  );
  check('each question is echoed to the user', userEchoes.length === burst.length, `echoed=${userEchoes.length}`);
  check(
    'the answers appear in the order the questions were asked',
    burst.every((q, i) => {
      const reply = assistantReplies[i];
      return !!reply && reply.text.includes(q.slice(0, 12));
    }),
    assistantReplies.map((m) => m.text.slice(0, 40)).join(' | ')
  );
  check(
    'no request is left thinking after the queue drains',
    mountProvider().isThinking === false
  );

  console.log(report.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed === 0 ? 'RESULT: F4 assistant context verified' : 'RESULT: verification failed');
  console.log(`captured LLM requests: ${requests.length}`);
  return failed === 0 ? 0 : 1;
};

main()
  .then((code) => { process.exit(code); })
  .catch((err) => { console.error('verification crashed:', err); process.exit(1); });


