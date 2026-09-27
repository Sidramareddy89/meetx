/**
 * MEETX — F1 speech-recognizer lifecycle verification.
 *
 * Runs the REAL `src/hooks/useSpeechToText.ts` unmodified in Node against a
 * faithful minimal React hook runtime (tools/react-hook-shim.mjs, aliased as
 * `react`) and a fake `SpeechRecognition`, with a component that mirrors the
 * FloatingAssistantWidget's hook call (inline arrow callbacks, new identity
 * every render) and its exact start/stop effect:
 *
 *   useEffect(() => {
 *     if (isFloatingActive) startListening(); else stopListening();
 *     return () => stopListening();
 *   }, [isFloatingActive, startListening, stopListening]);
 *
 * It proves: renders never recreate the recognizer, utterances keep flowing,
 * timestamps no longer reset per render, auto-restart after `onend` reuses the
 * instance, an intentional stop really stops, restarting works, a language
 * change is the only reconfiguration restart, and handlers always see the
 * newest callbacks.
 *
 * Run it through the bundler harness:  node tools/run-f1-verification.mjs
 */

import { useEffect, __hookTest } from 'react';
import { useSpeechToText } from '../src/hooks/useSpeechToText';

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

// ---------------------------------------------------------------- fake clock
let fakeNow = 1_000_000;
Date.now = () => fakeNow;

// --------------------------------------------------- fake SpeechRecognition
const srInstances = [];

class FakeSpeechRecognition {
  constructor() {
    this.lang = '';
    this.continuous = false;
    this.interimResults = true;
    this.startCount = 0;
    this.stopCount = 0;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    srInstances.push(this);
  }
  start() { this.startCount += 1; }
  stop() { this.stopCount += 1; }
  emitFinal(text) {
    const line = { transcript: text, isFinal: true };
    line[0] = { transcript: text };
    if (this.onresult) this.onresult({ results: [line] });
  }
  emitEnd() { if (this.onend) this.onend(); }
  emitError(error) { if (this.onerror) this.onerror(error); }
}

globalThis.window = { SpeechRecognition: FakeSpeechRecognition };

// ------------------------------------------------- widget-shaped component
const transcript = [];
const voiceQueries = [];
let renderLabel = 0;

const state = {
  isFloatingActive: true,
  language: 'en-US',
  targetLanguage: undefined,
  speakTranslations: false,
  onTranscript: null,
  onVoiceQuery: null,
};

/** New inline callbacks every render — the F1 trigger in the real widget. */
const newCallbacks = () => {
  renderLabel += 1;
  const label = renderLabel;
  state.onTranscript = (entry) => { transcript.push({ ...entry, label }); };
  state.onVoiceQuery = (text) => { voiceQueries.push({ text, label }); };
};

const Widget = (props) => {
  const api = useSpeechToText({
    language: props.language,
    targetLanguage: props.targetLanguage,
    speakTranslations: props.speakTranslations,
    onTranscriptReceived: (entry) => props.onTranscript(entry),
    onVoiceQuery: (text) => props.onVoiceQuery(text),
  });

  useEffect(() => {
    if (props.isFloatingActive) {
      api.startListening();
    } else {
      api.stopListening();
    }
    return () => {
      api.stopListening();
    };
  }, [props.isFloatingActive, api.startListening, api.stopListening]);

  return api;
};

const renderWidget = () => {
  newCallbacks();
  return __hookTest.render(() =>
    Widget({
      isFloatingActive: state.isFloatingActive,
      language: state.language,
      targetLanguage: state.targetLanguage,
      speakTranslations: state.speakTranslations,
      onTranscript: state.onTranscript,
      onVoiceQuery: state.onVoiceQuery,
    })
  );
};

const toSecs = (stamp) => {
  const [m, s] = String(stamp).split(':').map(Number);
  return m * 60 + s;
};

