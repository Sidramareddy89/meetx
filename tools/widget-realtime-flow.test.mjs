/**
 * MEETX — realtime widget flow verification (speech -> transcript -> answer).
 *
 * Mounts the REAL `FloatingAssistantWidget` (with the REAL LiveConversationPane,
 * LiveBriefPane, MeetingContext, meetingService and insight builders) and drives
 * it the way a meeting does: participant speech arrives through the recognizer
 * callback, the widget must show every remark, ask the assistant for EVERY
 * remark, and the answers must appear in the card ONE BY ONE in order.
 *
 * Only boundaries Node cannot run are stubbed: `react` (hook runtime, which can
 * also provide a context value to a separately-rendered child), `react-router-dom`,
 * `lucide-react`, `./AuthContext`, the Firebase surface, and
 * `useSpeechToText` (the real Web Speech API does not exist in Node) — the stub
 * simply hands the test the same callbacks the real hook would call.
 *
 * Run:  node tools/run-widget-realtime-flow.mjs
 */

import { __hookTest } from 'react';
import { MeetingProvider, MeetingContext } from '../src/contexts/MeetingContext';
import { FloatingAssistantWidget } from '../src/components/assistant/FloatingAssistantWidget';

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

const UID = 'user-widget-flow';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => sleep(0);

// ------------------------------------------------------------- environment
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
// Provider keys: the services read these (VITE_* env is absent in Node). Without
// them the assistant correctly falls back to the offline engine instead of
// calling a provider, which is not what this test is about.
localStorage.setItem('meetx_groq_api_key', 'test-groq-key');
localStorage.setItem('meetx_gemini_api_key', 'test-gemini-key');
globalThis.__meetxTestAuth = { currentUser: { uid: UID } };
// Real window event registry, so the test can fire the page lifecycle events the
// app listens for (used to flush the transcript on refresh / tab close).
const windowEvents = new Map();
globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  addEventListener: (type, fn) => {
    if (!windowEvents.has(type)) windowEvents.set(type, []);
    windowEvents.get(type).push(fn);
  },
  removeEventListener: (type, fn) => {
    const list = windowEvents.get(type) || [];
    const at = list.indexOf(fn);
    if (at !== -1) list.splice(at, 1);
  },
  scrollTo: () => {},
};
const fireWindowEvent = (type) => {
  for (const fn of (windowEvents.get(type) || []).slice()) fn();
};
// The widget registers a real `document` mousedown listener (outside-click) and
// a copy-to-clipboard helper. Node has no DOM, so provide only that surface.
globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({ value: '', select: () => {}, setSelectionRange: () => {} }),
  body: { appendChild: () => {}, removeChild: () => {} },
  execCommand: () => true,
};

// ----------------------------------------------- LLM request capture + timing
const requests = [];
let inFlight = 0;
let maxConcurrent = 0;
const LLM_LATENCY = 40; // ms per answer, so any overlap would be observable

globalThis.fetch = async (url, init) => {
  const urlStr = String(url);
  let body = null;
  try { body = init && init.body ? JSON.parse(init.body) : null; } catch { body = null; }
  if (urlStr.includes('api.groq.com')) {
    inFlight += 1;
    maxConcurrent = Math.max(maxConcurrent, inFlight);
    const prompt = body?.messages?.[1]?.content || '';
    requests.push({ prompt, model: body?.model });
    await sleep(LLM_LATENCY);
    inFlight -= 1;
    // Echo the targeted remark + the question so ordering can be asserted.
    const target = (/spoke remark #(\d+)/.exec(prompt) || [])[1] || '?';
    const question = (prompt.split('User Question:')[1] || '').trim();
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: `ANSWER#${target} to "${question.slice(0, 28)}"` } }] }),
    };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

/** A participant says something, exactly as the recognizer would report it. */
const say = async (id, text, seconds) => {
  globalThis.__speech.onTranscriptReceived({
    id,
    speakerId: 'speaker-remote',
    speakerName: 'Dana',
    text,
    timestamp: `00:${String(seconds).padStart(2, '0')}`,
    language: 'en-US',
  });
  renderAll();
  await tick();
};

/** Render the real provider, hand its value to the widget, render the widget. */
let widgetTree = null;
let meetingValue = null;
const renderAll = () => {
  // The provider and the widget get their OWN hook stores (React keeps hooks per
  // component instance); sharing one flat store would mix their slots up.
  __hookTest.useInstance('provider');
  const providerElement = __hookTest.render(() => MeetingProvider({ children: null }));
  meetingValue = providerElement.props.value;
  __hookTest.provideContext(MeetingContext, meetingValue);
  __hookTest.useInstance('widget');
  widgetTree = __hookTest.render(() => FloatingAssistantWidget());
  return widgetTree;
};

