# MEETX — Developer Handoff

> Multilingual real-time AI meeting assistant (React + Vite + TypeScript + Tailwind + Firebase).
> This document is the single source of truth for picking the project up: how to run it, what
> actually exists in the code today, how it is wired, and what is still missing/broken.
>
> Snapshot date: **2026-09-29 (Web-only architecture)** · Verified on this machine against the
> working tree in `E:\Meetin advisor` (git repository, branch `main`).
> Everything below was verified by reading the source and running the commands listed in
> [§11 Verification](#11-verification--how-to-check-claims-in-this-doc).

---

## 1. TL;DR for the next developer

| Item | Status |
|---|---|
| `npm run typecheck` | ✅ **passes clean** (exit 0, zero output) — re-verified 2026-09-29 |
| `npm run build` | ✅ works — rebuilt 2026-09-29 (`dist/assets/index-*.js` ≈ 1,034 kB / 270 kB gzip; Vite warns above 500 kB, no code-splitting yet) |
| Firebase | ⚠️ **configured with real values** in `.env` — no placeholders remain, so the app runs in Firebase mode, not demo mode. Security rules and the `userId ASC + createdAt DESC` composite index are still unproven (G3) |
| AI responses | ✅ **Dual-Pipeline & rich detail:** Pipeline 1 continuous context + Pipeline 2 QA context decision engine. Response prompts updated for structured, detailed explanations (Part 6) with max tokens expanded to 1024. Duplicate QUERY+ASSIST responses eliminated via `voiceQueryHandledIdRef`. |
| Answer grounding | ✅ Per-question context: the newest 12 remarks always travel, older remarks are pulled back in when relevant, uploaded documents are retrieved rather than dumped, and everything is character-budgeted (§9 F4) |
| Transcription | ⚠️ Real, via browser Web Speech API (useSpeechToText). Microphone only — remote meeting audio is not captured due to echo cancellation (documented in-product). |
| Persistence | Works, localStorage-first with Firestore when configured. The transcript is **merged, never replaced**, and flushed on stop, on meeting switch and on `pagehide`/`beforeunload` (G1, G2 closed) |
| Tests | ✅ **100% PASS** — 404 assertions across 11 offline harnesses, re-run 2026-09-29 (5 encoding hygiene, 14 web-only architecture guard, 43 floating-window lifecycle, 96 meeting-data lifecycle, 49 LLM answering, 44 F1 recognizer, 39 widget realtime flow, 38 F4 context, 31 meeting display, 27 F2/F3 persistence, 18 free-meeting quota). `npm test` runs them all. |
| Git | ✅ repository with history on `main`, remote `origin` → `github.com/Sidramareddy89/meetx` |
| Secrets | 🔴 **P1 — LLM keys ship inside the client bundle.** verified 2026-09-28: the Groq key prefix is present in `dist/assets/*.js`. See G9 |
| Dead code | `LiveMeetingChatPanel.tsx` deleted (G11 closed) |
| Desktop shell | **Removed** — this is a web-only build: no `src-tauri/`, no `src/desktop/`, no `@tauri-apps/*` dependency, no native bridge. The always-on-top assistant is the browser Document Picture-in-Picture window, and `node tools/web-only-architecture.test.mjs` fails if any of that creeps back. |

---

## 2. What the product is

MEETX is a web app ("Multilingual Online Meeting Assistant") with three core screens plus auth:

1. **Home** — configure a meeting (platform, link, topic, pasted notes, up to 5 resource files)
   and launch the assistant.
2. **Live assistant** — a draggable floating widget (`position: fixed`, `z-[9999]`, so it stays above
   the page; in Chromium it also detaches into a real always-on-top **Document Picture-in-Picture**
   window with its own button) that (a) transcribes speech in the selected language (plus optional
   target-language subtitles via keyless translation), (b) answers real-time questions ("What should
   I say?", follow-up questions, recap, assist) and (c) can be resized, hidden and — in Private Mode —
   kept out of a *Tab / Application Window* capture, with an explicit warning when the user reports
   sharing the *Entire Screen*.
3. **Meeting History + Meeting Details** — per-user list of saved meetings; the detail page shows
   the *real* transcript-derived summary, key points, action items, resources and share/minutes
   export.

Auth (email/password, Google popup, password reset) and a 3-free-meetings → Pro upgrade gate wrap
the whole thing.

---

## 3. How to run

```powershell
cd 'E:\Meetin advisor'
npm install
npm run dev        # Vite dev server → http://localhost:5173  (host: true, so LAN-accessible)

npm run typecheck  # tsc --noEmit (currently clean)
npm test           # 2 guards + 9 offline harnesses, 404 assertions
npm run build      # tsc && vite build → dist/
npm run preview    # serve the production build
npm run verify     # typecheck + test + build: the full release gate
```

Environment: Node **v24.21.0**, npm **11.19.0** (verified on this machine).
Vite config: `vite.config.ts` — `@vitejs/plugin-react`, `server.port = 5173`, `server.host = true`.

### Browser requirements

* **Chrome/Edge (Chromium)** — required for `webkitSpeechRecognition`. Firefox/Safari will render
  the UI but transcription silently never produces text (see §10, gap G5).
* A reachable microphone over `localhost` or HTTPS.

---

## 4. Environment variables & runtime modes

`.env` is not committed (`.gitignore` covers `.env*`); `.env.example` is the template. Only names
prefixed `VITE_` reach the browser bundle — everything else is Node-only (used by the `tools/`
probes).

**Current state of the local `.env`:** it holds **real Firebase values** for
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`,
`VITE_FIREBASE_APPCHECK_SITE_KEY`, **and** `VITE_GEMINI_API_KEY` + `VITE_GROQ_API_KEY`. So a dev
server started on this machine runs in **Firebase mode with live LLM calls**, not demo mode.

| Variable | Purpose | In `.env` today |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web config + mode switch | real value → `isFirebaseConfigured() === true` |
| `VITE_FIREBASE_AUTH_DOMAIN` / `_PROJECT_ID` / `_STORAGE_BUCKET` / `_MESSAGING_SENDER_ID` / `_APP_ID` | Firebase web config | real values |
| `VITE_FIREBASE_APPCHECK_SITE_KEY` | optional App Check (reCAPTCHA v3) | present; debug token used on localhost (`src/config/firebase.ts`) |
| `VITE_GEMINI_API_KEY` | Gemini provider | real value — **compiled into `dist/assets/*.js`** (G9) |
| `VITE_GROQ_API_KEY` | Groq provider (fallback) | real value — **verified present in the built bundle** (G9) |
| `VITE_GEMINI_MODELS` / `VITE_GROQ_MODELS` | optional comma-separated model order | not set → defaults in `llmProviders.ts` |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `GEMINI_MODELS` / `GROQ_MODELS` | non-prefixed duplicates so the Node probes can read them | present (never bundled) |
| `VITE_FIREBASE_MEASUREMENT_ID` | Analytics | present in `.env` but **read by nothing** in `src/` — dead, safe to remove |
| runtime alternative | `localStorage['meetx_gemini_api_key']` / `['meetx_groq_api_key']` | not set — this is the path that keeps keys out of the bundle |

`src/config/firebase.ts` exports `app`, `auth`, `db`, `storage`, `appCheck` **and**
`isFirebaseConfigured()`, which returns `false` when the API key is missing, `'your_api_key_here'`
or `'demo-api-key'`. Every service branches on this flag:

* **Demo mode:** auth is faked in `localStorage` (`meetx_demo_user`, uid derived deterministically
  from the email via a djb2-style hash in `demoUidForEmail`), all meetings live in `localStorage`,
  resource files are inlined as data URLs.
* **Firebase mode:** real auth (`browserLocalPersistence`), `users/{uid}` profile doc,
  `meetings/{meetingId}` + `users/{uid}/meetings/{meetingId}` mirror docs, and Storage uploads under
  `users/{uid}/meetings/{meetingId}/resources/{fileName}`.
  ⚠️ Firebase mode is **unverified end-to-end** — the values are real, but no test run has confirmed
  security rules or the `userId ASC + createdAt DESC` composite index (G3).

---

## 5. Tech stack

| Layer | Choice |
|---|---|
| Framework | React 18.3 (`react-jsx`, function components only) |
| Build | Vite 5.2, TypeScript 5.4 (`strict: true`, `noEmit`) |
| Routing | `react-router-dom` 6.23 (`BrowserRouter`) |
| Styling | Tailwind CSS 3.4 + `postcss` + `autoprefixer`; custom `meetx.*` palette and Inter font in `tailwind.config.js`; global styles + custom scrollbar in `src/index.css` |
| Icons | `lucide-react` |
| Backend | Firebase 10.12 (Auth, Firestore, Storage) — optional |
| AI | Gemini (`generativelanguage.googleapis.com`, OpenAI-compatible + native endpoints) → Groq (`api.groq.com`) fallback chain in `llmProviders.ts`, then the built-in offline template engine, so the widget never goes blank |
| Speech | Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) |
| Translation | Keyless HTTP services in `translationService.ts` (MyMemory → LibreTranslate → Google), cached per text/language |
| Always-on-top window | Document Picture-in-Picture (`documentPictureInPicture.requestWindow`), Chromium 116+ |

No state library (Context API only), no form library, no test framework — the offline harnesses in
`tools/` are plain Node scripts run by `npm test` — and no ESLint config yet.

---

## 6. Repo map (every source file, with its job)

```
E:\Meetin advisor
├─ index.html                  Vite entry; Inter font preload; inline SVG favicon; title "MEETX — Multilingual Online Meeting Assistant"
├─ package.json                name "meetx" v1.0.0, type: module; scripts dev / build / preview / typecheck / test / test:live / verify
├─ README.md                   the short version of this document: install, run, build, deploy, verify, limitations
├─ vite.config.ts              react plugin; port 5173; host true; allowedHosts true (public-tunnel testing)
├─ tsconfig.json               strict, ES2020, noEmit, jsx react-jsx, include: ["src"]
├─ tailwind.config.js          content: index.html + src/**/*.{js,ts,jsx,tsx}; meetx palette; Inter
├─ postcss.config.js           tailwindcss + autoprefixer
├─ run_checks.ps1              Windows wrapper: typecheck → npm test → build → live LLM probe, with a PASS/FAIL summary
├─ .env / .env.example         every web variable documented; `.env` holds real Firebase values and is git-ignored
├─ .gitignore                  node_modules, dist, .env*, *.log, transient harness bundles (tools/.*.tmp.mjs)
├─ .agents/rules/copilot.md    durable engineering rules (web-only architecture, verify before claiming, product honesty)
├─ tools/                      offline harnesses + live probes (never bundled, never deployed) — §11
└─ src/
   ├─ main.tsx                 createRoot + StrictMode
   ├─ App.tsx                  AuthProvider → MeetingProvider → Routes (full route table, §7)
   ├─ index.css                @tailwind layers, body font/colors, scrollbar styling
   ├─ vite-env.d.ts            Vite client types
   ├─ config/firebase.ts       Firebase init + isFirebaseConfigured()
   ├─ types/
   │  ├─ meeting.ts            Meeting, MeetingTranscriptEntry, MeetingResource, MeetingSummary,
   │  │                        MeetingPlatform, SupportedLanguage, SUPPORTED_LANGUAGES (8), getLanguageDisplayName()
   │  └─ user.ts               UserProfile
   ├─ contexts/
   │  ├─ AuthContext.tsx       register/login/google/reset/logout, demoUidForEmail, demo-mode user in localStorage
   │  └─ MeetingContext.tsx    the app's brain: language, meeting config, live transcript, assistant messages,
   │                           floating-widget state, card size, 3-free-meetings quota, plan modal, session start/stop
   ├─ hooks/
   │  ├─ useFloatingAssistantWindow.ts Document Picture-in-Picture lifecycle: open/close, portal container, host window state
   │  ├─ useSpeechToText.ts    Web Speech API wrapper: startListening / stopListening / isSupported / isTranslating
   │  └─ useProfileGate.ts     sends accounts missing name/phone to /complete-profile once auth settles
   ├─ services/
   │  ├─ aiAssistantService.ts question orchestration + context decision + large offline template engine
   │  ├─ llmProviders.ts       Gemini → Groq provider/model chain with redacted diagnostics; never logs keys (561 lines)
   │  ├─ meetingService.ts     uploadMeetingResourceFile / saveMeeting / getMeetingById /
   │  │                        getUserMeetings / updateStoredMeeting (Firestore + localStorage, quota-safe)
   │  ├─ meetingInsightService.ts buildSummaryFromTranscript / buildShareableMinutes (real transcript only)
   │  ├─ meetingContextService.ts PIPELINE 2 relevance decision engine (related → retrieval + LLM, unrelated → direct LLM)
   │  ├─ meetingHistoryService.ts matchesMeetingHistoryRange — one period-filter rule shared with the harness
   │  └─ translationService.ts keyless realtime translation: MyMemory → LibreTranslate → Google, cached per text/language
   ├─ components/
   │  ├─ common/MeetXLogo.tsx              "Meet(X)" wordmark + animated equalizer bars; sizes sm|md|lg|xl, dark|light
   │  ├─ layout/AppLayout.tsx              protected-page shell: FloatingAssistantWidget + ChoosePlanModal + TopNavBar + <Outlet/>
   │  ├─ layout/ProtectedRoute.tsx         spinner while auth loads → <Navigate to="/landing"> when no user
   │  ├─ layout/TopNavBar.tsx              back/forward, brand, global search, detectability pill, language dropdown, profile menu
   │  ├─ assistant/FloatingAssistantWidget.tsx  the draggable live assistant (983 lines; portals into the PiP window)
   │  ├─ assistant/LiveBriefPane.tsx       live brief: agenda, topics and checkable action items
   │  ├─ assistant/LiveConversationPane.tsx live transcript grouped by speaker, with per-block copy
   │  └─ modals/ChoosePlanModal.tsx        plan/upgrade + settings-style modal (sidebar tabs; only Billing + upgrade buttons work)
   └─ pages/
      ├─ SplashPage.tsx                branded start screen; auto-forwards to /home (signed in) or /signin (returning), else → /landing
      ├─ auth/LandingPage.tsx          hero + Sign in / Create account CTAs
      ├─ auth/SignUpPage.tsx           email/password/display-name registration
      ├─ auth/SignInPage.tsx           email/password + Google
      ├─ auth/ForgotPasswordPage.tsx   sends Firebase reset mail (no-op in demo mode)
      ├─ CompleteProfilePage.tsx       name + mobile step for accounts that are missing them (Google sign-ups)
      ├─ HomePage.tsx                  meeting configuration form (platform, link, topic, notes, resources) + Start MEETX
      ├─ MeetingHistoryPage.tsx        per-user meeting list, period + text filters via meetingHistoryService
      ├─ MeetingDetailPage.tsx         real transcript summary/key points/actions + resources + share + Launch Assistant bar
      └─ ProfilePage.tsx               view/edit profile (name, phone, photo) → Auth + Firestore users/{uid}
```

---

## 7. Route map (`src/App.tsx`)

| Path | Element | Protection |
|---|---|---|
| `/` | `SplashPage` | public (auto-redirect logic inside) |
| `/landing` | `LandingPage` | public |
| `/signup` | `SignUpPage` | public |
| `/signin` | `SignInPage` | public |
| `/forgot-password` | `ForgotPasswordPage` | public |
| `/home` | `HomePage` | `ProtectedRoute` + `AppLayout` |
| `/complete-profile` | `CompleteProfilePage` | `ProtectedRoute` + `AppLayout` |
| `/profile` | `ProfilePage` | `ProtectedRoute` + `AppLayout` |
| `/history` | `MeetingHistoryPage` | `ProtectedRoute` + `AppLayout` |
| `/meeting/:id` | `MeetingDetailPage` | `ProtectedRoute` + `AppLayout` |
| `/live` | `<Navigate to="/home" replace />` | legacy alias kept for old links |
| `*` | `<Navigate to="/" replace />` | fallback |

Provider order matters: `BrowserRouter → AuthProvider → MeetingProvider` — `MeetingProvider` calls
`useAuth()`, so it must stay inside `AuthProvider`.

`AppLayout` is what makes the floating widget and plan modal **global** across the authenticated pages
(`/home`, `/complete-profile`, `/profile`, `/history`, `/meeting/:id`); they will disappear if a new
page is added outside that layout branch.

---

## 8. Data model & persistence (`src/types/meeting.ts`, `src/services/meetingService.ts`)

```ts
Meeting {
  id, userId, title, platform, meetingLink?, topic,
  selectedLanguage,        // BCP-47 CODE (e.g. 'en-US') — the value the recognizer uses
  resources?, pastedNotes?, createdAt, duration?, recordingUrl?,
  transcript: MeetingTranscriptEntry[],
  summary?, status: 'scheduled' | 'live' | 'completed'
}

MeetingTranscriptEntry { id, speakerId, speakerName?, text, timestamp, language? }
MeetingResource        { id, name, url?, type, size?, content? }
MeetingSummary         { overview?, keyPoints: string[], actions: string[] }
```

* `SUPPORTED_LANGUAGES` (8, all genuinely usable by the recognizer): `en-US`, `en-GB`, `es-ES`,
  `fr-FR`, `de-DE`, `hi-IN`, `ja-JP`, `zh-CN`.
* `getLanguageDisplayName(codeOrName)` normalises stored values (older records stored display names)
  — use it wherever a language is rendered.
* Platforms offered on Home: Google Meet, Zoom, Microsoft Teams, Webex, Browser / Other.

### localStorage keys (complete list)

| Key | Written by | Meaning |
|---|---|---|
| `meetx_demo_user` | `AuthContext` | demo-mode `UserProfile` JSON (only when Firebase is unconfigured) |
| `meetx_user_registered` | `AuthContext` | `'true'` → SplashPage shows "welcome back" and routes to `/signin` |
| `meetx_meetings_<uid>` | `meetingService` | **the real per-user meeting store** (array of `Meeting`) |
| `meetx_free_meetings_left` | `MeetingContext` | quota counter, default `3` |
| `meetx_is_pro` / `meetx_plan_type` | `MeetingContext.upgradeToPro` | Pro switch + chosen plan id |
| `meetx_gemini_api_key` | (read-only today) | alternative way to inject a Gemini key |

Quota safety in `meetingService.ts`:
* `MAX_LOCAL_RESOURCE_URL_CHARS = 250 * 1024` — larger data-URL resources persist as **metadata only**
  (name/type/size) so `localStorage` never dies.
* Every `setItem` is wrapped: on `QuotaExceededError` the list is rewritten with metadata-only
  resources and a warning is logged.

### Firestore shape (only used when `isFirebaseConfigured()` is true)

| Path | Content |
|---|---|
| `users/{uid}` | profile: uid, displayName, email, photoURL, createdAt/updatedAt/lastLoginAt |
| `meetings/{meetingId}` | full `Meeting` doc; reads verify `data.userId === userId` |
| `users/{uid}/meetings/{meetingId}` | thin mirror (`meetingId`, topic, platform, createdAt) for fast listing |
| Storage `users/{uid}/meetings/{meetingId}/resources/{fileName}` | uploaded resource bytes |

⚠️ `getUserMeetings` issues `where('userId','==',uid) + orderBy('createdAt','desc')` → requires a
**composite index** in the Firebase console; otherwise it throws and the function silently degrades to
the local store. Also note it returns Firestore data only when `meetings.length > 0`, so local-only
meetings can be hidden whenever Firestore has at least one record.

---

## 9. Feature inventory → where it lives

| # | Feature | Code | Notes |
|---|---|---|---|
| F1 | Splash / branded boot | `SplashPage`, `MeetXLogo` | progress bar on a 300 ms interval; routes to `/home` (signed in), `/signin` (returning) or stays for new visitors |
| F2 | Auth (email, Google, reset) | `AuthContext`, `pages/auth/*` | real Firebase when configured; deterministic hashed-email uid otherwise |
| F3 | Language selection (8) | `TopNavBar`, `types/meeting.ts` | drives recognizer `lang`; stored per meeting as a code |
| F4 | Private / Detectable mode | `TopNavBar` / widget settings / `HomePage` banner | drives the widget's privacy UI: Private Mode pill, "Entire Screen" warning with acknowledge/dismiss, and the Private Sharing Guide; the always-on-top window itself is the Document PiP window (G4) |
| F5 | Meeting configuration | `HomePage` | validates topic, platform, `http(s)` link; resources: `pdf\|doc\|docx\|txt`, ≤15 MB each, ≤5 files |
| F6 | Persist meeting before session | `HomePage.handleStartMeetX` → `saveMeeting` | record is saved **first**, then the session starts from that record (Phase 4 intent: a session is never orphaned from its user) |
| F7 | Live transcription | `useSpeechToText` + `MeetingContext.addTranscriptEntry` | `continuous = true`, `interimResults = false`, auto-restart on `onend`; speaker hardcoded `Speaker` / `Interviewer` |
| F8 | Debounced transcript persistence | `MeetingContext.persistTranscriptDebounced` | 1.2 s debounce → `updateStoredMeeting(..., { transcript, status: 'live' })` |
| F9 | AI assistant (4 pills + free text) | `FloatingAssistantWidget` → `MeetingContext.askAssistant` → `aiAssistantService` | action types `assist` / `say` / `followup` / `recap` / `query`; returns text + up to 3 follow-up chips |
| F10 | Live Gemini path | `aiAssistantService.callGeminiApiIfAvailable` | `gemini-1.5-flash`, `maxOutputTokens 500`, `temperature 0.3`, 6 s `AbortController`; any failure → offline engine |
| F11 | Offline template engine | `aiAssistantService.generateAssistantResponseOffline` | ~9 intent branches (transcript questions, coding, comparisons, behavioural, fallback); always appends a **language-transparency note** because templates are English-only |
| F12 | Floating widget UX | `FloatingAssistantWidget` | drag by handle, Hide/Show pill, card sizes compact/normal/expanded (`max-h-36 / max-h-56 / max-h-[380px]`), stop button, MX logo → `/home`, code-block renderer with per-block copy |
| F13 | Keyboard shortcuts | widget `keydown` effect (L365-392) | `Ctrl+\` hide/show · `Ctrl+Enter` send (or "what should I say") · `Ctrl+Shift+R` clear assistant messages · `Ctrl+Shift+\|` stop session (no browser shortcut is shadowed) |
| F14 | Free-plan gate | `MeetingContext.startMeetingSession` + `ChoosePlanModal` | 3 free meetings; at 0 the session is refused and the plan modal opens; `upgradeToPro('pro' \| 'pro_undetectable')` only flips `localStorage` (no payment) |
| F15 | Meeting history | MeetingHistoryPage | period filter all (default) / 1day / 1week / 1month / custom, text filter, sorted createdAt desc. Fixed bucket filtering bugs. |
| F16 | Meeting details + insights | MeetingDetailPage, meetingInsightService | overview/key points/actions derived from actual transcript. Enhanced extraction for Actions/Deadlines preserving assignees and dates in storage. |
| F17 | Share / minutes export | `MeetingDetailPage.handleShare` | `navigator.share` when available, else copies `buildShareableMinutes()` (+ detail URL) to the clipboard |
| F18 | Ask about a past meeting | `MeetingDetailPage` fixed bottom bar | starts/reuses the live context so questions run through the same assistant pipeline |
| F19 | Live "Meeting Inquiries" log | `MeetingDetailPage` | renders `assistantMessages` only while `activeMeeting.id === meeting.id` |
| F20 | Verification harness | `tools/phase4-service-test.html` | 5-step service-layer check: upload → save → read own → cross-user read denied → list membership |

### Live-session lifecycle (read this before touching sessions)

```
HomePage.handleStartMeetX
  └─ uploadMeetingResourceFile() per file        → data URL (no Firebase) or Storage URL
  └─ saveMeeting(userId, {...}, meet-<ts>)       → localStorage meetx_meetings_<uid> [+ Firestore]
  └─ startMeetingSession({ meeting: savedMeeting, userId })
        ├─ quota check (refuse + open plan modal when freeMeetingsLeft <= 0 and not Pro)
        ├─ decrement quota (non-Pro only)
        ├─ setActiveMeeting(...) / startSessionTime = now / clear transcript+messages
        ├─ seed assistant intro message ("MEETX is now active and listening in <language>")
        └─ isPlatformClosed = true, isFloatingActive = true  → widget mounts, mic starts

During session
  addTranscriptEntry()  → debounce 1.2 s → updateStoredMeeting({ transcript, status: 'live' })
  askAssistant(q, type) → assistant + user messages kept in memory; no persistence of chat

stopMeetingSession()
  └─ flush pending debounce timer
  └─ ONLY IF transcript is non-empty: updateStoredMeeting({ transcript, status: 'completed', duration })
  └─ isFloatingActive = false, activeMeeting = null, transcript cleared
```

Gotchas baked into this flow:
* The transcript lives **only in memory** apart from the 1.2 s debounce, and the chat log is never
  persisted at all.
* `stopMeetingSession` is the only writer of `status: 'completed'`.
* Starting the assistant again from `MeetingDetailPage` consumes another free-meeting credit even
  though the meeting already exists.

---

## 10. Known gaps, risks and TODO backlog

Priority: **P1** = user-visible / data-loss / blocking, **P2** = product-quality, **P3** = cleanup.

> **Status snapshot, 2026-09-29.** Closed: **G1, G2, G4, G5, G6, G10, G11, G12, G13**. Partial: **G3** (`.env` holds real Firebase values, but rules/index are unverified) and **G14** (git history + 11 offline harnesses, no lint/CI yet). Still open: **G7, G8, G9, G15, G16** — **G9** is P1 because the LLM keys are present in the shipped bundle.

| ID | Pri | Issue | Evidence / fix sketch |
|---|---|---|---|
| G1 | P1 | **Meetings can be stuck in `status: 'live'` forever.** `stopMeetingSession` only writes `{ status: 'completed', duration, transcript }` when `liveTranscript.length > 0`. If the user's mic is denied, or they run a meeting with silence, the record is never completed and History keeps showing the green "Live" pill. | `MeetingContext.tsx` L250-259 — move the `status: 'completed'` (+ duration) write outside the `liveTranscript.length > 0` guard, persisting the transcript only when it exists. |
| G2 | P1 | **No flush on tab close / refresh.** The transcript is written on a 1.2 s debounce and the chat log is never persisted, so up to ~1.2 s of speech (plus the whole assistant conversation) is lost on an unexpected exit. | Add a `beforeunload`/`pagehide` flush in `MeetingContext` that synchronously writes the pending transcript (or lower the debounce and persist chat alongside). |
| G3 | P1 | **Firebase mode is unproven.** `.env` holds real Firebase values, but no Firebase branch (auth, Firestore writes, Storage uploads, cross-device history) has been exercised against a live project from this repo. `getUserMeetings` additionally needs a composite index and swallows errors. | Create the index (`userId` ASC + `createdAt` DESC), add/deploy the security rules, then re-run the §11 harness in Firebase mode and check the console for the `Firestore ... warning` logs. |
| G4 | P2 | **Undetectability & Screen Sharing:** Resolved via Document PiP + Tab/Window sharing architecture. Clear user guidance on HomePage and widget warns against Entire Screen capture and directs to supported Tab/Window share. |
| G5 | P2 | **Unsupported-browser transcription.** CLOSED 2026-09-29 — `isSupported` is surfaced through `LiveConversationPane`, which says “speech recognition is not available in this browser — open MEETX in Chrome or Edge” instead of implying it is listening. The hook still sets `isListening = true` and returns, so the mic dot pulses even though nothing will be captured. | Optional polish: don't report `isListening` when no recognizer exists. |
| G6 | P2 | **Language changes mid-session.** CLOSED 2026-09-29 - `startListening` is recreated when `language`/`hostWindow` change (its dependency list is deliberately `[language, hostWindow, …]`) and the widget's start effect depends on `startListening`, so picking another language restarts recognition with the new `lang`. `tools/run-f1-verification.mjs` asserts the reconfiguration. | Optional polish: the intro message's language name is still the one captured when the session started. |
| G7 | P2 | **Uploaded resources contribute no text to answers.** The retrieval pipeline now exists and is asserted (`selectRelevantResources` builds a "Knowledge Base" block for the prompt and Pipeline 2 counts documents as context), but `uploadMeetingResourceFile` stores `content: file.name` only (`meetingService.ts` L118), so PDFs/DOCX/TXT still contribute a filename, not their contents. `pastedNotes` (and the topic) do reach the prompt. | Extract text in the browser (pdf.js / mammoth) or server-side into `resource.content`, then let the existing retrieval code pick it up — no prompt changes needed. |
| G8 | P2 | **Transcription only hears the local microphone.** `useSpeechToText` uses the Web Speech API and hardcodes `speakerId: 'Speaker'` / `speakerName: 'Interviewer'` (`useSpeechToText.ts` L172, L185, L210). Remote participants are inaudible unless the user plays them through speakers and the mic picks them up; there is no diarisation, speaker labels or video-platform integration. | Capture tab/system audio (`getDisplayMedia({ audio: true })`) and run it through a real STT service with speaker labels; until then, the limitation is documented in-product. |
| G9 | P2 | **Key handling is only half solved.** `llmProviders.ts` (L12, L17) reads the keys from `VITE_*` env values **or** the `meetx_gemini_api_key` / `meetx_groq_api_key` `localStorage` overrides, and `getLlmDiagnostics()` returns redacted provider/model/outcome/latency data (keys and headers are never logged). But there is still **no UI** to set a key, and a `VITE_*` key is compiled into `dist/assets/*.js` (see the TL;DR "Secrets" row). | Add a settings field that writes the `localStorage` override, and move LLM calls behind a server/Cloud Function proxy for production. |
| G10 | P3 | **Keyboard shortcuts.** CLOSED 2026-09-29 - clear-messages is now `Ctrl+Shift+R`, so the browser's plain `Ctrl+R` reload is no longer shadowed (`FloatingAssistantWidget.tsx` L381). | Nothing pending. |
| G11 | P3 | **Dead / duplicated code.** `LiveMeetingChatPanel.tsx` has been **deleted** (2026-09-29), which also removed the duplicated `renderMessageContent`; `simulateSpeech` no longer exists anywhere; `hideMeetxHidesWidget` is now written by the widget's settings toggle. | Nothing pending — re-check before adding new shared components that they are actually imported. |
| G12 | P3 | **Stray artifact.** CLOSED 2026-09-29 - `tsc_check.txt` is deleted and `.gitignore` now lists it so a future `tsc > tsc_check.txt` cannot be committed. | Use `npm run typecheck` / `npx tsc --noEmit` for type checks. |
| G13 | P3 | **Test harness ships to production.** CLOSED 2026-09-29 — the file now lives in `tools/phase4-service-test.html`, so it is no longer part of the `public/` bundle. | Nothing to do beyond keeping it out of `public/`. |
| G14 | P3 | **No lint and no CI.** ESLint is not configured and there is no workflow file, so the 2 static guards + 9 behavioural harnesses (404 assertions) only run when a human types `npm test` / `npm run verify` / `.\run_checks.ps1`. | Add ESLint (or `tsc`-only) plus `npm run verify` as a CI job so every push is checked — the commands already exist. |
| G15 | P3 | **Demo-mode auth is not a security boundary.** `demoUidForEmail` is a reversible hash, uid/email live in `localStorage`, and cross-user isolation in demo mode relies on well-behaved client code. | Fine for demos — make sure Firebase mode is on for anything real, and add Firestore/Storage rules (`request.auth.uid == uid`) before shipping. |
| G16 | P3 | **Cosmetic/behavioural leftovers:** `selectedLanguage` (`MeetingContext.tsx` L122), `targetLanguage` (L176) and `isDetectable` (L121) are plain state — they reset to defaults on reload; `ChoosePlanModal` sidebar tabs other than Billing are decorative; `upgradeToPro()` grants Pro for free (it only writes `meetx_is_pro` / `meetx_plan_type`, L209-210). What *is* persisted: the free-meeting counter and limit (L139-143, L374-375). | Persist the three preferences in `localStorage` (or per meeting) and gate real entitlements server-side. |

### Suggested order of work for the next session

Still open: **G3, G7, G8, G9, G14, G15, G16**. Closed on 2026-09-29: G1, G2, G4, G5, G6, G10, G11, G12, G13.

1. **G3** stand up / verify the real Firebase project (auth + Firestore + Storage + the
   `userId ASC + createdAt DESC` index + rules) and re-run the §11 harness in Firebase mode; confirm
   every `console.warn(...)` path.
2. **G9** stop shipping keys: a settings field that writes the `localStorage` override, then a
   server/Cloud Function proxy so `dist/assets/*.js` contains no key.
3. **G7** extract real document text into `resource.content` (pdf.js / mammoth) — the retrieval and
   prompt plumbing is already there.
4. **G8** tab-audio capture (`getDisplayMedia({ audio: true })`) and real speaker labels; this is the
   single biggest transcription limitation.
5. **G14** wire `npm run verify` into CI (and add ESLint) so the 404 assertions run on every push.
6. **G15 + G16** harden entitlements (server-side) and persist the language / detectability
   preferences.

---

## 11. Verification — how to check claims in this doc

### Automated checks available today

```powershell
npm run verify        # the release gate: typecheck -> npm test -> production build
npm run typecheck     # tsc --noEmit                      exit 0, no output (verified 2026-09-29)
npm test              # 2 static guards + 9 offline harnesses, 404 assertions (verified 2026-09-29)
npm run build         # dist/ (assets/index-D89AJOkc.js 1,034 KB / 270 KB gzip, index-oe3t05xM.css 47 KB)
npm run test:live     # npm test + a real Gemini/Groq probe (needs network + keys in .env)
```

### Offline harness suite (no network, no keys)

```powershell
npm test             # runs, in order, tools/encoding-hygiene.test.mjs + tools/web-only-architecture.test.mjs + the 9 harnesses below
.\run_checks.ps1     # Windows wrapper: typecheck -> npm test -> build -> live LLM probe + summary

# or one harness at a time
node tools/encoding-hygiene.test.mjs              # 5   no mojibake / control chars / U+FFFD in any own file
node tools/web-only-architecture.test.mjs         # 14  no Tauri/native layer, no desktop OAuth var, one MeetingProvider
node tools/run-floating-window-lifecycle.mjs      # 43  Document Picture-in-Picture lifecycle
node tools/run-widget-realtime-flow.mjs           # 39  widget + context + persistence round trip
node tools/run-meeting-data-lifecycle.mjs         # 96  transcript merge / Firestore document shape
node tools/run-meeting-data-lifecycle.mjs free-meeting-quota.test.mjs   # 18  free-meeting gate
node tools/run-meeting-display.mjs                # 31  history + detail rendering
node tools/run-f1-verification.mjs                # 44  recognizer lifecycle
node tools/run-f2f3-verification.mjs              # 27  user-scoped persistence
node tools/run-f4-verification.mjs                # 38  per-question assistant context
node tools/run-llm-answering-verification.mjs     # 49  provider chain + honesty guards
node tools/probe_llm.mjs                          # live: which Gemini/Groq models the .env keys can reach
node tools/run-live-llm-smoke.mjs                 # live: real answers end-to-end through aiAssistantService
```

Every harness bundles the real `src/**` files with esbuild and substitutes only the
boundaries Node cannot provide (react hook runtime, AuthContext, Firestore), so the
production code paths are what gets asserted.

### Manual harness (service layer)

The service-layer harness lives in `tools/phase4-service-test.html` (moved out of `public/`, so it is no longer copied into `dist/`). Open that file in a browser with `npm run dev` running and read the
console. Expected `PHASE4-TEST` lines:

| Log step | Pass condition |
|---|---|
| `UPLOAD_OK` | resource has `name` / `size` / `type` and `urlKind` is `dataUrl` (demo) or `https` (Storage) |
| `SAVE_OK` | echoed `id`, `userId`, platform, ≥1 resource |
| `RETRIEVE_SAME_USER` | `found`, `idMatch`, `userMatch` all true |
| `CROSS_USER_DENIED` | `found: true` — a different user gets `null` |
| `USER_LIST` | `contains: true`, `allSameUser: true` |

### Manual smoke test (~60 s, Chrome/Edge, microphone allowed)

1. `npm run dev` → open http://localhost:5173 → Splash → "Continue to Overview" → **Create account**
   (any email/password works in demo mode).
2. Home: pick a platform, type a topic, optionally paste notes, attach one PDF <15 MB, press
   **Start MEETX** → the widget appears and the intro message names your selected language.
3. Speak a sentence containing "we need to" → the remark should reach History / Meeting Details
   (this also exercises the debounced persist).
4. In the widget press **Recap** → the answer must quote the remarks you actually spoke.
5. Press **Stop** → the meeting flips to `completed` with a duration, and Meeting Details shows the
   derived overview / key points / action items (never placeholder text).
6. Reload → sign in with the same email → the meeting is still listed under that user.

### Things this repo cannot verify yet

* Anything Firebase (G3) — credentials exist in `.env`, but no run against a live project has been
  verified from this repo (rules, index, Storage uploads).
* Live Gemini/Groq answers — the harnesses stub the network; use `npm run test:live` /
  `node tools/probe_llm.mjs` with your own keys to prove the real chain.
* Cross-browser speech — Chromium only.
* Anything that needs a human: microphone permission, tab/window sharing, Document Picture-in-Picture
  and the visual privacy UI (use the smoke test above).

---

## 12. Conventions the next developer must follow

1. **TypeScript strict.** `tsconfig.json` has `strict: true`; type checks must stay at exit 0
   (`npm run typecheck`). `noUnusedLocals` / `noUnusedParameters` are deliberately off.
2. **Functional components + hooks only**, `React.FC<Props>`, named exports
   (`export const X: React.FC = ...`); `export default` exists only on `App.tsx`.
3. **Tailwind utility classes inline** — no CSS modules, no styled-components. `src/index.css` holds
   only base layers + the scrollbar. Keep the existing light `slate/blue/indigo` language for pages
   and the dark `#1a1d26` glass language for the floating widget.
4. **Icons come from `lucide-react`** — do not add another icon library.
5. **Cross-cutting state belongs in a context**, not prop-drilled: extend `MeetingContextType` (and its
   `value={{ ... }}` block at the bottom of `MeetingContext.tsx`) or `AuthContextType`, then consume
   with `useMeeting()` / `useAuth()`.
6. **All persistence goes through `src/services/meetingService.ts`.** Never touch
   `localStorage['meetx_meetings_*']` from a component; keep the `isFirebaseConfigured()` branch and
   the quota-safe `try/catch` structure intact.
7. **Never invent meeting content.** Summaries/insights must be derived from the real transcript
   (`meetingInsightService`) and the UI must say "not available" when there is nothing real to show —
   this is a stated product principle in the code comments, not an accident.
8. **Keep the `Phase N:` code comments.** The codebase narrates its own history (`Phase 4` = user
   association/ownership, `Phase 8` = real insights + transcript persistence, `Phase 9` = language
   transparency). When you change one of those behaviours, update or supersede the comment.
9. **User association is mandatory.** Every meeting read/write carries `userId` and verifies it
   (`getMeetingById` returns `null` for another user's record). Don't add a code path that skips it.
10. **Language handling:** store the BCP-47 **code** on records and render through
    `getLanguageDisplayName()`; don't offer languages the recognizer cannot actually handle.

### Adding a new page in 4 steps

1. Create `src/pages/MyPage.tsx` exporting `export const MyPage: React.FC = () => { ... }`.
2. Register it inside the `ProtectedRoute` → `AppLayout` branch of `src/App.tsx` so it inherits the nav
   bar, floating widget and plan modal.
3. Consume `useAuth()` / `useMeeting()`; persist through `meetingService`.
4. Run `npm run verify` (typecheck → tests → build) and the §11 smoke test before committing.

---

## 13. Secrets, project hygiene and agent rules

* **Never commit `.env`.** `.gitignore` ignores `node_modules/`, `dist/`, `.env*`, every `*.log`
  and transient harness bundles (`tools/.*.tmp.mjs`); the project history lives on `main`.
* The Firebase **web** config is not secret by design, but Firestore/Storage must be locked down with
  rules (`request.auth.uid == uid`), especially since `getUserMeetings` queries by `userId`.
* `E:\Meetin advisor\.agents\rules\copilot.md` is the only agent-rules file and now carries the
  durable rules: web-only architecture, `npm run verify` before claiming a change works, UTF-8 clean
  source, persistence through `meetingService`, and the two product-honesty rules (never fabricate
  meeting content, never pretend a capability exists).
* `dist/` is build output; don't hand-edit it — rebuild with `npm run build`.

---

## 14. Document control

| Field | Value |
|---|---|
| File | `E:\Meetin advisor\HANDOFF.md` |
| Created | 2026-09-21 |
| Basis | Re-read of all 37 files under `src/` + the 29 files under `tools/` + every root config on 2026-09-29; `npm run typecheck` (exit 0); `npm test` (404 assertions, 0 failures); `npm run build` + `dist/` inspection; `node tools/encoding-hygiene.test.mjs` (no corrupted text) |
| Status legend | ✅ verified working · ⚠️ works but limited/unverified · ❌ missing |
| Maintenance | Update §1, §9 (features) and §10 (gaps) whenever behaviour changes, and keep the gap IDs (`G1`…`G16`) stable so they can be referenced from commits and issues |



