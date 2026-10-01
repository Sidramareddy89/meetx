/**
 * MEETX — production web authentication guard.
 *
 * Phase 1 fixed authentication: one Firebase Auth source of truth, one
 * auth-state listener, no native/desktop OAuth, no local "registered" flag,
 * every error mapped to a user-facing sentence, and UID-scoped data. These
 * assertions fail if any of that regresses.
 *
 * Run: node tools/auth-architecture.test.mjs
 * Exit code 0 = the authentication architecture holds.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relPath) => readFileSync(join(root, relPath), 'utf8');
const exists = (relPath) => existsSync(join(root, relPath));

const walk = (relDir) => {
  const files = [];
  const visit = (absDir) => {
    for (const name of readdirSync(absDir)) {
      const abs = join(absDir, name);
      if (statSync(abs).isDirectory()) visit(abs);
      else files.push(relative(root, abs).split('\\').join('/'));
    }
  };
  visit(join(root, relDir));
  return files;
};

const sourceFiles = walk('src').filter((f) => /\.(ts|tsx)$/.test(f));
const source = sourceFiles.map((f) => [f, read(f)]);
const countIn = (needle) => source.reduce((n, [, t]) => n + (t.split(needle).length - 1), 0);

const authContext = read('src/contexts/AuthContext.tsx');
const meetingContext = read('src/contexts/MeetingContext.tsx');
const authErrors = read('src/services/authErrors.ts');
const meetingService = read('src/services/meetingService.ts');
const envExample = read('.env.example');
const app = read('src/App.tsx');
const protectedRoute = read('src/components/layout/ProtectedRoute.tsx');

const AUTH_PAGES = [
  'src/pages/auth/SignInPage.tsx',
  'src/pages/auth/SignUpPage.tsx',
  'src/pages/auth/ForgotPasswordPage.tsx',
];
const authPageText = AUTH_PAGES.map((f) => [f, read(f)]);
const linesWith = (texts, re) =>
  texts.flatMap(([f, t]) =>
    t
      .split('\n')
      .map((l, i) => [f, i + 1, l])
      .filter(([, , l]) => re.test(l))
  );

const signedOutReset = /logout[\s\S]{0,600}setCurrentUser\(null\)/;
const meetingReset = /previousUidRef[\s\S]{0,1400}setActiveMeeting\(null\)/;

/**
 * Strip comments so the text assertions below judge the CODE, not the prose that
 * documents it (a comment may legitimately mention the thing being forbidden).
 */
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const checks = [
  // ---- one source of truth ------------------------------------------------
  ['exactly one auth-state listener in the app', countIn('onAuthStateChanged(') === 1, `count=${countIn('onAuthStateChanged(')}`],
  ['the app mounts exactly one AuthProvider', (app.match(/<AuthProvider>/g) || []).length === 1],
  ['the session is persisted with browserLocalPersistence', authContext.includes('setPersistence(auth, browserLocalPersistence)')],

  // ---- retired local auth flag -------------------------------------------
  ['the retired meetx_user_registered flag is never written', !source.some(([, t]) => /setItem\(\s*'meetx_user_registered'/.test(t))],
  ['no source file reads isRegisteredUser any more', countIn('isRegisteredUser') === 0, `count=${countIn('isRegisteredUser')}`],
  ['the test auth stub exposes no retired auth field', !read('tools/auth-context-stub.mjs').includes('isRegisteredUser')],

  // ---- no desktop / native OAuth -----------------------------------------
  ['no loopback OAuth address anywhere in src', !source.some(([, t]) => t.includes('127.0.0.1'))],
  ['no desktop OAuth client variable', !envExample.includes('DESKTOP_CLIENT') && countIn('DESKTOP_CLIENT') === 0],
  ['no OAuth client secret in src', countIn('client_secret') === 0 && countIn('clientSecret') === 0],
  ['no native window API in the auth path', !authContext.includes('@tauri-apps') && !authContext.includes('WebviewWindow')],

  // ---- Firebase WEB auth is genuinely wired ------------------------------
  ['Google sign-in uses the Firebase web popup', authContext.includes('signInWithPopup(auth, provider)') && authContext.includes('new GoogleAuthProvider()')],
  ['email/password registration is wired', authContext.includes('createUserWithEmailAndPassword(')],
  ['email/password login is wired', authContext.includes('signInWithEmailAndPassword(')],
  ['password reset is wired', authContext.includes('sendPasswordResetEmail(')],

  // ---- no mock / fake / custom-token auth --------------------------------
  ['no custom-token or mocked sign-in', countIn('signInWithCustomToken') === 0 && countIn('mockUser') === 0 && countIn('fakeUser') === 0 && countIn('demoUser') === 0],

  // ---- logout clears the session ----------------------------------------
  ['logout signs out of Firebase', authContext.includes('fbSignOut(auth)')],
  ['logout clears the signed-in user', signedOutReset.test(authContext)],
  ['sign-out resets the in-memory meeting session', meetingContext.includes('previousUidRef') && meetingContext.includes('[currentUser?.uid]')],
  ['the meeting reset clears the active meeting', meetingReset.test(meetingContext)],

  // ---- one error-mapping module, no raw Firebase text -------------------
  ['every auth failure is mapped by one module', authErrors.includes('export const describeAuthError')],
  ['all three auth pages use the mapper', authPageText.every(([, t]) => t.includes('describeAuthError'))],
  ['no auth page renders a raw error message', linesWith(authPageText, /err\??\.message/).length === 0],
  ['no auth page hard-codes a Firebase error code', linesWith(authPageText, /'auth\//).length === 0],
  ['the superseded googleAuthErrors module is gone', !exists('src/services/googleAuthErrors.ts')],

  // ---- secrets and logging ----------------------------------------------
  ['no secret is exposed through a VITE_* variable', !/VITE_[A-Z_]*(SECRET|PASSWORD|PRIVATE_KEY)/.test(envExample)],
  ['no password is ever logged', linesWith(source, /console\.[a-z]+\([^)]*password/i).length === 0],
  ['the auth error mapper never returns the raw message', !/err\??\.message/.test(stripComments(authErrors))],
  ['the auth error mapper logs only the error code', authErrors.includes('[auth] ${code}')],

  // ---- protected route + UID isolation ----------------------------------
  ['protected routes gate on the authenticated user', protectedRoute.includes('currentUser') && protectedRoute.includes('<Navigate')],
  ['meeting records are keyed by the authenticated uid', meetingService.includes('meetx_meetings_${userId}')],
  ['Firestore meeting docs are scoped to users/{uid}', meetingService.includes("'users', userId, 'meetings'")],
  ['resource uploads are scoped to users/{uid}', meetingService.includes('users/${userId}/meetings')],
];

for (const [label, passed, detail] of checks) {
  if (passed) console.log(`PASS  ${label}`);
  else console.error(`FAIL  ${label}${detail ? ` → ${detail}` : ''}`);
}

const passed = checks.filter(([, ok]) => ok).length;
console.log(`\n${passed} passed, ${checks.length - passed} failed`);
console.log(
  passed === checks.length
    ? 'RESULT: web authentication architecture verified'
    : 'RESULT: authentication architecture regression'
);
process.exitCode = passed === checks.length ? 0 : 1;