/**
 * All text in the rendered widget, in document order.
 * Function components are INVOKED (as React would) so text produced inside a
 * child component such as LiveConversationPane is included.
 */
const collectText = (node, out = [], depth = 0) => {
  if (depth > 40) return out;
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collectText(c, out, depth + 1); return out; }
  if (!node) return out;
  if (typeof node.type === 'function' && !node.type.__isContext) {
    try {
      return collectText(node.type(node.props || {}), out, depth + 1);
    } catch {
      return out; // a child needing a browser API must not break the walk
    }
  }
  if (node.props) collectText(node.props.children, out, depth + 1);
  return out;
};
const widgetText = () => collectText(widgetTree).join(' | ');

/** The send button (a clickable button with a `disabled` flag, blue/rounded). */
const findSendButtonDisabled = (node) => {
  if (!node || typeof node === 'string' || typeof node === 'number') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findSendButtonDisabled(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  if (
    node.props &&
    typeof node.props.onClick === 'function' &&
    typeof node.props.disabled === 'boolean' &&
    String(node.props.className || '').includes('bg-blue-600')
  ) {
    return node.props.disabled;
  }
  return node.props ? findSendButtonDisabled(node.props.children) : undefined;
};

/** The question textarea (the element carrying onChange + onKeyDown). */const findInput = (node) => {
  if (!node || typeof node === 'string' || typeof node === 'number') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findInput(child);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props && typeof node.props.onChange === 'function' && typeof node.props.onKeyDown === 'function') {
    return node;
  }
  return node.props ? findInput(node.props.children) : null;
};

