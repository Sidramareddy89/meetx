/**
 * MEETX — free meeting allowance (quota) verification.
 *
 * Proves the real `MeetingProvider` quota behaviour against localStorage:
 *   - a fresh browser gets the full MAX_FREE_MEETINGS allowance
 *   - a counter that was EXHAUSTED under a previous, lower allowance is RESET
 *     to a full allowance instead of staying at 0 (the "raise the limit and
 *     reset" behaviour)
 *   - a counter belonging to the CURRENT allowance is resumed, never reset
 *   - starting a meeting consumes exactly one session and persists it
 *   - at 0 the session is refused (plan modal opens) and NO meeting is created
 *   - a Pro account is never charged
 *
 * Run it through the bundler harness:
 *   node tools/run-meeting-data-lifecycle.mjs free-meeting-quota.test.mjs
 */

import { __hookTest } from 'react';
import { MeetingProvider, MAX_FREE_MEETINGS } from '../src/contexts/MeetingContext';

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

const UID = 'user-quota';
const LEFT = 'meetx_free_meetings_left';
const LIMIT = 'meetx_free_meetings_limit';
const PRO = 'meetx_is_pro';

const raw = new Map();
globalThis.localStorage = {
  getItem: (k) => (raw.has(k) ? raw.get(k) : null),
  setItem: (k, v) => { raw.set(k, String(v)); },
  removeItem: (k) => { raw.delete(k); },
  clear: () => raw.clear(),
  key: (i) => [...raw.keys()][i] ?? null,
  get length() { return raw.size; },
};
globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.__meetxTestAuth = { currentUser: { uid: UID } };

const mount = () => {
  const element = __hookTest.render(() => MeetingProvider({ children: null }));
  return element && element.props ? element.props.value : null;
};
/** Simulate a page load with the given localStorage state. */
const reloadWith = (state) => {
  raw.clear();
  for (const [k, v] of Object.entries(state)) raw.set(k, v);
  __hookTest.reset();
  return mount();
};
const startOne = (topic) => {
  let ctx = mount();
  const started = ctx.startMeetingSession({
    meetingId: `meet-quota-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: UID,
    platform: 'Browser / Other',
    topic,
    selectedLanguage: 'en-US',
  });
  return { ctx: mount(), started };
};

// ------------------------------------------------------------------ cases
report.push(`MAX_FREE_MEETINGS in the build: ${MAX_FREE_MEETINGS}`);
check('the free allowance is 10 meetings', MAX_FREE_MEETINGS === 10, `got ${MAX_FREE_MEETINGS}`);

let ctx = reloadWith({});
check('a fresh browser starts with the full allowance', ctx.freeMeetingsLeft === MAX_FREE_MEETINGS, `left=${ctx.freeMeetingsLeft}`);

ctx = reloadWith({ [LEFT]: '0' });
check(
  'an EXHAUSTED counter from the old 3-meeting limit is reset to a full 10',
  ctx.freeMeetingsLeft === 10,
  `left=${ctx.freeMeetingsLeft}`
);
check(
  'the reset is persisted with the new allowance',
  raw.get(LEFT) === '10' && raw.get(LIMIT) === '10',
  `left=${raw.get(LEFT)} limit=${raw.get(LIMIT)}`
);

ctx = reloadWith({ [LEFT]: '2', [LIMIT]: '3' });
check(
  'a counter left over from the old limit (2 of 3) is reset, not resumed',
  ctx.freeMeetingsLeft === 10,
  `left=${ctx.freeMeetingsLeft}`
);

ctx = reloadWith({ [LEFT]: '4', [LIMIT]: '10' });
check('a counter under the CURRENT allowance is resumed', ctx.freeMeetingsLeft === 4, `left=${ctx.freeMeetingsLeft}`);

// The allowance under test is 4 remaining here (resumed from storage, not reset),
// so it takes exactly 4 sessions to exhaust it and the 5th must be refused.
const sessions = [startOne('Quota meeting 1')];
check('the first session is allowed while allowance remains', sessions[0].started === true);
check('starting a meeting consumes exactly one session', sessions[0].ctx.freeMeetingsLeft === 3, `left=${sessions[0].ctx.freeMeetingsLeft}`);
check('the remaining allowance is persisted', raw.get(LEFT) === '3', `stored=${raw.get(LEFT)}`);

for (let i = 2; i <= 4; i += 1) sessions.push(startOne(`Quota meeting ${i}`));
check('every session within the allowance is allowed', sessions.every((s) => s.started === true));
check(
  'the counter reaches 0 after the allowance is used up',
  sessions[sessions.length - 1].ctx.freeMeetingsLeft === 0,
  `left=${sessions[sessions.length - 1].ctx.freeMeetingsLeft}`
);

const meetingsBefore = (JSON.parse(raw.get(`meetx_meetings_${UID}`) || '[]')).length;
const blocked = startOne('Quota meeting 5');
const meetingsAfter = (JSON.parse(raw.get(`meetx_meetings_${UID}`) || '[]')).length;
check('the next session is refused once the allowance is used up', blocked.started === false);
check('the refusal opens the plan modal', blocked.ctx.isPlanModalOpen === true);
check('the refusal creates NO meeting record', meetingsAfter === meetingsBefore, `rows ${meetingsBefore} -> ${meetingsAfter}`);

// Pro accounts are never charged (setup uses the CURRENT allowance keys so the
// counter is resumed rather than reset).
ctx = reloadWith({ [LEFT]: '4', [LIMIT]: '10', [PRO]: 'true' });
check('a Pro account reads its stored allowance', ctx.freeMeetingsLeft === 4, `left=${ctx.freeMeetingsLeft}`);
const pro = startOne('Pro meeting');
check('a Pro account can always start a meeting', pro.started === true);
check('a Pro account is not charged for it', pro.ctx.freeMeetingsLeft === 4, `left=${pro.ctx.freeMeetingsLeft}`);

// A reload in the middle of the allowance keeps the real remaining count.
ctx = reloadWith({ [LEFT]: '7', [LIMIT]: '10' });
check('a reload mid-allowance keeps the real remaining count', ctx.freeMeetingsLeft === 7, `left=${ctx.freeMeetingsLeft}`);

console.log(report.join('\n'));
console.log(`\n${passed} passed, ${failed} failed`);
console.log(failed === 0 ? 'RESULT: free meeting allowance verified' : 'RESULT: free meeting allowance FAILED');
if (failed > 0) process.exitCode = 1;
