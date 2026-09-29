# MEETX — Multilingual Online Meeting Assistant

A web app that listens to a live meeting in the browser, transcribes it on the fly, and answers
questions about what is being said — grounded strictly in the conversation, the notes and the
documents you supplied. It is a **web-only build**: no desktop shell, no native bridge, no server
side; everything runs in the browser and persists to `localStorage`, optionally synced to Firebase
(Firestore + Storage).

Stack: **React 18 · TypeScript (strict) · Vite 5 · Tailwind 3 · Firebase 10 · Web Speech API ·
Document Picture-in-Picture**. Full engineering handover (architecture, data model, feature and gap
inventory): [`HANDOFF.md`](./HANDOFF.md).

---

## Requirements

| | |
|---|---|
| Node.js | 20 or newer (verified on 24.x) |
| Browser | **Chrome/Edge 116+** recommended — live transcription needs the Web Speech API and the always-on-top assistant window needs Document Picture-in-Picture. Firefox/Safari still run the app, but transcription produces nothing and the assistant stays in-page |
| Microphone | granted per-origin by the browser |

## Quick start

```bash
npm install
cp .env.example .env      # optional: fill in Firebase / LLM values, or leave blank
npm run dev               # http://localhost:5173
```

With blank Firebase values the app runs in **local mode**: accounts and meetings are kept in
`localStorage` on this device only. Fill the `VITE_FIREBASE_*` values to switch to Firebase mode
(see `.env.example` for every variable and its meaning).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR on port 5173 (bound to all interfaces for tunnel testing) |
| `npm run build` | Type check (`tsc`) then production build into `dist/` |
| `npm run preview` | Serves the built `dist/` locally — the closest thing to production |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm test` | Encoding hygiene + web-only architecture guards and 9 offline harnesses (404 assertions) |
| `npm run test:live` | Same suite plus a real Gemini/Groq probe — needs network and keys in `.env` |
| `npm run verify` | `typecheck` → `test` → `build`: the full release gate |
| `pwsh -File run_checks.ps1` | Windows convenience wrapper for `verify` + the live probe, with a PASS/FAIL summary |

The offline suite bundles the **real** `src/**` code with esbuild and stubs only the browser
boundaries (React hook runtime, speech recognition, `localStorage`, Firestore) — so the code under
test is the code that ships. No test framework is used and no test file is bundled into `dist/`.


## Project layout

```
index.html               Vite entry, SPA shell
src/
  main.tsx               React root
  App.tsx                routes + providers (Auth, Meeting)
  components/
    assistant/           FloatingAssistantWidget + live brief / conversation panes
    layout/              AppLayout, TopNavBar, ProtectedRoute
    modals/              ChoosePlanModal (free-plan gate)
    common/              brand marks
  contexts/              AuthContext (accounts + profile), MeetingContext (session, transcript, gate)
  hooks/                 useSpeechToText, useFloatingAssistantWindow, useProfileGate
  pages/                 Splash, Landing/SignIn/SignUp/ForgotPassword, Home, History, Detail, Profile
  services/              aiAssistantService, llmProviders, meetingService, meetingInsightService,
                         meetingContextService, translationService, meetingHistoryService, firebase
  types/                 Meeting, transcript, user models
tools/                   offline harnesses + live probes (never bundled, never deployed)
dist/                    build output (git-ignored)
```

## How the pieces fit

- **Transcription** — `useSpeechToText` wraps the Web Speech API and emits finalized remarks into
  `MeetingContext`, which merges (never replaces) the transcript and flushes it on stop, on meeting
  switch and on `pagehide`/`beforeunload`.
- **Answers** — `aiAssistantService` decides what context a question needs, then `llmProviders` walks
  a provider/model fallback chain (Gemini, then Groq) and, if every provider fails, falls back to a
  deterministic offline template engine so the widget never goes blank.
- **Always-on-top assistant** — `useFloatingAssistantWindow` opens a browser Document
  Picture-in-Picture window and the widget is portalled into it. Closing that window never ends the
  meeting: session state lives in `MeetingContext`, and the widget returns in-page.
- **Persistence** — `meetingService` writes to `localStorage` first and, when Firebase is configured,
  mirrors to Firestore/Storage with per-user isolation.

## Deploying

`npm run build` produces a static bundle in `dist/` — host it anywhere that serves static files (any
CDN or static host; `npm run preview` for a local check). It is a single-page app, so rewrite unknown
paths to `index.html`. HTTPS is required for microphone access.

> **Before going public:** the LLM keys documented in `.env.example` are `VITE_*` variables, so Vite
> compiles them into the client bundle. Prefer supplying keys at runtime from `localStorage`
> (see `HANDOFF.md` §G9) rather than shipping them inside the JavaScript.

## Known limitations

- Live transcription is microphone-only; the browser's echo cancellation prevents capturing the
  remote side of a call. The app says so in-product.
- Document Picture-in-Picture is Chromium-only, and an OS window's position cannot be read or set
  (browser API limit).
- The free plan allows 3 meetings; "upgrade" is a local flag, not a payment flow.
- Firebase mode (security rules, composite index) has not been exercised against a live project.
