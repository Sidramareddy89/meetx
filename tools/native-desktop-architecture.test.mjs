/**
 * Structural checks for the Tauri desktop bridge. These assertions verify the
 * source wiring without pretending to simulate an OS window or capture API.
 * Run: node tools/native-desktop-architecture.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const pkg = JSON.parse(read('../package.json'));
const app = read('../src/App.tsx');
const host = read('../src/desktop/DesktopAssistantHost.tsx');
const bridge = read('../src/desktop/assistantBridge.tsx');
const nativeWindow = read('../src/desktop/nativeAssistantWindow.ts');
const browserWindow = read('../src/hooks/useDesktopAssistantWindow.ts');
const layout = read('../src/components/layout/AppLayout.tsx');
const context = read('../src/contexts/MeetingContext.tsx');
const rust = read('../src-tauri/src/lib.rs');
const config = JSON.parse(read('../src-tauri/tauri.conf.json'));
const capabilities = JSON.parse(read('../src-tauri/capabilities/default.json'));

const checks = [
  ['Tauri dev and build scripts exist', Boolean(pkg.scripts['tauri:dev'] && pkg.scripts['tauri:build'])],
  ['desktop shell has one configured main native window', config.app.windows.length === 1 && config.app.windows[0].title === 'MEETX'],
  ['native assistant is a separate Tauri top-level WebviewWindow', nativeWindow.includes("new WebviewWindow('assistant'")],
  ['native assistant is always-on-top and resizable', nativeWindow.includes('alwaysOnTop: true') && nativeWindow.includes('resizable: true')],
  ['native assistant creation checks one stable label before creating', nativeWindow.includes("WebviewWindow.getByLabel('assistant')")],
  ['closing assistant hides it while meeting remains mounted', nativeWindow.includes('event.preventDefault()') && nativeWindow.includes('assistant.hide()')],
  ['main owner can restore the assistant window', nativeWindow.includes('existing.show()') && nativeWindow.includes('existing.setFocus()')],
  ['native widget drag is delegated to OS window dragging', read('../src/components/assistant/FloatingAssistantWidget.tsx').includes('startDragging()')],
  ['assistant window route does not mount another MeetingProvider', app.includes('<AssistantWindowBridgeProvider>') && app.indexOf('if (isAssistantWindow())') < app.indexOf('<MeetingProvider>')],
  ['main/session app mounts one authoritative MeetingProvider', (app.match(/<MeetingProvider>/g) || []).length === 1],
  ['assistant bridge sends widget commands to main', bridge.includes("emitTo('main', 'meetx:assistant-command'")],
  ['main host executes assistant commands against useMeeting owner', host.includes('const meeting = useMeeting()') && host.includes("case 'askAssistant'")],
  ['meetingId and active meeting are synchronized to assistant', bridge.includes("'activeMeeting'") && bridge.includes('activeMeeting: value.activeMeeting')],
  ['transcript and LLM actions route back to owner', host.includes("case 'addTranscriptEntry'") && host.includes('owner.askAssistant(query, action, options)')],
  ['stopping meeting closes native assistant', host.includes('closeNativeAssistantWindow()') && host.includes("case 'stopMeetingSession'")],
  ['Private Mode reads the existing isDetectable source of truth', host.includes('meeting.isDetectable') && bridge.includes("'isDetectable'")],
  ['Windows request is checked through GetWindowDisplayAffinity', rust.includes('GetWindowDisplayAffinity') && rust.includes('affinity == 0x11')],
  ['macOS is reported as unsupported/not guaranteed', rust.includes('#[cfg(target_os = "macos")]') && rust.includes('ProtectionStatus::Unsupported') && rust.includes('unavailable/not guaranteed on macOS')],
  ['web mode retains Document Picture-in-Picture', browserWindow.includes('controller.requestWindow') && browserWindow.includes('!isTauri()')],
  ['web mode stays outside Tauri branch in app routing', app.includes('return (\n    <BrowserRouter>') && browserWindow.includes('documentPictureInPicture')],
  ['desktop session owner remains usable while assistant hidden', layout.includes('Show assistant') && layout.includes('End meeting')],
  ['content protection status distinguishes requested, active, unsupported and unknown', bridge.includes("'requested' | 'active' | 'unsupported' | 'unknown'")],
  ['only default and narrow create/content-protection permissions are granted', capabilities.windows.includes('assistant') && capabilities.permissions.includes('core:webview:allow-create-webview-window') && capabilities.permissions.includes('core:window:allow-set-content-protected')],
];

for (const [label, passed] of checks) {
  if (!passed) console.error(`FAIL  ${label}`);
  else console.log(`PASS  ${label}`);
}
const passed = checks.filter(([, ok]) => ok).length;
console.log(`\n${passed} passed, ${checks.length - passed} failed`);
process.exitCode = passed === checks.length ? 0 : 1;