const main = () => {
  console.log('=== MEETX F1 recognizer-lifecycle verification ===\n');

  // ------------------------------------------------- 1. session start
  let api = renderWidget();
  check('a listening session creates exactly one recognizer', srInstances.length === 1, `instances=${srInstances.length}`);
  check(
    'the recognizer keeps the existing configuration (continuous, no interim)',
    srInstances[0].continuous === true && srInstances[0].interimResults === false
  );
  check('the recognizer uses the selected language', srInstances[0].lang === 'en-US', srInstances[0].lang);
  check('the recognizer is started once', srInstances[0].startCount === 1, `starts=${srInstances[0].startCount}`);
  check('the hook reports listening', api.isListening === true);

  const firstStartListening = api.startListening;
  const firstStopListening = api.stopListening;
  const recognizer = srInstances[0];

  // ------------------- 2. THE F1 REGRESSION: renders must not restart the mic
  for (let i = 0; i < 6; i += 1) {
    fakeNow += 250; // meeting time passes while the widget re-renders
    api = renderWidget();
    check(`render ${i + 1}: startListening identity is stable`, api.startListening === firstStartListening);
  }
  check('repeated renders never re-create the recognizer', srInstances.length === 1, `instances=${srInstances.length}`);
  check('repeated renders never re-start recognition', recognizer.startCount === 1, `starts=${recognizer.startCount}`);
  check('repeated renders never stop recognition', recognizer.stopCount === 0, `stops=${recognizer.stopCount}`);

  // ------------------------------- 3. multiple utterances + normal timestamps
  recognizer.emitFinal('First remark about the roadmap.');
  fakeNow += 1000;
  recognizer.emitFinal('Second remark about the budget.');
  api = renderWidget(); // unrelated re-render between utterances
  fakeNow += 1000;
  recognizer.emitFinal('Third remark about the deadline.');
  api = renderWidget();

  check('multiple utterances are captured in one session', transcript.length === 3, `captured=${transcript.length}`);
  const stamps = transcript.slice(0, 3).map((t) => toSecs(t.timestamp));
  check(
    'timestamps keep counting normally (no per-render reset)',
    stamps[0] === 1 && stamps[1] === 2 && stamps[2] === 3,
    `seconds=${stamps.join(',')}`
  );
  check(
    'the render between utterances did not re-anchor the timestamp baseline',
    stamps[1] - stamps[0] === 1 && stamps[2] - stamps[1] === 1,
    `deltas=${stamps[1] - stamps[0]},${stamps[2] - stamps[1]}`
  );
  check('utterances did not recreate the recognizer', srInstances.length === 1 && recognizer.startCount === 1);

  // ------------------------------------- 4. auto-restart after recognition end
  recognizer.emitError({ error: 'no-speech' });
  check('a recognition warning does not kill the session', recognizer.startCount === 1 && api.isSupported === true);
  recognizer.emitEnd();
  check('an unexpected end auto-restarts the SAME recognizer', srInstances.length === 1 && recognizer.startCount === 2, `instances=${srInstances.length} starts=${recognizer.startCount}`);
  fakeNow += 1000;
  recognizer.emitFinal('Fourth remark after a silence.');
  check(
    'timestamps continue across an auto-restart',
    toSecs(transcript[3].timestamp) === 4,
    `seconds=${toSecs(transcript[3].timestamp)}`
  );

  // ------------------------------------------- 5. unrelated state never restarts
  state.speakTranslations = true;
  api = renderWidget();
  check('toggling spoken translations does not recreate the recognizer', srInstances.length === 1 && recognizer.startCount === 2);
  check('toggling spoken translations keeps startListening stable', api.startListening === firstStartListening);

  // ------------------------------------ 6. handlers always see the newest callback
  api = renderWidget();
  const queriesBefore = voiceQueries.length;
  recognizer.emitFinal('What should I say about pricing?');
  check('question detection still routes to onVoiceQuery', voiceQueries.length === queriesBefore + 1, `queries=${voiceQueries.length - queriesBefore}`);
  check(
    'the NEWEST onVoiceQuery callback is used (no stale closure)',
    voiceQueries[voiceQueries.length - 1].label === renderLabel,
    `label=${voiceQueries[voiceQueries.length - 1] && voiceQueries[voiceQueries.length - 1].label} newest=${renderLabel}`
  );

  // ---------------------------------------------------- 7. stopping really stops
  const startsBeforeStop = recognizer.startCount;
  state.isFloatingActive = false;
  api = renderWidget();
  check('stopping the session stops the recognizer', recognizer.stopCount >= 1, `stops=${recognizer.stopCount}`);
  check('the hook reports not listening after stop', api.isListening === false);
  check('stopListening identity is stable', api.stopListening === firstStopListening);
  recognizer.emitEnd();
  check('a deliberately stopped session is NOT auto-restarted', recognizer.startCount === startsBeforeStop, `starts=${recognizer.startCount}`);
  check('no extra recognizer was created while stopped', srInstances.length === 1, `instances=${srInstances.length}`);

  // ------------------------------------------------- 8. starting again works
  state.isFloatingActive = true;
  fakeNow += 60_000;
  api = renderWidget();
  check('starting again creates and starts a fresh recognizer', srInstances.length === 2 && srInstances[1].startCount === 1, `instances=${srInstances.length}`);
  check('the new session uses the selected language', srInstances[1].lang === 'en-US', srInstances[1].lang);
  recognizer.emitFinal('Fresh session remark.');
  check(
    'a new session starts a new timestamp baseline',
    toSecs(transcript[transcript.length - 1].timestamp) === 0,
    `seconds=${toSecs(transcript[transcript.length - 1].timestamp)}`
  );

  // --------------------------------- 9. language change = allowed reconfiguration
  const beforeLanguageChange = srInstances.length;
  const startListeningBeforeLanguageChange = api.startListening;
  fakeNow += 30_000;
  state.language = 'hi-IN';
  api = renderWidget();
  const newest = srInstances[srInstances.length - 1];
  check('a language change creates a reconfigured recognizer', srInstances.length === beforeLanguageChange + 1, `instances=${srInstances.length}`);
  check('the reconfigured recognizer uses the new language', newest.lang === 'hi-IN', newest.lang);
  check('the reconfigured recognizer is started once', newest.startCount === 1, `starts=${newest.startCount}`);
  check('the previous recognizer was stopped', srInstances[beforeLanguageChange - 1].stopCount >= 1);
  check('a language change is a genuine startListening identity change', api.startListening !== startListeningBeforeLanguageChange);
  check('the hook still reports listening after reconfiguration', api.isListening === true);

  // ------------------------------------------------ 10. unmount stops the mic
  __hookTest.unmount();
  check('unmounting stops the recognizer', newest.stopCount >= 1, `stops=${newest.stopCount}`);

  console.log(report.join('\n'));
  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(failed === 0 ? 'RESULT: F1 recognizer lifecycle verified' : 'RESULT: verification failed');
  console.log(`recognizer instances created across all scenarios: ${srInstances.length} over ${renderLabel} renders`);
  return failed === 0 ? 0 : 1;
};

process.exit(main());
