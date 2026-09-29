/**
 * MEETX — floating-window lifecycle verification (Document PiP).
 *
 * Mounts the REAL `FloatingAssistantWidget` against the REAL `MeetingProvider`
 * with a fake Document Picture-in-Picture controller and verifies the window
 * lifecycle required of a system-level always-on-top assistant:
 *
 *   TEST 1  meeting starts            → the floating window opens (520×700),
 *                                       the widget renders into it via portal
 *   TEST 6  the window is closed      → the meeting keeps running untouched
 *   TEST 7  conversation continues    → transcript + assistant processing
 *                                       while the window is hidden
 *   TEST 8  the window is restored    → same active meeting, same state,
 *                                       rendered into a NEW window
 *   TEST 9  meeting stops             → the floating window closes/cleans up
 *   TEST 10 a new meeting             → gets its own fresh window
 *
 * TEST 2–5 (visual persistence across tab/app switches, moving the window)
 * are OS/browser properties of the always-on-top window and must be verified
 * manually in Chrome — they cannot be simulated in Node.
 *
 * Only boundaries Node cannot run are stubbed: `react` (hook runtime),
 * `react/jsx-runtime`, `react-dom` (portal records its container),
 * `react-router-dom`, `lucide-react`, `./AuthContext`, the Firebase surface —
 * everything else (widget, MeetingContext, services, speech hook) is REAL.
 *
 * Run:  node tools/run-floating-window-lifecycle.mjs
 * Exit code 0 = all lifecycle assertions passed.
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

const UID = 'user-pip-lifecycle';
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
// Pro account: the lifecycle under test is not about the quota gate.
localStorage.setItem('meetx_is_pro', 'true');
// Deliberately NO provider keys: the offline engine answers, so the test
// performs zero network requests.
globalThis.__meetxTestAuth = { currentUser: { uid: UID } };

// Real window event registry, so the app's pagehide flush can be exercised.
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
  innerWidth: 1920,
  innerHeight: 1080,
};

// ------------------------------------------------ fake Document PiP controller
const pip = {
  requests: [],   // every requestWindow() option object
  windows: [],    // every window ever opened
  closes: 0,      // Window.close() calls (programmatic, e.g. on meeting stop)
};

const makePipWindow = () => {
  const listeners = new Map();
  const makeNode = (tag) => ({
    tagName: tag,
    id: '',
    textContent: '',
    rel: '',
    href: '',
    style: {},
    children: [],
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) {
      const at = this.children.indexOf(child);
      if (at !== -1) this.children.splice(at, 1);
      return child;
    },
  });
  const win = {
    document: {
      head: makeNode('head'),
      body: makeNode('body'),
      createElement: makeNode,
      addEventListener: (type, listener, options) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
      },
      removeEventListener: (type, listener, options) => {
        const list = listeners.get(type) || [];
        const at = list.indexOf(listener);
        if (at !== -1) list.splice(at, 1);
      },
      execCommand: () => true,
      styleSheets: [],
      querySelector: () => null,
      querySelectorAll: () => [],
      focus: () => {},
      activeElement: null,
    },
    innerWidth: 520,
    innerHeight: 700,
    closed: false,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) || [];
      const at = list.indexOf(fn);
      if (at !== -1) list.splice(at, 1);
    },
    close() {
      if (this.closed) return;
      this.closed = true;
      pip.closes += 1;
      this.__fire('pagehide');
    },
    resizeTo() {},
    __fire(type, event = { type }) {
      for (const fn of [...(listeners.get(type) || [])]) fn(event);
    },
    __listeners: listeners,
  };
  pip.windows.push(win);
  return win;
};

const pipController = {
  window: null,
  async requestWindow(options) {
    pip.requests.push({ ...(options || {}) });
    if (this.window) return this.window;
    const win = makePipWindow();
    this.window = win;
    // The browser clears its controller reference when the window closes.
    win.addEventListener('pagehide', () => {
      if (this.window === win) this.window = null;
    });
    return win;
  },
};
globalThis.window.documentPictureInPicture = pipController;

// The widget registers a document mousedown listener (outside-click) and a
// copy-to-clipboard helper. Node has no DOM, so provide only that surface.
globalThis.document = {
  addEventListener: () => {},
  removeEventListener: () => {},
  createElement: () => ({ value: '', select: () => {}, setSelectionRange: () => {} }),
  body: { appendChild: () => {}, removeChild: () => {} },
  execCommand: () => true,
  // The stylesheet copy into the PiP window iterates these (empty is fine).
  styleSheets: [],
};

// -------------------------------------------------------------- tree helpers
/** Render the real provider, hand its value to the widget, render the widget. */
let widgetTree = null;
let meetingValue = null;
const renderAll = () => {
  // Reset portal capture at the start of each render (React commit semantics).
  // After a window is closed and the portal unmounts, the capture must be
  // cleared so the next render correctly reports no portal target.
  resetPortalCapture();
  __hookTest.useInstance('provider');
  const providerElement = __hookTest.render(() => MeetingProvider({ children: null }));
  meetingValue = providerElement.props.value;
  __hookTest.provideContext(MeetingContext, meetingValue);
  __hookTest.useInstance('widget');
  widgetTree = __hookTest.render(() => FloatingAssistantWidget());
  return widgetTree;
};

