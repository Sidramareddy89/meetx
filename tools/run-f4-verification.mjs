/**
 * MEETX — harness for tools/f4-assistant-context.test.mjs
 *
 * Bundles the REAL `src/contexts/MeetingContext.tsx` (and everything it
 * imports: the real aiAssistantService → llmProviders prompt builder, the real
 * meetingService, the real meetingInsightService) with esbuild, substituting
 * only the boundaries Node cannot provide:
 *
 *   react / react/jsx-runtime → tools/react-hook-shim.mjs (hook runtime)
 *   ./AuthContext             → tools/auth-context-stub.mjs (fixed test user)
 *   firebase/*, ../config/firebase → in-memory stub (no network)
 *
 * The harness never re-implements application logic; it only supplies globals
 * (localStorage, window timers, fetch) and captures the actual HTTP request the
 * assistant would send to the LLM.
 *
 * Usage:  node tools/run-f4-verification.mjs
 * Exit code 0 = all F4 assertions passed.
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, 'f4-assistant-context.test.mjs');
const reactShim = resolve(__dirname, 'react-hook-shim.mjs');
const authStub = resolve(__dirname, 'auth-context-stub.mjs');
const outfile = resolve(__dirname, '.f4-bundle.tmp.mjs');

// Firebase is intentionally UNCONFIGURED here so the real service layer uses its
// localStorage store; the Firestore/storage surface still has to link.
const FIREBASE_STUB = `
export const app = { name: 'stub-app' };
export const auth = { currentUser: null };
export const db = { name: 'stub-db' };
export const storage = { name: 'stub-storage' };
export const appCheck = null;
export const isFirebaseConfigured = () => globalThis.__firebaseConfigured === true;
export const collection = (...args) => ({ path: args.slice(1).join('/') });
export const doc = (...args) => ({ path: args.slice(1).join('/') });
export const query = (target) => target;
export const where = (...args) => ({ where: args });
export const orderBy = (...args) => ({ orderBy: args });
export const serverTimestamp = () => '__serverTimestamp__';
export const setDoc = async () => {};
export const getDoc = async () => ({ exists: () => false, data: () => undefined });
export const getDocs = async () => ({ forEach: () => {} });
export const onSnapshot = () => () => {};
export const deleteDoc = async () => {};
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
  console.error('! F4 harness inputs missing');
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
