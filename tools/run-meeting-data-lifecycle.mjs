/**
 * MEETX — harness for tools/meeting-data-lifecycle.test.mjs
 *
 * Bundles the REAL `src/contexts/MeetingContext.tsx`, the REAL
 * `src/services/meetingService.ts` and the REAL
 * `src/services/meetingInsightService.ts` with esbuild, substituting only the
 * boundaries Node cannot provide:
 *
 *   react / react/jsx-runtime -> tools/react-hook-shim.mjs (hook runtime)
 *   ./AuthContext              -> tools/auth-context-stub.mjs (test user)
 *   firebase/*, ../config/firebase -> in-memory Firestore double
 *
 * The Firestore double is STATEFUL: `setDoc` stores the document at the exact
 * path the app uses (`meetings/{meetingId}` and
 * `users/{uid}/meetings/{meetingId}`), honours `merge`, applies the real
 * `where`/`orderBy` clauses and records every call. That lets the test assert
 * the actual Firestore document the app produces — not a localStorage-only
 * approximation — while the production Firebase SDK is never imported.
 *
 * `globalThis.__firebaseConfigured` switches between localStorage-only mode and
 * Firestore mode, exactly like the real `isFirebaseConfigured()`.
 *
 * Usage:  node tools/run-meeting-data-lifecycle.mjs
 *         node tools/run-meeting-data-lifecycle.mjs free-meeting-quota.test.mjs
 *         (an optional test file reuses the same boundary stubs)
 * Exit code 0 = all assertions passed.
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const testFile = process.argv[2] || 'meeting-data-lifecycle.test.mjs';
const entry = resolve(__dirname, testFile);
const reactShim = resolve(__dirname, 'react-hook-shim.mjs');
const authStub = resolve(__dirname, 'auth-context-stub.mjs');
const outfile = resolve(__dirname, `.${basename(testFile).replace(/\.test\.mjs$/, '')}.tmp.mjs`);

const FIREBASE_STUB = `
const calls = () => (globalThis.__meetxCalls = globalThis.__meetxCalls || []);
const store = () => (globalThis.__meetxFs = globalThis.__meetxFs || new Map());
const clone = (v) => JSON.parse(JSON.stringify(v));

export const app = { name: 'stub-app' };
export const auth = { currentUser: null };
export const db = { name: 'stub-db' };
export const storage = { name: 'stub-storage' };
export const appCheck = null;
export const isFirebaseConfigured = () => globalThis.__firebaseConfigured === true;

export const collection = (...args) => ({ path: args.slice(1).join('/') });
export const doc = (...args) => ({ path: args.slice(1).join('/') });
export const where = (field, op, value) => ({ __where: { field, op, value } });
export const orderBy = (field, dir) => ({ __orderBy: { field, dir } });
export const query = (target, ...clauses) => ({
  path: target.path,
  __where: clauses.filter((c) => c.__where).map((c) => c.__where),
  __orderBy: clauses.filter((c) => c.__orderBy).map((c) => c.__orderBy),
});

export const serverTimestamp = () => '__serverTimestamp__';

export const setDoc = async (ref, data, options) => {
  const payload = clone(data);
  calls().push({ fn: 'setDoc', path: ref.path, data: payload, merge: !!(options && options.merge) });
  const current = store().get(ref.path) || {};
  store().set(ref.path, options && options.merge ? { ...current, ...payload } : payload);
};

export const getDoc = async (ref) => {
  calls().push({ fn: 'getDoc', path: ref.path });
  const found = store().get(ref.path);
  return { exists: () => Boolean(found), data: () => (found ? clone(found) : undefined) };
};

export const getDocs = async (q) => {
  const prefix = q.path + '/';
  let list = [...store().entries()]
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, data]) => ({ id: path.split('/').pop(), path, data: () => clone(data) }));
  for (const clause of (q.__where || [])) {
    list = list.filter((d) => d.data()[clause.field] === clause.value);
  }
  for (const clause of q.__orderBy || []) {
    list = list.sort((a, b) => {
      const av = a.data()[clause.field] || 0;
      const bv = b.data()[clause.field] || 0;
      return clause.dir === 'desc' ? bv - av : av - bv;
    });
  }
  calls().push({ fn: 'getDocs', path: q.path, count: list.length });
  return { forEach: (cb) => list.forEach(cb), docs: () => list };
};

export const deleteDoc = async (ref) => {
  calls().push({ fn: 'deleteDoc', path: ref.path });
  store().delete(ref.path);
};

export const ref = (_storage, path) => ({ path });
export const uploadBytes = async (target) => ({ ref: target });
export const getDownloadURL = async () => 'https://stub.invalid/resource';
`;

const stubPlugin = {
  name: 'meetx-test-boundaries',
  setup(buildApi) {
    const namespace = 'meetx-stub';
    buildApi.onResolve({ filter: /^react$/ }, () => ({ path: reactShim }));
    buildApi.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: reactShim }));
    buildApi.onResolve({ filter: /^\.\/AuthContext$/ }, () => ({ path: authStub }));
    buildApi.onResolve({ filter: /^(firebase\/.*|\.\.\/config\/firebase)$/ }, () => ({
      path: 'firebase-stub',
      namespace,
    }));
    buildApi.onLoad({ filter: /.*/, namespace }, () => ({
      contents: FIREBASE_STUB,
      loader: 'js',
    }));
  },
};

if (!existsSync(entry) || !existsSync(reactShim) || !existsSync(authStub)) {
  console.error('! meeting-data-lifecycle harness inputs missing');
  process.exit(1);
}

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'warning',
  plugins: [stubPlugin],
});

const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
rmSync(outfile, { force: true });
process.exit(typeof result.status === 'number' ? result.status : 1);
