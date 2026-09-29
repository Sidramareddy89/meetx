/**
 * MEETX — harness for tools/floating-window-lifecycle.test.mjs
 *
 * Bundles the REAL `FloatingAssistantWidget` + `MeetingProvider` (and
 * everything they pull in: meetingService, meetingInsightService,
 * aiAssistantService, the REAL useSpeechToText hook) with esbuild,
 * substituting only what Node cannot run:
 *
 *   react / react/jsx-runtime    -> tools/react-hook-shim.mjs (hook runtime)
 *   react-dom                    -> portal records its container, renders inline
 *   react-router-dom             -> useNavigate
 *   lucide-react                 -> inert icon components
 *   ./AuthContext                -> tools/auth-context-stub.mjs (test user)
 *   firebase/*, ../config/firebase -> in-memory Firestore double
 *
 * NOTE: `useSpeechToText` is NOT stubbed here — the real hook runs against
 * Node (its Web-Speech-absent fallback path), which also exercises the new
 * `hostWindow` wiring without a browser.
 *
 * Usage:  node tools/run-floating-window-lifecycle.mjs
 * Exit code 0 = all floating-window lifecycle assertions passed.
 */

import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, 'floating-window-lifecycle.test.mjs');
const reactShim = resolve(__dirname, 'react-hook-shim.mjs');
const authStub = resolve(__dirname, 'auth-context-stub.mjs');
const outfile = resolve(__dirname, '.floating-window-lifecycle.tmp.mjs');

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
export const onSnapshot = () => () => {};
export const deleteDoc = async (ref) => { store().delete(ref.path); };
export const ref = (_storage, path) => ({ path });
export const uploadBytes = async (target) => ({ ref: target });
export const getDownloadURL = async () => 'https://stub.invalid/resource';
`;

const ROUTER_STUB = `
export const useNavigate = () => (to) => { globalThis.__meetxNavigatedTo = to; };
export const useParams = () => ({ id: globalThis.__meetxTestRouteId });
export const Link = ({ children }) => children;
export const NavLink = ({ children }) => children;
`;

// Inert icons used by the widget and its panes.
const ICONS = [
  'AlertTriangle', 'ArrowRight', 'Bell', 'X', 'CalendarClock', 'Check', 'ChevronDown', 'ChevronUp', 'Clock',
  'Copy', 'CreditCard', 'Eye', 'EyeOff', 'FileText', 'Languages', 'Layers', 'Lightbulb',
  'ListChecks', 'Loader2', 'Maximize2', 'MessageSquare', 'Mic', 'Minimize2', 'MoreHorizontal',
  'Paperclip', 'PictureInPicture', 'Play', 'Plus', 'RotateCcw', 'Send', 'ShieldCheck', 'Sparkles', 'Square',
  'Trash2', 'Users', 'Video', 'Volume2', 'VolumeX', 'XCircle',
];
const ICON_STUB = `${ICONS.map((n) => `export const ${n} = () => null;`).join('\n')}\n`;

/**
 * The floating window renders the widget through a React portal into
 * the Document PiP window. Node has no DOM (and no real react-dom), so the
 * portal records its container for assertions and renders the children
 * inline — the same tree the browser would show inside the window.
 */
const REACT_DOM_STUB = `
export const createPortal = (children, container) => {
  globalThis.__meetxPortalCalls = (globalThis.__meetxPortalCalls || 0) + 1;
  globalThis.__meetxPortalContainer = container;
  return children;
};
export default { createPortal };
`;

const stubPlugin = {
  name: 'meetx-floating-window-boundaries',
  setup(buildApi) {
    const namespace = 'meetx-stub';
    buildApi.onResolve({ filter: /^react$/ }, () => ({ path: reactShim }));
    buildApi.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: reactShim }));
    buildApi.onResolve({ filter: /^react-dom$/ }, () => ({ path: 'react-dom-stub', namespace }));
    buildApi.onResolve({ filter: /AuthContext$/ }, () => ({ path: authStub }));
    buildApi.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: 'router-stub', namespace }));
    buildApi.onResolve({ filter: /^lucide-react$/ }, () => ({ path: 'icon-stub', namespace }));
    buildApi.onResolve({ filter: /^(firebase\/.*|\.\.\/config\/firebase)$/ }, () => ({ path: 'firebase-stub', namespace }));
    buildApi.onLoad({ filter: /.*/, namespace }, ({ path }) => {
      const contents =
        path === 'router-stub' ? ROUTER_STUB
        : path === 'icon-stub' ? ICON_STUB
        : path === 'react-dom-stub' ? REACT_DOM_STUB
        : FIREBASE_STUB;
      return { contents, loader: 'js' };
    });
  },
};

if (!existsSync(entry) || !existsSync(reactShim) || !existsSync(authStub)) {
  console.error('! floating window harness inputs missing');
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

