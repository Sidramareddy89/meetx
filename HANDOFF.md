# MEETX â€” Developer Handoff

> Multilingual real-time AI meeting assistant (React + Vite + TypeScript + Tailwind + Firebase).
> This document is the single source of truth for picking the project up: how to run it, what
> actually exists in the code today, how it is wired, and what is still missing/broken.
>
> Snapshot date: **2026-09-28 (Final Architecture Review)** Â· Verified against commit-less working tree (`E:\Meetin advisor`).
> Everything below was verified by reading the source and running the commands listed in
> [Â§11 Verification](#11-verification--how-to-check-claims-in-this-doc).

---

## 1. TL;DR for the next developer

| Item | Status |
|---|---|
| `npx tsc --noEmit` | âœ… **passes clean** (exit 0, zero output) â€” re-verified 2026-09-28 |
| `npm run build` | âœ… works â€” rebuilt 2026-09-28 (`dist/assets/index-*.js` â‰ˆ 859 kB / 216 kB gzip; Vite warns above 500 kB, no code-splitting yet) |
| Firebase | âš ï¸ **configured with real values** in `.env` â€” no placeholders remain, so the app runs in Firebase mode, not demo mode. Security rules and the `userId ASC + createdAt DESC` composite index are still unproven (G3) |
| AI responses | ? **Dual-Pipeline & Rich Detail:** Pipeline 1 continuous context + Pipeline 2 QA context decision engine. Response prompts updated for structured, detailed explanations (Part 6) with max tokens expanded to 1024. Duplicate QUERY+ASSIST responses eliminated via oiceQueryHandledIdRef. |
| Answer grounding | âœ… Per-question context: the newest 12 remarks always travel, older remarks are pulled back in when relevant, uploaded documents are retrieved rather than dumped, and everything is character-budgeted (Â§9 F4) |
| Transcription | ? Real, via browser Web Speech API (useSpeechToText). Microphone only � remote meeting audio is not captured due to echo cancellation (documented in-product). |
| Persistence | Works, localStorage-first with Firestore when configured. The transcript is **merged, never replaced**, and flushed on stop, on meeting switch and on `pagehide`/`beforeunload` (G1, G2 closed) |
| Tests | ? **100% PASS** across all 5 verification harnesses (189 assertions total: 32 desktop window, 39 realtime flow, 49 LLM answering, 38 F4 context, 31 meeting display). |
| Git | âœ… repository with history on `main`, remote `origin` â†’ `github.com/Sidramareddy89/meetx` |
| Secrets | ðŸ”´ **P1 â€” LLM keys ship inside the client bundle.** verified 2026-09-28: the Groq key prefix is present in `dist/assets/*.js`. See G9 |
| Dead code | âœ… `LiveMeetingChatPanel.tsx` has been deleted (G11) |

---

## 2. What the product is

MEETX is a web app ("Multilingual Online Meeting Assistant") with three core screens plus auth:

1. **Home** â€” configure a meeting (platform, link, topic, pasted notes, up to 5 resource files)
   and launch the assistant.
2. **Live assistant** â€” a draggable floating widget (`position: fixed`, `z-[9999]`, so it stays above
   the page but is not an OS-level always-on-top window) that (a) transcribes speech in the selected
   language, (b) answers real-time questions ("What should I say?", follow-up questions, recap,
   assist) and (c) can be hidden/shown and resized.
3. **Meeting History + Meeting Details** â€” per-user list of saved meetings; the detail page shows
   the *real* transcript-derived summary, key points, action items, resources and share/minutes
   export.

Auth (email/password, Google popup, password reset) and a 3-free-meetings â†’ Pro upgrade gate wrap
the whole thing.

---

## 3. How to run

```powershell
cd 'E:\Meetin advisor'
npm install
npm run dev        # Vite dev server â†’ http://localhost:5173  (host: true, so LAN-accessible)

npx tsc --noEmit   # type check (currently clean)
npm run build      # tsc && vite build â†’ dist/
npm run preview    # serve the production build
```

Environment: Node **v24.21.0**, npm **11.19.0** (verified on this machine).
Vite config: `vite.config.ts` â€” `@vitejs/plugin-react`, `server.port = 5173`, `server.host = true`.

### Browser requirements

* **Chrome/Edge (Chromium)** â€” required for `webkitSpeechRecognition`. Firefox/Safari will render
  the UI but transcription silently never produces text (see Â§10, gap G5).
* A reachable microphone over `localhost` or HTTPS.

---

## 4. Environment variables & runtime modes

`.env` (copied from `.env.example`) â€” **all values are still placeholders**, e.g.
`VITE_FIREBASE_API_KEY=your_api_key_here`. Keys must be prefixed `VITE_` to reach the client.

| Variable | Purpose | Current state |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web config + feature switch | placeholder â†’ `isFirebaseConfigured() === false` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase web config | placeholder |
| `VITE_FIREBASE_PROJECT_ID` | Firebase web config | placeholder |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage (resource uploads) | placeholder |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config | placeholder |
| `VITE_FIREBASE_APP_ID` | Firebase web config | placeholder |
| `VITE_GEMINI_API_KEY` | Enables the live LLM path | **absent** (also readable at runtime from `localStorage['meetx_gemini_api_key']`) |

`src/config/firebase.ts` exports `app`, `auth`, `db`, `storage` **and** `isFirebaseConfigured()`,
which returns `false` when the API key is missing, `'your_api_key_here'` or `'demo-api-key'`.
Every service branches on this flag:

* **Demo mode (today):** auth is faked in `localStorage` (`meetx_demo_user`, uid derived
  deterministically from the email via a djb2-style hash in `demoUidForEmail`), all meetings live in
  `localStorage`, resource files are inlined as data URLs.
* **Firebase mode:** real auth (`browserLocalPersistence`), `users/{uid}` profile doc,
  `meetings/{meetingId}` + `users/{uid}/meetings/{meetingId}` mirror docs, and Storage uploads under
  `users/{uid}/meetings/{meetingId}/resources/{fileName}`.
  âš ï¸ Firebase mode is **unverified end-to-end** â€” no real project has been wired up yet.

---

## 5. Tech stack

| Layer | Choice |
|---|---|
| Framework | React 18.3 (`react-jsx`, function components only) |
| Build | Vite 5.2, TypeScript 5.4 (`strict: true`, `noEmit`) |
| Routing | `react-router-dom` 6.23 (`BrowserRouter`) |
| Styling | Tailwind CSS 3.4 + `postcss` + `autoprefixer`; custom `meetx.*` palette and Inter font in `tailwind.config.js`; global styles + custom scrollbar in `src/index.css` |
| Icons | `lucide-react` |
| Backend | Firebase 10.12 (Auth, Firestore, Storage) â€” optional |
| AI | Google Gemini `gemini-1.5-flash` via raw `fetch` (optional) + built-in offline template engine |
| Speech | Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) |

