/**
 * MEETX — harness for tools/f2f3-persistence.test.mjs
 *
 * The test exercises the REAL `src/services/meetingService.ts`. To run it in
 * Node, this harness bundles it with esbuild and substitutes ONLY the Firebase
 * import boundary (`firebase/*` and `src/config/firebase`) with an in-memory
 * recording stub. No application source is modified: the stub records
 * setDoc/updateDoc/ref calls so the test can assert the exact Firestore
 * payloads (merge flag, presence/absence of `transcript`) and the storage
 * paths that the app would produce in the browser.
 *
 * Usage:  node tools/run-f2f3-verification.mjs
 * Exit code 0 = all persistence assertions passed.
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, 'f2f3-persistence.test.mjs');
const outfile = resolve(__dirname, '.f2f3-bundle.tmp.mjs');

const STUB_SOURCE = `
const calls = () => (globalThis.__meetxCalls = globalThis.__meetxCalls || []);

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

export const setDoc = async (target, data, options) => {
  calls().push({ fn: 'setDoc', path: target && target.path, data, options });
};
export const getDoc = async () => ({ exists: () => false, data: () => undefined });
export const getDocs = async () => ({ forEach: () => {} });
export const deleteDoc = async (target) => {
  calls().push({ fn: 'deleteDoc', path: target && target.path });
};
export const ref = (_storage, path) => {
  calls().push({ fn: 'ref', path });
  return { path };
};
export const uploadBytes = async (target) => ({ ref: target });
export const getDownloadURL = async () => 'https://stub.invalid/resource';
`;

const firebaseBoundaryStub = {
  name: 'firebase-boundary-stub',
  setup(buildApi) {
    const namespace = 'firebase-boundary-stub';
    const filter = /^(firebase\/.*|\.\.\/config\/firebase)$/;
    buildApi.onResolve({ filter }, () => ({ path: 'stub', namespace }));
    buildApi.onLoad({ filter: /.*/, namespace }, () => ({
      contents: STUB_SOURCE,
      loader: 'js',
    }));
  },
};

if (!existsSync(entry)) {
  console.error(`! test entry not found: ${entry}`);
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
  plugins: [firebaseBoundaryStub],
});

const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
rmSync(outfile, { force: true });
process.exit(typeof result.status === 'number' ? result.status : 1);