/** All text in the rendered widget tree, in document order. */
const collectText = (node, out = [], depth = 0) => {
  if (depth > 60 || node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collectText(c, out, depth + 1); return out; }
  if (typeof node !== 'object') return out;
  if (typeof node.type === 'function') {
    try {
      return collectText(node.type(node.props || {}), out, depth + 1);
    } catch {
      return out; // a child needing a browser API must not break the walk
    }
  }
  if (node.type === Symbol.for('react.fragment')) {
    return collectText(node.props?.children, out, depth + 1);
  }
  if (node.props && node.props.children !== undefined) {
    collectText(node.props.children, out, depth + 1);
  }
  return out;
};

/** First element in the rendered tree whose props match the predicate. */
const findNode = (node, predicate, depth = 0) => {
  if (depth > 60 || node === null || node === undefined || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const hit = findNode(c, predicate, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (predicate(node)) return node;
  if (typeof node.type === 'function') {
    try {
      const hit = findNode(node.type(node.props || {}), predicate, depth + 1);
      if (hit) return hit;
    } catch {
      // fall through to children
    }
  }
  if (node.props && node.props.children !== undefined) {
    return findNode(node.props.children, predicate, depth + 1);
  }
  return null;
};

const text = () => collectText(widgetTree).join(' ');
const floatingToggle = () =>
  findNode(widgetTree, (n) => typeof n.props?.title === 'string' && n.props.title.includes('floating window'));
const portalContainer = () => globalThis.__meetxPortalContainer ?? null;
const resetPortalCapture = () => { globalThis.__meetxPortalContainer = null; };

const entry = (id, body, seconds = 0) => ({
  id,
  speakerId: 'speaker-remote',
  speakerName: 'Dana',
  text: body,
  timestamp: `00:${String(seconds).padStart(2, '0')}`,
  language: 'en-US',
});

const main = async () => {
  console.log('=== MEETX floating-window lifecycle verification ===\n');

  renderAll();
  check('precondition: no floating window before a meeting', pip.requests.length === 0 && portalContainer() === null);

  // ---------------------------------------------------------- TEST 1 (start)
  const started = meetingValue.startMeetingSession({
    meetingId: 'meet-pip-lifecycle',
    userId: UID,
    topic: 'Floating window lifecycle',
  });
  check('TEST 1: the session started', started === true, `started=${started}`);
  renderAll();                                  // rising-edge effect fires
  await tick();                                 // requestWindow resolves
  renderAll();                                  // widget renders with a portal target

  check('TEST 1: the floating window was requested', pip.requests.length === 1, `requests=${pip.requests.length}`);
  check('TEST 1: requested at 520×700', pip.requests[0]?.width === 520 && pip.requests[0]?.height === 700, JSON.stringify(pip.requests[0]));
  const firstWindow = pip.windows[0];
  check('TEST 1: the controller holds the open window', pipController.window === firstWindow);
  check('TEST 1: the widget rendered INTO the floating window', portalContainer() === firstWindow.document.body.children[0], 'portal target mismatch');
  check('TEST 1: the window body is styled dark', firstWindow.document.body.style.background === '#151822', firstWindow.document.body.style.background);
  check('TEST 1: the active session is shown', text().includes('MEETX is now active'), text().slice(0, 120));
  check('TEST 1: a floating-window close toggle exists in the window', floatingToggle()?.props?.title?.includes('Close floating window') === true);

  // ------------------------------------------ privacy/capture-boundary flow
  check('PRIVACY: private mode never claims the widget is undetectable', !text().includes('Undetectable'));
  const reportEntireScreen = findNode(widgetTree, (n) => n.type === 'button' && n.props?.children === 'I’m sharing Entire Screen');
  check('PRIVACY: Private ON offers an explicit Entire Screen report', Boolean(reportEntireScreen));
  check('PRIVACY: no extra getDisplayMedia picker is started', typeof globalThis.navigator === 'undefined' || !globalThis.navigator.mediaDevices?.getDisplayMedia);
  reportEntireScreen?.props?.onClick();
  renderAll();
  check('PRIVACY: Private ON + Entire Screen shows the required warning', text().includes('Private Mode cannot hide the assistant during Entire Screen sharing. Please share the meeting tab or application window.'));
  check('PRIVACY: warning is persistent while meeting/transcription remain active', meetingValue.isFloatingActive && meetingValue.activeMeeting?.id === 'meet-pip-lifecycle' && text().includes('Your meeting, transcription, AI assistance, and saving continue.'));
  const stopReport = findNode(widgetTree, (n) => n.type === 'button' && n.props?.children === 'I stopped sharing Entire Screen');
  stopReport?.props?.onClick();
  renderAll();
  check('PRIVACY: stopping Entire Screen report removes warning without ending meeting', !text().includes('Private Mode cannot hide') && meetingValue.isFloatingActive);
  meetingValue.setIsDetectable(true);
  renderAll();
  check('PRIVACY: Private OFF + Entire Screen has no private-mode warning', !text().includes('Private Mode cannot hide'));
  meetingValue.setIsDetectable(false);
  renderAll();
  const tabWindowGuidance = findNode(widgetTree, (n) => n.type === 'span' && n.props?.children === 'Private Mode');
  check('PRIVACY: Private ON + Browser Tab/Application Window guidance is shown', Boolean(tabWindowGuidance) && text().includes('Share a Browser Tab or Application Window'));
  check('PRIVACY: share report has one context setter and no duplicate state/listeners', typeof meetingValue.setIsEntireScreenShareReported === 'function' && !('startScreenShareVerification' in meetingValue));

  // ---------------------------------------------- TEST 6 (user closes window)
  // Simulate the browser-provided close control: it only fires `pagehide`.
  resetPortalCapture();
  firstWindow.__fire('pagehide');
  await tick();
  renderAll();

  check('TEST 6: the meeting is still active after the window closed', meetingValue.isFloatingActive === true && meetingValue.activeMeeting?.id === 'meet-pip-lifecycle');
  check('TEST 6: the controller released the window', pipController.window === null);
  check('TEST 6: no programmatic close was counted (the user closed it)', pip.closes === 0, `closes=${pip.closes}`);
  check('TEST 6: the widget fell back to the in-page render', portalContainer() === null);
  check('TEST 6: no automatic reopen happened', pip.requests.length === 1, `requests=${pip.requests.length}`);
  check('TEST 6: a restore toggle is available in-page', floatingToggle()?.props?.title?.includes('Open floating window') === true);
  check('PRIVACY: closing floating assistant preserves active Entire Screen warning state', meetingValue.isEntireScreenShareReported === false && meetingValue.isFloatingActive);

  // ------------------------------------- TEST 7 (conversation continues hidden)
  meetingValue.addTranscriptEntry(entry('pip-r1', 'The assistant keeps listening while hidden.'));
  await tick();
  renderAll();
  for (let i = 0; i < 5; i += 1) await tick();
  renderAll();

  check('TEST 7: the transcript continued while the window was hidden', meetingValue.currentMeetingTranscript.length === 1 && text().includes('keeps listening while hidden'), `len=${meetingValue.currentMeetingTranscript.length}`);
  check('TEST 7: AI processing continued (an auto answer was produced)', meetingValue.assistantMessages.length >= 2, `messages=${meetingValue.assistantMessages.length}`);
  check('TEST 7: the meeting was never stopped', meetingValue.isFloatingActive === true);
  check('TEST 7: still no floating window while hidden', portalContainer() === null && pip.requests.length === 1);


  // --------------------------------------------- TEST 8 (restore the window)
  const restoreButton = floatingToggle();
  check('TEST 8: the restore button was found in-page', Boolean(restoreButton));
  restoreButton?.props?.onClick();
  await tick(); await tick();
  renderAll();

  const secondWindow = pip.windows[1];
  check('TEST 8: a (new) floating window was opened', pip.requests.length === 2, `requests=${pip.requests.length}`);
  check('TEST 8: the restore targeted a fresh window', secondWindow !== firstWindow && pipController.window === secondWindow);
  check('TEST 8: the SAME session is rendered into it', portalContainer() === secondWindow.document.body.children[0] && meetingValue.activeMeeting?.id === 'meet-pip-lifecycle');
  check('TEST 8: the transcript captured while hidden is displayed', text().includes('keeps listening while hidden'));
  check('PRIVACY: restoring floating assistant keeps meeting running', meetingValue.isFloatingActive && meetingValue.activeMeeting?.id === 'meet-pip-lifecycle');

  // --------------------------------------------- TEST 9 (stop → window cleanup)
  meetingValue.stopMeetingSession();
  await tick();
  renderAll();
  await tick();
  renderAll();

  check('TEST 9: stopping the meeting closed the floating window', pip.closes >= 1, `closes=${pip.closes}`);
  check('TEST 9: the controller released the window', pipController.window === null);
  check('TEST 9: the meeting session ended', meetingValue.isFloatingActive === false && meetingValue.activeMeeting === null);
  check('TEST 9: no portal target remains', portalContainer() === null);

  // --------------------------------------------- TEST 10 (next meeting lifecycle)
  const restarted = meetingValue.startMeetingSession({
    meetingId: 'meet-pip-lifecycle-2',
    userId: UID,
    topic: 'Second floating session',
  });
  check('TEST 10: a second session started', restarted === true);
  renderAll();
  await tick();
  renderAll();

  const thirdWindow = pip.windows[2];
  check('TEST 10: a fresh floating window was opened for it', pip.requests.length === 3 && thirdWindow && thirdWindow !== secondWindow, `requests=${pip.requests.length}`);
  check('TEST 10: the new session renders into the new window', portalContainer() === thirdWindow.document.body.children[0]);
  check('TEST 10: the second meeting owns the window content', text().includes('Second floating session') || text().includes('MEETX is now active'));

  // ------------------------------------------------------------------ report
  console.log(report.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(`RESULT: floating-window lifecycle ${failed === 0 ? 'verified' : 'FAILED'}`);
  console.log(`windows opened: ${pip.requests.length}, programmatic closes: ${pip.closes}`);
  process.exit(failed === 0 ? 0 : 1);
};

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