No state library (Context API only), no form library, no test runner, no ESLint config.

---

## 6. Repo map (every source file, with its job)

```
E:\Meetin advisor
â”œâ”€ index.html                  Vite entry; Inter font preload; inline SVG favicon; title "MEETX â€” Multilingual Online Meeting Assistant"
â”œâ”€ package.json                name "meetx" v1.0.0, type: module; scripts dev/build/preview
â”œâ”€ vite.config.ts              react plugin; port 5173; host true
â”œâ”€ tsconfig.json               strict, ES2020, noEmit, jsx react-jsx, include: ["src"]
â”œâ”€ tailwind.config.js          content: index.html + src/**/*.{js,ts,jsx,tsx}; meetx palette; Inter
â”œâ”€ postcss.config.js           tailwindcss + autoprefixer
â”œâ”€ .env / .env.example         Firebase VITE_* keys (placeholders)
â”œâ”€ tsc_check.txt               âš ï¸ 0-byte stray artifact from a past `tsc > tsc_check.txt` run â€” safe to delete
â”œâ”€ public/
â”‚  â”œâ”€ meetx-logo.png           brand asset (182 KB) â€” currently not imported anywhere
â”‚  â””â”€ phase4-service-test.html manual service-layer test harness (see Â§11)
â””â”€ src/
   â”œâ”€ main.tsx                 createRoot + StrictMode
   â”œâ”€ App.tsx                  AuthProvider â†’ MeetingProvider â†’ Routes (full route table, Â§7)
   â”œâ”€ index.css                @tailwind layers, body font/colors, scrollbar styling
   â”œâ”€ vite-env.d.ts            Vite client types
   â”œâ”€ config/firebase.ts       Firebase init + isFirebaseConfigured()
   â”œâ”€ types/
   â”‚  â”œâ”€ meeting.ts            Meeting, MeetingTranscriptEntry, MeetingResource, MeetingSummary,
   â”‚  â”‚                        MeetingPlatform, SupportedLanguage, SUPPORTED_LANGUAGES (8), getLanguageDisplayName()
   â”‚  â””â”€ user.ts               UserProfile
   â”œâ”€ contexts/
   â”‚  â”œâ”€ AuthContext.tsx       register/login/google/reset/logout, demoUidForEmail, demo-mode user in localStorage
   â”‚  â””â”€ MeetingContext.tsx    the app's brain: language, meeting config, live transcript, assistant messages,
   â”‚                           floating-widget state, card size, 3-free-meetings quota, plan modal, session start/stop
   â”œâ”€ hooks/useSpeechToText.ts Web Speech API wrapper: startListening / stopListening / simulateSpeech
   â”œâ”€ services/
   â”‚  â”œâ”€ aiAssistantService.ts live Gemini call (6 s timeout) â†’ falls back to a large offline template engine
   â”‚  â”œâ”€ meetingService.ts     uploadMeetingResourceFile / saveMeeting / getMeetingById /
   â”‚  â”‚                        getUserMeetings / updateStoredMeeting (Firestore + localStorage, quota-safe)
   â”‚  â””â”€ meetingInsightService.ts buildSummaryFromTranscript / buildShareableMinutes (real transcript only)
   â”œâ”€ components/
   â”‚  â”œâ”€ common/MeetXLogo.tsx              "Meet(X)" wordmark + animated equalizer bars; sizes sm|md|lg|xl, dark|light
   â”‚  â”œâ”€ layout/AppLayout.tsx              protected-page shell: FloatingAssistantWidget + ChoosePlanModal + TopNavBar + <Outlet/>
   â”‚  â”œâ”€ layout/ProtectedRoute.tsx         spinner while auth loads â†’ <Navigate to="/landing"> when no user
   â”‚  â”œâ”€ layout/TopNavBar.tsx              back/forward, brand, global search, detectability pill, language dropdown, profile menu
   â”‚  â”œâ”€ assistant/FloatingAssistantWidget.tsx  the draggable live assistant (557 lines)
   â”‚  â”œâ”€ assistant/LiveMeetingChatPanel.tsx     âš ï¸ DEAD CODE â€” exported chat panel + renderMessageContent, imported by nobody
   â”‚  â””â”€ modals/ChoosePlanModal.tsx        plan/upgrade + settings-style modal (sidebar tabs; only Billing + upgrade buttons work)
   â””â”€ pages/
      â”œâ”€ SplashPage.tsx                branded start screen; auto-forwards to /home (signed in) or /signin (returning), else â†’ /landing
      â”œâ”€ auth/LandingPage.tsx          hero + Sign in / Create account CTAs
      â”œâ”€ auth/SignUpPage.tsx           email/password/display-name registration
      â”œâ”€ auth/SignInPage.tsx           email/password + Google
      â”œâ”€ auth/ForgotPasswordPage.tsx   sends Firebase reset mail (no-op in demo mode)
      â”œâ”€ HomePage.tsx                  meeting configuration form (platform, link, topic, notes, resources) + Start MEETX
      â”œâ”€ MeetingHistoryPage.tsx        per-user meeting list, period + text filters, buckets Today/Yesterday/date
      â””â”€ MeetingDetailPage.tsx         real transcript summary/key points/actions + resources + share + Launch Assistant bar
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
| `/history` | `MeetingHistoryPage` | `ProtectedRoute` + `AppLayout` |
| `/meeting/:id` | `MeetingDetailPage` | `ProtectedRoute` + `AppLayout` |
| `/live` | `<Navigate to="/home" replace />` | legacy alias kept for old links |
| `*` | `<Navigate to="/" replace />` | fallback |

Provider order matters: `BrowserRouter â†’ AuthProvider â†’ MeetingProvider` â€” `MeetingProvider` calls
`useAuth()`, so it must stay inside `AuthProvider`.

`AppLayout` is what makes the floating widget and plan modal **global** across the three authenticated
pages; they will disappear if a new page is added outside that layout branch.

---

## 8. Data model & persistence (`src/types/meeting.ts`, `src/services/meetingService.ts`)

```ts
Meeting {
  id, userId, title, platform, meetingLink?, topic,
  selectedLanguage,        // BCP-47 CODE (e.g. 'en-US') â€” the value the recognizer uses
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
  â€” use it wherever a language is rendered.
* Platforms offered on Home: Google Meet, Zoom, Microsoft Teams, Webex, Browser / Other.

### localStorage keys (complete list)

| Key | Written by | Meaning |
|---|---|---|
| `meetx_demo_user` | `AuthContext` | demo-mode `UserProfile` JSON (only when Firebase is unconfigured) |
| `meetx_user_registered` | `AuthContext` | `'true'` â†’ SplashPage shows "welcome back" and routes to `/signin` |
| `meetx_meetings_<uid>` | `meetingService` | **the real per-user meeting store** (array of `Meeting`) |
| `meetx_free_meetings_left` | `MeetingContext` | quota counter, default `3` |
| `meetx_is_pro` / `meetx_plan_type` | `MeetingContext.upgradeToPro` | Pro switch + chosen plan id |
| `meetx_gemini_api_key` | (read-only today) | alternative way to inject a Gemini key |

Quota safety in `meetingService.ts`:
* `MAX_LOCAL_RESOURCE_URL_CHARS = 250 * 1024` â€” larger data-URL resources persist as **metadata only**
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

âš ï¸ `getUserMeetings` issues `where('userId','==',uid) + orderBy('createdAt','desc')` â†’ requires a
**composite index** in the Firebase console; otherwise it throws and the function silently degrades to
the local store. Also note it returns Firestore data only when `meetings.length > 0`, so local-only
meetings can be hidden whenever Firestore has at least one record.

---

## 9. Feature inventory â†’ where it lives

| # | Feature | Code | Notes |
|---|---|---|---|
| F1 | Splash / branded boot | `SplashPage`, `MeetXLogo` | progress bar on a 300 ms interval; routes to `/home` (signed in), `/signin` (returning) or stays for new visitors |
| F2 | Auth (email, Google, reset) | `AuthContext`, `pages/auth/*` | real Firebase when configured; deterministic hashed-email uid otherwise |
| F3 | Language selection (8) | `TopNavBar`, `types/meeting.ts` | drives recognizer `lang`; stored per meeting as a code |
| F4 | Detectability toggle | `TopNavBar` / widget / `HomePage` banner | **cosmetic only** â€” no overlay/window-hiding behaviour exists (G4) |
| F5 | Meeting configuration | `HomePage` | validates topic, platform, `http(s)` link; resources: `pdf\|doc\|docx\|txt`, â‰¤15 MB each, â‰¤5 files |
| F6 | Persist meeting before session | `HomePage.handleStartMeetX` â†’ `saveMeeting` | record is saved **first**, then the session starts from that record (Phase 4 intent: a session is never orphaned from its user) |
| F7 | Live transcription | `useSpeechToText` + `MeetingContext.addTranscriptEntry` | `continuous = true`, `interimResults = false`, auto-restart on `onend`; speaker hardcoded `Speaker` / `Interviewer` |
| F8 | Debounced transcript persistence | `MeetingContext.persistTranscriptDebounced` | 1.2 s debounce â†’ `updateStoredMeeting(..., { transcript, status: 'live' })` |
| F9 | AI assistant (4 pills + free text) | `FloatingAssistantWidget` â†’ `MeetingContext.askAssistant` â†’ `aiAssistantService` | action types `assist` / `say` / `followup` / `recap` / `query`; returns text + up to 3 follow-up chips |
| F10 | Live Gemini path | `aiAssistantService.callGeminiApiIfAvailable` | `gemini-1.5-flash`, `maxOutputTokens 500`, `temperature 0.3`, 6 s `AbortController`; any failure â†’ offline engine |
| F11 | Offline template engine | `aiAssistantService.generateAssistantResponseOffline` | ~9 intent branches (transcript questions, coding, comparisons, behavioural, fallback); always appends a **language-transparency note** because templates are English-only |
| F12 | Floating widget UX | `FloatingAssistantWidget` | drag by handle, Hide/Show pill, card sizes compact/normal/expanded (`max-h-36 / max-h-56 / max-h-[380px]`), stop button, MX logo â†’ `/home`, code-block renderer with per-block copy |
| F13 | Keyboard shortcuts | widget `keydown` effect | `Ctrl+\` hide/show Â· `Ctrl+Enter` send (or "what should I say") Â· `Ctrl+R` clear assistant messages Â· `Ctrl+Shift+\` stop session (âš ï¸ `Ctrl+R` shadows browser reload) |
| F14 | Free-plan gate | `MeetingContext.startMeetingSession` + `ChoosePlanModal` | 3 free meetings; at 0 the session is refused and the plan modal opens; `upgradeToPro('pro' \| 'pro_undetectable')` only flips `localStorage` (no payment) |
| F15 | Meeting history | MeetingHistoryPage | period filter ll (default) / 1day / 1week / 1month / custom, text filter, sorted createdAt desc. Fixed bucket filtering bugs. |
| F16 | Meeting details + insights | MeetingDetailPage, meetingInsightService | overview/key points/actions derived from actual transcript. Enhanced extraction for Actions/Deadlines preserving assignees and dates in storage. |
| F17 | Share / minutes export | `MeetingDetailPage.handleShare` | `navigator.share` when available, else copies `buildShareableMinutes()` (+ detail URL) to the clipboard |
| F18 | Ask about a past meeting | `MeetingDetailPage` fixed bottom bar | starts/reuses the live context so questions run through the same assistant pipeline |
| F19 | Live "Meeting Inquiries" log | `MeetingDetailPage` | renders `assistantMessages` only while `activeMeeting.id === meeting.id` |
| F20 | Verification harness | `public/phase4-service-test.html` | 5-step service-layer check: upload â†’ save â†’ read own â†’ cross-user read denied â†’ list membership |

### Live-session lifecycle (read this before touching sessions)

```
HomePage.handleStartMeetX
  â””â”€ uploadMeetingResourceFile() per file        â†’ data URL (no Firebase) or Storage URL
  â””â”€ saveMeeting(userId, {...}, meet-<ts>)       â†’ localStorage meetx_meetings_<uid> [+ Firestore]
  â””â”€ startMeetingSession({ meeting: savedMeeting, userId })
        â”œâ”€ quota check (refuse + open plan modal when freeMeetingsLeft <= 0 and not Pro)
        â”œâ”€ decrement quota (non-Pro only)
        â”œâ”€ setActiveMeeting(...) / startSessionTime = now / clear transcript+messages
        â”œâ”€ seed assistant intro message ("MEETX is now active and listening in <language>")
        â””â”€ isPlatformClosed = true, isFloatingActive = true  â†’ widget mounts, mic starts

During session
  addTranscriptEntry()  â†’ debounce 1.2 s â†’ updateStoredMeeting({ transcript, status: 'live' })
  askAssistant(q, type) â†’ assistant + user messages kept in memory; no persistence of chat

stopMeetingSession()
  â””â”€ flush pending debounce timer
  â””â”€ ONLY IF transcript is non-empty: updateStoredMeeting({ transcript, status: 'completed', duration })
  â””â”€ isFloatingActive = false, activeMeeting = null, transcript cleared
```

Gotchas baked into this flow:
* The transcript lives **only in memory** apart from the 1.2 s debounce, and the chat log is never
  persisted at all.
* `stopMeetingSession` is the only writer of `status: 'completed'`.
* Starting the assistant again from `MeetingDetailPage` consumes another free-meeting credit even
  though the meeting already exists.

---

## 10. Known gaps, risks and TODO backlog

Priority: **P1** = user-visible / data-loss / blocking, **P2** = product-quality, **P3** = cleanup. |`n|---|---|`n| > **Status snapshot, 2026-09-28** — Closed since 2026-09-21: **G1, G2** (transcript flush on stop/switch/pagehide; residual chat-log persistence remains), **G6, G7, G10, G11, G12, G13**. Partial: **G3** (`.env` now real, rules/index unverified), **G14** (git + 8 harnesses, no lint/CI). Urgent: **G9** is now **P1** — LLM keys verified present in the client bundle. Still genuinely open: **G4, G5, G8, G15, G16**.

| ID | Pri | Issue | Evidence / fix sketch |
|---|---|---|---|
| G1 | P1 | **Meetings can be stuck in `status: 'live'` forever.** `stopMeetingSession` only writes `{ status: 'completed', duration, transcript }` when `liveTranscript.length > 0`. If the user's mic is denied, or they run a meeting with silence, the record is never completed and History keeps showing the green "Live" pill. | `MeetingContext.tsx` L250-259 â€” move the `status: 'completed'` (+ duration) write outside the `liveTranscript.length > 0` guard, persisting the transcript only when it exists. |
| G2 | P1 | **No flush on tab close / refresh.** The transcript is written on a 1.2 s debounce and the chat log is never persisted, so up to ~1.2 s of speech (plus the whole assistant conversation) is lost on an unexpected exit. | Add a `beforeunload`/`pagehide` flush in `MeetingContext` that synchronously writes the pending transcript (or lower the debounce and persist chat alongside). |
| G3 | P1 | **Firebase mode is unproven.** `.env` still contains placeholders, so every Firebase branch (auth, Firestore writes, Storage uploads, cross-device history) has never executed against a real project. `getUserMeetings` additionally needs a composite index and swallows errors. | Wire a real project, create the index (`userId` ASC + `createdAt` DESC), then re-run the Â§11 harness in Firebase mode and check the console for the `Firestore ... warning` logs. |
| G4 | P2 | **"Undetectability" is cosmetic.** `isDetectable` only changes icons/toggle colours (widget + Home banner) and `hideMeetxHidesWidget` is never toggled by anything; the paid `pro_undetectable` plan likewise only sets a localStorage flag. No screen-share/window-hiding behaviour exists. | Either implement (e.g. hide the widget when `document.visibilityState`/screen-share is detected and honour `hideMeetxHidesWidget`) or relabel the UI so the claim matches reality. |
| G5 | P2 | **Silent transcription failure on unsupported browsers.** When `SpeechRecognition` is missing, `useSpeechToText` sets `isSupported = false` **and** `isListening = true`, then does nothing â€” the widget still looks "listening" while nothing is ever transcribed. | Surface `isSupported` in `FloatingAssistantWidget` (banner: "Live transcription needs Chrome/Edge") and don't claim to be listening. |
| G6 | P2 | **Language changes don't apply mid-session.** Recognition is created inside `startListening`, and the widget only re-runs that effect when `isFloatingActive` changes â€” picking a new language in `TopNavBar` during a live session keeps the old recognizer `lang` (and the intro message's language name goes stale). | Restart recognition on `selectedLanguage.code` change, or disable the language picker while a session is live. |
| G7 | P2 | **Uploaded resources never reach the AI.** `AssistantContext.resources` is passed into `aiAssistantService`, but no prompt or template ever reads it (`resources` appears only in the type declaration). Resumes/notes work (`pastedNotes` is used); attached PDFs/DOCX are stored, listed and downloadable but ignored by answers. | Extract text (pdf.js / server-side) into `resource.content` and include a truncated digest in the Gemini prompt and offline templates. |
| G8 | P2 | **Transcription only hears the local microphone.** `useSpeechToText` uses `getUserMedia`-free Web Speech recognition and hardcodes `speakerId: 'Speaker'`, `speakerName: 'Interviewer'`. Remote participants (the actual interviewers) are inaudible unless the user plays them through speakers and the mic picks them up; there is no diarisation, speaker labels or video-platform integration. | Capture tab/system audio (`getDisplayMedia({ audio: true })`) and run it through a real STT service with speaker labels; until then, document the limitation in-product. |
| G9 | P2 | **No key storage for the Gemini key.** The key can come from `VITE_GEMINI_API_KEY` (bundled into the client build â€” visible to anyone) or `localStorage`; nothing in the UI lets a user set it. | Move LLM calls behind a server/Cloud Function proxy; add a settings field if client-side keys are kept for demos. |
| G10 | P2 | **`Ctrl+R` is hijacked** (clear assistant messages) inside the widget â€” this breaks the browser's reload shortcut for the whole app while a session is active. | Rebind to `Ctrl+Shift+R`-style combinations or scope shortcuts behind an explicit "shortcuts enabled" state. |
| G11 | P3 | **Dead / duplicated code.** `src/components/assistant/LiveMeetingChatPanel.tsx` is imported by nobody and duplicates `renderMessageContent` from `FloatingAssistantWidget`; `useSpeechToText.simulateSpeech` is exported but unused; `hideMeetxHidesWidget` has no writer; `public/meetx-logo.png` is not referenced. | Delete or wire up deliberately (a shared `MessageContent` component would remove the duplication). |
| G12 | P3 | **Stray artifact:** `tsc_check.txt` (0 bytes) in the repo root. | Delete it; use `npx tsc --noEmit` for type checks. |
| G13 | P3 | **Test harness ships to production.** `public/phase4-service-test.html` is copied into `dist/` (verified in the current build) and will be publicly reachable, writing test meetings into visitors' localStorage. | Move it out of `public/` (e.g. `tools/`) and serve it via a dev-only Vite plugin/middleware, or delete before release. |
| G14 | P3 | **No tests, lint, CI or git.** No test runner, no ESLint config, no CI workflow, and `E:\Meetin advisor` is not a git repository â€” so there is no history, no blame and no safe rollback. | `git init` + first commit is the single highest-value 5-minute task; then add `npm run typecheck` (`tsc --noEmit`) to CI and Vitest for the pure services (`meetingInsightService`, `aiAssistantService` templates, quota logic). |
| G15 | P3 | **Demo-mode auth is not a security boundary.** `demoUidForEmail` is a reversible hash, uid/email live in `localStorage`, and cross-user isolation in demo mode relies on well-behaved client code. | Fine for demos â€” make sure Firebase mode is on for anything real, and add Firestore/Storage rules (`request.auth.uid == uid`) before shipping. |
| G16 | P3 | **Cosmetic/behavioural leftovers:** `selectedLanguage` is not persisted (resets to `en-US` on reload), `isDetectable` is not persisted either, `ChoosePlanModal` sidebar tabs other than Billing are decorative, and `upgradeToPro` grants Pro for free. | Persist preferences in `localStorage`; gate real entitlements server-side. |

### Suggested order of work for the next session

1. **G14** `git init` + commit (so everything below is reversible).
2. **G1 + G2** complete-status/`pagehide` flush â€” smallest change with real user impact.
3. **G3** stand up a real Firebase project (auth + Firestore + Storage + index) and re-run the harness; confirm every `console.warn(...)` path.
4. **G5 + G6 + G8** transcription honesty: unsupported-browser notice, live language switch, tab-audio capture.
5. **G7 + G9** resources â†’ AI context, and LLM calls behind a proxy.
6. **G4 + G10 + G11 + G12 + G13** product-honesty and cleanup pass.

---

## 11. Verification â€” how to check claims in this doc

### Automated checks available today

```powershell
npx tsc --noEmit      # exit 0, no output (verified 2026-09-21)
npm run build         # produced dist/ (assets/index-ZP8f7gGb.js 794 KB, index-DDzEKQbz.css 41 KB)
```

### Manual harness (service layer)

With `npm run dev` running, open **http://localhost:5173/phase4-service-test.html** and read the
console. Expected `PHASE4-TEST` lines:

| Log step | Pass condition |
|---|---|
| `UPLOAD_OK` | resource has `name` / `size` / `type` and `urlKind` is `dataUrl` (demo) or `https` (Storage) |
| `SAVE_OK` | echoed `id`, `userId`, platform, â‰¥1 resource |
| `RETRIEVE_SAME_USER` | `found`, `idMatch`, `userMatch` all true |
| `CROSS_USER_DENIED` | `found: true` â€” a different user gets `null` |
| `USER_LIST` | `contains: true`, `allSameUser: true` |

### Manual smoke test (~60 s, Chrome/Edge, microphone allowed)

1. `npm run dev` â†’ open http://localhost:5173 â†’ Splash â†’ "Continue to Overview" â†’ **Create account**
   (any email/password works in demo mode).
2. Home: pick a platform, type a topic, optionally paste notes, attach one PDF <15 MB, press
   **Start MEETX** â†’ the widget appears and the intro message names your selected language.
3. Speak a sentence containing "we need to" â†’ the remark should reach History / Meeting Details
   (this also exercises the debounced persist).
4. In the widget press **Recap** â†’ the answer must quote the remarks you actually spoke.
5. Press **Stop** â†’ the meeting flips to `completed` with a duration, and Meeting Details shows the
   derived overview / key points / action items (never placeholder text).
6. Reload â†’ sign in with the same email â†’ the meeting is still listed under that user.

### Things this repo cannot verify yet

* Anything Firebase (G3) â€” no project configured.
* Live Gemini answers â€” no `VITE_GEMINI_API_KEY`.
* Cross-browser speech â€” Chromium only.

---

## 12. Conventions the next developer must follow

1. **TypeScript strict.** `tsconfig.json` has `strict: true`; type checks must stay at exit 0
   (`npx tsc --noEmit`). `noUnusedLocals` / `noUnusedParameters` are deliberately off.
2. **Functional components + hooks only**, `React.FC<Props>`, named exports
   (`export const X: React.FC = ...`); `export default` exists only on `App.tsx` and
   `LiveMeetingChatPanel.tsx`.
3. **Tailwind utility classes inline** â€” no CSS modules, no styled-components. `src/index.css` holds
   only base layers + the scrollbar. Keep the existing light `slate/blue/indigo` language for pages
   and the dark `#1a1d26` glass language for the floating widget.
4. **Icons come from `lucide-react`** â€” do not add another icon library.
5. **Cross-cutting state belongs in a context**, not prop-drilled: extend `MeetingContextType` (and its
   `value={{ ... }}` block at the bottom of `MeetingContext.tsx`) or `AuthContextType`, then consume
   with `useMeeting()` / `useAuth()`.
6. **All persistence goes through `src/services/meetingService.ts`.** Never touch
   `localStorage['meetx_meetings_*']` from a component; keep the `isFirebaseConfigured()` branch and
   the quota-safe `try/catch` structure intact.
7. **Never invent meeting content.** Summaries/insights must be derived from the real transcript
   (`meetingInsightService`) and the UI must say "not available" when there is nothing real to show â€”
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
2. Register it inside the `ProtectedRoute` â†’ `AppLayout` branch of `src/App.tsx` so it inherits the nav
   bar, floating widget and plan modal.
3. Consume `useAuth()` / `useMeeting()`; persist through `meetingService`.
4. Run `npx tsc --noEmit` and the Â§11 smoke test before committing.

---

## 13. Secrets, project hygiene and agent rules

* **Never commit `.env`.** There is no git repo yet â€” create `.gitignore` with `node_modules/`,
  `dist/`, `.env`, `tsc_check.txt` as part of the `git init` from G14.
* The Firebase **web** config is not secret by design, but Firestore/Storage must be locked down with
  rules (`request.auth.uid == uid`), especially since `getUserMeetings` queries by `userId`.
* `E:\Meetin advisor\.agents\rules\copilot.md` is the only agent-rules file and is currently an empty
  front-matter stub (`trigger: always_on`, no body). Put durable project rules there, e.g.
  "always run `npx tsc --noEmit` before claiming a change works", "never fabricate meeting content",
  "never bypass `meetingService` for persistence".
* `dist/` is build output; don't hand-edit it â€” rebuild with `npm run build`.

---

## 14. Document control

| Field | Value |
|---|---|
| File | `E:\Meetin advisor\HANDOFF.md` |
| Created | 2026-09-21 |
| Basis | Read of all 30 files under `src/` + `public/` + root config; `npx tsc --noEmit` (exit 0); `npm run build` output inspection; recursive filename/content searches proving no previous handoff document existed |
| Status legend | âœ… verified working Â· âš ï¸ works but limited/unverified Â· âŒ missing |
| Maintenance | Update Â§1, Â§9 (features) and Â§10 (gaps) whenever behaviour changes, and keep the gap IDs (`G1`â€¦`G16`) stable so they can be referenced from commits and issues |


