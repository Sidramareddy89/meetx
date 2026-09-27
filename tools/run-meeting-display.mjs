/**
 * MEETX — harness for tools/meeting-display.test.mjs
 *
 * Bundles the REAL `src/pages/MeetingHistoryPage.tsx` and
 * `src/pages/MeetingDetailPage.tsx` (with the REAL meetingService and
 * meetingInsightService they read from) and stubs only what Node cannot run:
 *
 *   react / react/jsx-runtime   -> tools/react-hook-shim.mjs (hook runtime)
 *   react-router-dom            -> useParams / useNavigate
 *   lucide-react                -> inert icon components
 *   ./AuthContext               -> tools/auth-context-stub.mjs (test user)
 *   ../contexts/MeetingContext  -> `useMeeting` returns an injected session value
 *   firebase/*, ../config/firebase -> in-memory Firestore double
 *
 * No application logic is re-implemented: the pages load their data through the
 * real service functions and the test inspects the rendered text.
 *
 * Usage:  node tools/run-meeting-display.mjs
 * Exit code 0 = all display assertions passed.
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, 'meeting-display.test.mjs');
const reactShim = resolve(__dirname, 'react-hook-shim.mjs');
const authStub = resolve(__dirname, 'auth-context-stub.mjs');
const outfile = resolve(__dirname, '.meeting-display.tmp.mjs');

const FIREBASE_STUB = `
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
  const current = store().get(ref.path) || {};
  store().set(ref.path, options && options.merge ? { ...current, ...payload } : payload);
};
export const getDoc = async (ref) => {
  const found = store().get(ref.path);
  return { exists: () => Boolean(found), data: () => (found ? clone(found) : undefined) };
};
export const getDocs = async (q) => {
  const prefix = q.path + '/';
  let list = [...store().entries()]
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, data]) => ({ id: path.split('/').pop(), data: () => clone(data) }));
  for (const clause of (q.__where || [])) {
    list = list.filter((d) => d.data()[clause.field] === clause.value);
  }
  return { forEach: (cb) => list.forEach(cb), docs: () => list };
};
export const deleteDoc = async (ref) => { store().delete(ref.path); };
export const ref = (_storage, path) => ({ path });
export const uploadBytes = async (target) => ({ ref: target });
export const getDownloadURL = async () => 'https://stub.invalid/resource';
`;


const ROUTER_STUB = `
export const useParams = () => ({ id: globalThis.__meetxTestRouteId });
export const useNavigate = () => (to) => { globalThis.__meetxNavigatedTo = to; };
export const Link = ({ children }) => children;
export const NavLink = ({ children }) => children;
export const BrowserRouter = ({ children }) => children;
export const Routes = ({ children }) => children;
export const Route = () => null;
export const Navigate = () => null;
`;

const ICONS = [
  'ArrowLeft', 'Bell', 'CalendarClock', 'Check', 'ChevronRight', 'Clock', 'Copy',
  'ExternalLink', 'FileText', 'Lightbulb', 'ListChecks', 'Loader2', 'Mic',
  'MoreVertical', 'Paperclip', 'Play', 'Plus', 'Send', 'Share2', 'ShieldCheck',
  'Trash2', 'UploadCloud', 'Users', 'Video', 'XCircle',
];
const ICON_STUB = `${ICONS.map((n) => `export const ${n} = () => null;`).join('\n')}\n`;

const MEETING_CONTEXT_STUB = `
export const useMeeting = () => globalThis.__meetxTestMeeting || {};
export const MeetingProvider = ({ children }) => children;
export default { useMeeting, MeetingProvider };
`;

const stubPlugin = {
  name: 'meetx-display-boundaries',
  setup(buildApi) {
    const namespace = 'meetx-stub';
    buildApi.onResolve({ filter: /^react$/ }, () => ({ path: reactShim }));
    buildApi.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: reactShim }));
    // MeetingContext is matched first: the pages reach it as
    // `../contexts/MeetingContext`, the provider as `./AuthContext`.
    buildApi.onResolve({ filter: /contexts\/MeetingContext$/ }, () => ({ path: 'meeting-context-stub', namespace }));
    buildApi.onResolve({ filter: /AuthContext$/ }, () => ({ path: authStub }));
    buildApi.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: 'router-stub', namespace }));
    buildApi.onResolve({ filter: /^lucide-react$/ }, () => ({ path: 'icon-stub', namespace }));
    buildApi.onResolve({ filter: /^(firebase\/.*|\.\.\/config\/firebase)$/ }, () => ({ path: 'firebase-stub', namespace }));
    buildApi.onLoad({ filter: /.*/, namespace }, ({ path }) => {
      const contents =
        path === 'router-stub' ? ROUTER_STUB
        : path === 'icon-stub' ? ICON_STUB
        : path === 'meeting-context-stub' ? MEETING_CONTEXT_STUB
        : FIREBASE_STUB;
      return { contents, loader: 'js' };
    });
  },
};

if (!existsSync(entry) || !existsSync(reactShim) || !existsSync(authStub)) {
  console.error('! meeting-display harness inputs missing');
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
