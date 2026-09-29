/**
 * MEETX — web-only architecture guard.
 *
 * MEETX ships as a browser application: the meeting, transcription, AI queue and
 * persistence all run in the web document, and the always-on-top assistant is a
 * Document Picture-in-Picture window opened by the page itself. These assertions
 * fail if a native/Tauri desktop layer creeps back in as a dependency, a script,
 * a directory or an import, so the removal of the desktop shell cannot silently
 * regress.
 *
 * Run: node tools/web-only-architecture.test.mjs
 * Exit code 0 = the codebase is web-only.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
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

const pkg = JSON.parse(read('package.json'));
const sourceFiles = walk('src').filter((file) => /\.(ts|tsx)$/.test(file));
const source = sourceFiles.map((file) => [file, read(file)]);
const withText = (needle) => source.filter(([, text]) => text.includes(needle)).map(([file]) => file);

const app = read('src/App.tsx');
const widget = read('src/components/assistant/FloatingAssistantWidget.tsx');
const floatingHook = read('src/hooks/useFloatingAssistantWindow.ts');
const viteConfig = read('vite.config.ts');
const envExample = read('.env.example');

const installedDeps = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.devDependencies || {}),
];
const nativeDeps = installedDeps.filter((name) => name.startsWith('@tauri-apps/'));
const nativeDirs = ['src-tauri', 'src/desktop'].filter((dir) => exists(dir));
const nativeScripts = Object.keys(pkg.scripts || {}).filter((name) => name.startsWith('tauri'));
const tauriImports = withText('@tauri-apps');
const nativeWindowApis = sourceFiles.filter(
  (file) => read(file).includes('WebviewWindow') || read(file).includes('getCurrentWebviewWindow')
);

const checks = [
  ['no @tauri-apps:* dependency remains', nativeDeps.length === 0, nativeDeps.join(', ')],
  ['no tauri:* npm script remains', nativeScripts.length === 0, nativeScripts.join(', ')],
  ['the native shell and bridge directories are gone', nativeDirs.length === 0, nativeDirs.join(', ')],
  ['no src file imports @tauri-apps', tauriImports.length === 0, tauriImports.join(', ')],
  ['no src file handles tauri:// events', withText('tauri://').length === 0, withText('tauri://').join(', ')],
  ['no src file builds a native webview window', nativeWindowApis.length === 0, nativeWindowApis.join(', ')],
  ['vite no longer excludes the Tauri build output', !viteConfig.includes('src-tauri')],
  ['the desktop OAuth client variable is gone', !envExample.includes('DESKTOP_CLIENT')],
  ['the app mounts exactly one MeetingProvider', (app.match(/<MeetingProvider>/g) || []).length === 1],
  ['the assistant-window bridge provider is gone', !app.includes('AssistantWindowBridgeProvider')],
  [
    'the widget reads meeting state from the web context',
    widget.includes('useMeeting()') && !widget.includes('useAssistantMeeting'),
  ],
  [
    'the widget portals into the Picture-in-Picture container',
    widget.includes('createPortal(widgetNode, floatingContainer)'),
  ],
  [
    'the floating window is Document Picture-in-Picture only',
    floatingHook.includes('documentPictureInPicture') &&
      floatingHook.includes('controller.requestWindow') &&
      !floatingHook.includes('isTauri'),
  ],
  [
    'closing the floating window never touches meeting state',
    floatingHook.includes('MeetingContext') && !floatingHook.includes('stopMeetingSession'),
  ],
];

for (const [label, passed, detail] of checks) {
  if (passed) console.log(`PASS  ${label}`);
  else console.error(`FAIL  ${label}${detail ? ` → ${detail}` : ''}`);
}

const passed = checks.filter(([, ok]) => ok).length;
console.log(`\n${passed} passed, ${checks.length - passed} failed`);
console.log(passed === checks.length ? 'RESULT: web-only architecture verified' : 'RESULT: native layer still present');
process.exitCode = passed === checks.length ? 0 : 1;
