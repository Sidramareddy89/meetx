---
trigger: always_on
glob:
description: Durable engineering rules for the MEETX project.
---

# MEETX — project rules

## Architecture (do not regress)

- MEETX is a **web-only** React + Vite + TypeScript app. There is no desktop/native layer: never add
  `@tauri-apps/*`, a `src-tauri/` or `src/desktop/` directory, a `tauri*` npm script, a `tauri://`
  listener or a native `WebviewWindow`. `node tools/web-only-architecture.test.mjs` fails if any of
  them returns.
- The always-on-top assistant is a **Document Picture-in-Picture** window opened by the page
  (`useFloatingAssistantWindow`) and filled by `createPortal`. Closing or hiding it must never end a
  meeting: session state lives in `MeetingContext`.
- Exactly one `MeetingProvider` and one `AuthProvider`; `MeetingProvider` must stay inside
  `AuthProvider`. Cross-cutting state goes in a context, not through props.

## Before claiming anything works

- Run `npm run verify` (`tsc --noEmit` → `npm test` → `vite build`). A change is not "done" until it
  is exit 0 and the build succeeded. Use `npm run test:live` when LLM calls changed.
- Add or extend an assertion in `tools/*.test.mjs` for every behaviour you change; the harnesses
  bundle the real `src/**`, so they test shipping code.

## Code quality

- TypeScript strict, functional components + hooks, named exports (`export const X: React.FC`).
- Tailwind utility classes inline; icons from `lucide-react`; don't add libraries without a reason.
- No `console.debug`, dead code or commented-out blocks left behind. Files must stay UTF-8 clean —
  `node tools/encoding-hygiene.test.mjs` fails on mojibake, raw control characters or U+FFFD.
- All persistence goes through `src/services/meetingService.ts`, always carrying `userId`.

## Product honesty (non-negotiable)

- Never invent meeting content: summaries, key points and action items must come from the real
  transcript, and the UI must say "not available" when there is nothing real to show.
- Never pretend a capability exists: if speech recognition is unavailable, or remote audio cannot be
  captured, say so in the UI instead of listening silently.
- Secrets must not ship in the client bundle; prefer the `localStorage` runtime key override over
  `VITE_*` keys, and never log a key or an `Authorization` header.