const main = async () => {
  renderAll();

  // ---------------------------------------------------- start a real meeting
  const started = meetingValue.startMeetingSession({
    meetingId: 'meet-widget-flow',
    userId: UID,
    platform: 'Browser / Other',
    topic: 'Widget realtime flow',
    selectedLanguage: 'en-US',
  });
  renderAll();
  check('the widget session starts', started === true);

  // ------------------------------------------- participant speaks, 3 remarks
  await say('w-1', 'We are shipping the beta in March.', 1);
  check('remark 1 is in the live transcript immediately', (meetingValue.liveTranscript || []).length === 1, `len=${(meetingValue.liveTranscript || []).length}`);
  await say('w-2', 'Priya owns the pricing page.', 2);
  await say('w-3', 'Legal review is due next Friday.', 3);
  check('all 3 remarks are captured', (meetingValue.liveTranscript || []).length === 3, `len=${(meetingValue.liveTranscript || []).length}`);

  // Give the (serialized) answer queue time to drain.
  for (let i = 0; i < 40 && requests.length < 3; i += 1) await sleep(25);
  await sleep(120);
  renderAll();

  const targetOf = (prompt) => (/spoke remark #(\d+)/.exec(prompt) || [])[1];
  check('every remark produced its own assistant request', requests.length === 3, `requests=${requests.length}`);
  check('all three were served by the realtime model', requests.every((r) => r.model === 'openai/gpt-oss-120b'), requests.map((r) => r.model).join(','));
  check('requests never overlap (answers are one by one, not raced)', maxConcurrent === 1, `maxConcurrent=${maxConcurrent}`);
  check(
    'each request targeted its own remark (#1, #2, #3)',
    requests.map((r) => targetOf(r.prompt)).join(',') === '1,2,3',
    requests.map((r) => targetOf(r.prompt)).join(',')
  );
  check(
    'each request also carried the whole conversation as context',
    !!requests[2] && requests[2].prompt.includes('We are shipping the beta in March.') &&
      requests[2].prompt.includes('Priya owns the pricing page.') &&
      requests[2].prompt.includes('Legal review is due next Friday.'),
    'later request lost earlier context'
  );

  const answerOf = (text) => (/ANSWER#(\d+)/.exec(text) || [])[1];
  // The session start banner is an assistant message too; the answers under test
  // are the ones the assistant produced for each remark.
  const answersFor = () =>
    (meetingValue.assistantMessages || []).filter((m) => m.sender === 'assistant' && m.id !== 'msg-init');
  check('the widget holds one answer per remark', answersFor().length === 3, `answers=${answersFor().length}`);
  check(
    'the answers are ordered 1, 2, 3 (one by one)',
    answersFor().map((m) => answerOf(m.text)).join(',') === '1,2,3',
    answersFor().map((m) => m.text.slice(0, 14)).join(' | ')
  );

  // ---------------------- the ANSWERS card shows each answer, one by one
  // (this is the default tab)
  const answersTabText = widgetText();
  check(
    'the widget card shows every answer',
    ['ANSWER#1', 'ANSWER#2', 'ANSWER#3'].every((a) => answersTabText.includes(a)),
    'an answer is missing from the card'
  );
  check(
    'the answers are stacked in order in the card',
    answersTabText.indexOf('ANSWER#1') < answersTabText.indexOf('ANSWER#2') &&
      answersTabText.indexOf('ANSWER#2') < answersTabText.indexOf('ANSWER#3'),
    'answers are out of order in the card'
  );

  // ------------------------------------- the CONVERSATION card shows the talk
  openConversationTab();
  const shown = widgetText();
  check(
    'the Live Conversation card lists every remark',
    ['We are shipping the beta in March.', 'Priya owns the pricing page.', 'Legal review is due next Friday.'].every((t) => shown.includes(t)),
    'a remark is missing from the card'
  );
  check('the card shows the speaker of each remark', shown.includes('Dana'));
  check(
    'the conversation counter reflects the real remark count',
    // joined without separators: the label's parts are sibling nodes
    collectText(widgetTree).join('').includes('Live conversation (3)'),
    (collectText(widgetTree).join('').match(/Live conversation \([0-9]+\)/) || ['none'])[0]
  );

  // ------------------------------- a burst: remarks arriving back to back
  const before = requests.length;
  const burst = [
    ['w-4', 'Budget is capped at twenty thousand.', 4],
    ['w-5', 'Ana will write the release notes.', 5],
    ['w-6', 'We should wrap up by Friday.', 6],
  ];
  for (const [id, text, ts] of burst) {
    globalThis.__speech.onTranscriptReceived({ id, speakerId: 's', speakerName: 'Dana', text, timestamp: `00:0${ts}` });
    renderAll();
  }
  for (let i = 0; i < 40 && requests.length < before + 3; i += 1) await sleep(25);
  await sleep(120);
  renderAll();

  check('a burst of 3 remarks still produces 3 answers (none dropped)', requests.length - before === 3, `new=${requests.length - before}`);
  check('the burst did not race the LLM', maxConcurrent === 1, `maxConcurrent=${maxConcurrent}`);
  check(
    'the burst is answered in order 4, 5, 6',
    requests.slice(before).map((r) => targetOf(r.prompt)).join(',') === '4,5,6',
    requests.slice(before).map((r) => targetOf(r.prompt)).join(',')
  );

  const allAnswers = answersFor();
  check('the widget now holds 6 answers for 6 remarks', allAnswers.length === 6, `answers=${allAnswers.length}`);

  // ---------------------------------------- typed questions are never dropped
  // A typed question used to be discarded while the assistant was thinking.
  const beforeTyped = requests.length;
  // Type into the question box WITHOUT sending, so the send button's state can
  // be inspected first.
  const fillInput = (text) => {
    const input = findInput(widgetTree);
    if (!input) return false;
    input.props.onChange({ target: { value: text } });
    renderAll();
    return true;
  };
  const pressEnter = () => {
    const input = findInput(widgetTree);
    input.props.onKeyDown({ key: 'Enter', preventDefault: () => {} });
    renderAll();
  };
  const typeQuestion = async (text) => {
    if (!fillInput(text)) return false;
    pressEnter();
    await tick();
    return true;
  };

  const typedOk = fillInput('Who owns the pricing page?');
  check('the widget has a text input for questions', typedOk);
  // The send button must stay enabled while the assistant is busy, otherwise a
  // typed question could be typed but not sent.
  const sendDisabled = findSendButtonDisabled(widgetTree);
  check(
    'the send button is enabled whenever there is text to send',
    sendDisabled === false,
    `disabled=${sendDisabled}`
  );
  pressEnter();
  renderAll();
  await tick();
  for (let i = 0; i < 40 && requests.length < beforeTyped + 1; i += 1) await sleep(25);
  await sleep(80);
  renderAll();
  check(
    'a typed question is sent to the assistant',
    requests.length === beforeTyped + 1,
    `new=${requests.length - beforeTyped}`
  );
  check(
    'the typed question is answered in the card',
    (meetingValue.assistantMessages || []).some((m) => m.sender === 'user' && m.text.includes('Who owns the pricing page')) &&
      answersFor().some((m) => m.id !== 'msg-init'),
    'the typed question produced no answer'
  );
  check(
    'the input is cleared after sending',
    findInput(widgetTree)?.props?.value === '',
    `value=${JSON.stringify(findInput(widgetTree)?.props?.value)}`
  );

  // A typed question sent WHILE the assistant is busy must still be answered.
  const beforeBusy = requests.length;
  await typeQuestion('And the legal deadline?');
  void meetingValue.askAssistant('Another one right now.', 'query');
  for (let i = 0; i < 40 && requests.length < beforeBusy + 2; i += 1) await sleep(25);
  await sleep(120);
  renderAll();
  check(
    'a question typed while the assistant is busy is still answered (not dropped)',
    requests.length >= beforeBusy + 2,
    `new=${requests.length - beforeBusy}`
  );

  // ------------------------------------------- answers are never repeated
  // A recognizer glitch or speaker echo re-emits the SAME words as the previous
  // line. Asking again would only repeat the previous answer, so that exact
  // repeat must be skipped...
  const answerCountBefore = answersFor().length;
  globalThis.__speech.onTranscriptReceived({
    id: 'w-7-echo',
    speakerId: 's',
    speakerName: 'Dana',
    text: 'We should wrap up by Friday.',
    timestamp: '00:07',
  });
  renderAll();
  await sleep(150);
  renderAll();
  check(
    'an echo of the previous remark does not produce a repeated answer',
    answersFor().length === answerCountBefore,
    `answers ${answerCountBefore} -> ${answersFor().length}`
  );
  check(
    'the echo is still transcribed (it is not dropped from the meeting)',
    (meetingValue.liveTranscript || []).some((e) => e.id === 'w-7-echo')
  );

  // ...but the same sentence said LATER, after other remarks, is a real new turn
  // and must still be answered. The guard must not silence genuine repeats.
  const beforeRealRepeat = answersFor().length;
  globalThis.__speech.onTranscriptReceived({
    id: 'w-8-new',
    speakerId: 's',
    speakerName: 'Dana',
    text: 'Ship the dark theme next sprint.',
    timestamp: '00:08',
  });
  renderAll();
  await sleep(60);
  globalThis.__speech.onTranscriptReceived({
    id: 'w-9-repeat-later',
    speakerId: 's',
    speakerName: 'Dana',
    text: 'Ship the dark theme next sprint.',
    timestamp: '00:09',
  });
  renderAll();
  for (let i = 0; i < 40 && answersFor().length < beforeRealRepeat + 1; i += 1) await sleep(25);
  await sleep(100);
  renderAll();
  check(
    'a sentence genuinely repeated LATER is still answered (guard is not too broad)',
    answersFor().length === beforeRealRepeat + 1,
    `answers ${beforeRealRepeat} -> ${answersFor().length}`
  );
  const texts = answersFor().map((m) => m.text);
  check(
    'no two consecutive answers are identical',
    texts.every((t, i) => i === 0 || t !== texts[i - 1]),
    texts.slice(-3).join(' | ')
  );

  // -------------------------------------------- transcript is still persisted
  // The normal write is a 1.2 s debounce; fire the real pagehide flush the app
  // registers for refresh/tab close, exactly as the browser would.
  fireWindowEvent('pagehide');
  await tick();
  const persisted = JSON.parse(localStorage.getItem(`meetx_meetings_${UID}`) || '[]').find((m) => m.id === 'meet-widget-flow');
  const liveCount = (meetingValue.liveTranscript || []).length;
  check(
    'every captured remark was persisted on the meeting record',
    (persisted?.transcript || []).length === liveCount,
    `stored=${(persisted?.transcript || []).length} live=${liveCount}`
  );
  check(
    'the persisted record also carries the stored insights',
    !!(persisted?.summary && persisted.summary.keyPoints && persisted.summary.keyPoints.length > 0),
    `summary=${JSON.stringify(persisted?.summary)}`
  );

  console.log(report.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed === 0 ? 'RESULT: widget realtime flow verified' : 'RESULT: widget realtime flow FAILED');
  if (failed > 0) process.exitCode = 1;
};

main().catch((err) => {
  console.error('widget flow crashed:', err && err.stack ? err.stack : err);
  process.exit(1);
});


/** Switch the widget to the Live Conversation tab so the pane is rendered. */
const openConversationTab = () => {
  const click = (node) => {
    if (!node || typeof node === 'string' || typeof node === 'number') return false;
    if (Array.isArray(node)) return node.some(click);
    if (
      node.props &&
      typeof node.props.onClick === 'function' &&
      collectText(node).join('').includes('Live conversation')
    ) {
      node.props.onClick();
      return true;
    }
    return node.props ? click(node.props.children) : false;
  };
  click(widgetTree);
  renderAll();
};
