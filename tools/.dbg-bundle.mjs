// tools/react-hook-shim.mjs
var instances = /* @__PURE__ */ new Map();
var activeName = "default";
var instance = { hooks: [], mounted: true };
var activate = (name) => {
  activeName = name;
  if (!instances.has(name)) instances.set(name, { hooks: [], mounted: true });
  instance = instances.get(name);
  return instance;
};
activate("default");
var renderContext = null;
var lastResult = void 0;
var sameDeps = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
var slotAt = (index) => {
  if (!instance.hooks[index]) instance.hooks[index] = {};
  return instance.hooks[index];
};
var useState = (initial) => {
  const index = renderContext.index++;
  const slot = slotAt(index);
  if (!("state" in slot)) slot.state = typeof initial === "function" ? initial() : initial;
  const setState = (next) => {
    const value = typeof next === "function" ? next(slot.state) : next;
    if (Object.is(value, slot.state)) return;
    slot.state = value;
    instance.pendingRender = true;
  };
  return [slot.state, setState];
};
var useRef = (initial) => {
  const index = renderContext.index++;
  const slot = slotAt(index);
  if (!("ref" in slot)) slot.ref = { current: initial };
  return slot.ref;
};
var contextStack = [];
var createContext = (defaultValue) => ({ __isContext: true, defaultValue });
var useContext = (context) => {
  for (let i = contextStack.length - 1; i >= 0; i -= 1) {
    if (contextStack[i].has(context)) return contextStack[i].get(context);
  }
  return context ? context.defaultValue : void 0;
};
var useCallback = (fn, deps) => {
  const index = renderContext.index++;
  const slot = slotAt(index);
  if (!slot.callback || !sameDeps(slot.deps, deps)) {
    slot.callback = fn;
    slot.deps = deps;
  }
  return slot.callback;
};
var useEffect = (effect, deps) => {
  const index = renderContext.index++;
  const slot = slotAt(index);
  const isMount = !slot.effect;
  const shouldRun = isMount || deps === void 0 || !sameDeps(slot.deps, deps);
  slot.effect = effect;
  slot.deps = deps;
  if (shouldRun) renderContext.effects.push({ index, effect });
};
var commit = (effects) => {
  for (const { index, effect } of effects) {
    const slot = instance.hooks[index];
    if (typeof slot.cleanup === "function") slot.cleanup();
    const cleanup = effect();
    slot.cleanup = typeof cleanup === "function" ? cleanup : void 0;
  }
};
var __hookTest = {
  /** Render the component (like React), flush effects, then flush re-renders. */
  render(component) {
    let guard = 0;
    let result;
    do {
      instance.pendingRender = false;
      renderContext = { index: 0, effects: [] };
      result = component();
      const effects = renderContext.effects;
      renderContext = null;
      commit(effects);
      result = result;
      if (!instance.pendingRender) break;
    } while (++guard < 20);
    lastResult = result;
    return result;
  },
  /**
   * Make a context value visible to `useContext` for components rendered
   * afterwards, exactly like React's nearest-Provider lookup. Used when a test
   * mounts a child component separately from its real provider.
   */
  provideContext(contextObject, value) {
    contextStack.push(/* @__PURE__ */ new Map([[contextObject, value]]));
  },
  /** Drop any provided context values (no provider above this component). */
  clearContext() {
    contextStack.length = 0;
  },
  /** Unmount: run every effect cleanup (React's unmount semantics). */
  unmount() {
    for (const slot of instance.hooks) {
      if (slot && typeof slot.cleanup === "function") {
        slot.cleanup();
        slot.cleanup = void 0;
      }
    }
    instance.mounted = false;
  },
  /** Fresh component instance (the active one). */
  reset() {
    instances.set(activeName, { hooks: [], mounted: true });
    instance = instances.get(activeName);
    lastResult = void 0;
  },
  /**
   * Render the next component under its OWN hook store, so a child rendered
   * separately from its real provider does not reuse the provider's hook slots.
   */
  useInstance(name) {
    return activate(name);
  },
  /** Back to the instance the test started with. */
  defaultInstance() {
    return activate("default");
  },
  lastResult: () => lastResult
};
var Fragment = Symbol.for("react.fragment");
var jsx = (type, props, key) => ({
  type,
  props: key === void 0 ? { ...props || {} } : { ...props || {}, key }
});
var jsxs = jsx;

// src/types/meeting.ts
var SUPPORTED_LANGUAGES = [
  { code: "en-US", name: "English (US)", nativeName: "English (US)" },
  { code: "en-GB", name: "English (UK)", nativeName: "English (UK)" },
  { code: "es-ES", name: "Spanish", nativeName: "Espa\xF1ol" },
  { code: "fr-FR", name: "French", nativeName: "Fran\xE7ais" },
  { code: "de-DE", name: "German", nativeName: "Deutsch" },
  { code: "hi-IN", name: "Hindi", nativeName: "\u0939\u093F\u0928\u094D\u0926\u0940" },
  { code: "ja-JP", name: "Japanese", nativeName: "\u65E5\u672C\u8A9E" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "\u7B80\u4F53\u4E2D\u6587" }
];
var getLanguageDisplayName = (codeOrName) => {
  if (!codeOrName) return "\u2014";
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === codeOrName || l.name === codeOrName);
  return found ? found.name : codeOrName;
};

// src/services/llmProviders.ts
var geminiKey = () => (import.meta.env?.VITE_GEMINI_API_KEY || localStorage.getItem("meetx_gemini_api_key") || "").trim();
var groqKey = () => (import.meta.env?.VITE_GROQ_API_KEY || localStorage.getItem("meetx_groq_api_key") || "").trim();
var splitModels = (raw, fallback) => {
  const list = (raw || "").split(",").map((m) => m.trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
};
var GEMINI_DEFAULTS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"];
var GROQ_DEFAULTS = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
var geminiModels = () => splitModels(
  import.meta.env?.VITE_GEMINI_MODELS || "",
  GEMINI_DEFAULTS
);
var groqModels = () => splitModels(
  import.meta.env?.VITE_GROQ_MODELS || "",
  GROQ_DEFAULTS
);
var RECENT_REMARK_COUNT = 12;
var MAX_RELEVANT_OLDER = 12;
var CONVERSATION_BUDGET_CHARS = 6e3;
var RESOURCE_BUDGET_CHARS = 4e3;
var RESOURCE_CHUNK_CHARS = 1500;
var STOP_WORDS = new Set(
  "a an the and or but is are was were be been being to of in on for with that this these those it as at by from about into over after before we you they i my our your do does did have has had will would can could should what when where who how why not no yes me him us them all any each more most some such only own same than too very just now then there here if else".split(" ")
);
var QUESTION_INTENTS = [
  {
    terms: ["deadline", "due", "when", "date", "timeline", "schedule", "eod"],
    related: ["tomorrow", "today", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "week", "month", "morning", "afternoon", "evening", "submit", "ship", "deliver", "launch", "review", "close", "ends", "start"]
  },
  {
    terms: ["who", "owner", "assign", "assigned", "responsible", "lead"],
    related: ["owns", "owner", "lead", "taking", "handle", "handles", "responsible", "assigned", "priya", "ana"]
  },
  {
    terms: ["budget", "cost", "price", "spend", "money"],
    related: ["budget", "cap", "capped", "thousand", "dollars", "cost", "spend", "spending", "price"]
  },
  {
    terms: ["status", "progress", "update", "where"],
    related: ["done", "finished", "shipped", "ready", "blocked", "in", "progress", "started"]
  },
  {
    terms: ["url", "endpoint", "api", "link", "base"],
    related: ["url", "endpoint", "api", "base", "https", "token", "bearer"]
  }
];
var contentKeywords = (text, question = "") => {
  const words = (text || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const out = new Set(words);
  if (question) {
    const asked = (question || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);
    for (const intent of QUESTION_INTENTS) {
      if (intent.terms.some((t) => asked.includes(t))) {
        for (const r of intent.related) out.add(r);
      }
    }
  }
  return Array.from(out);
};
var entryBody = (t) => (t.translatedText && !t.translatedText.includes("translating") ? t.translatedText : t.text) || "";
var selectConversationContext = (entries, question, recentCount = RECENT_REMARK_COUNT) => {
  const spoken = (entries || []).filter((e) => (entryBody(e) || "").trim());
  if (spoken.length === 0) {
    return { lines: [], latestLineNo: 0, relevantOlderCount: 0, truncated: false };
  }
  const recent = spoken.slice(-recentCount);
  const older = spoken.slice(0, Math.max(0, spoken.length - recentCount));
  const queryWords = new Set(contentKeywords("", question));
  const scored = older.map((entry) => {
    const words = contentKeywords(entryBody(entry));
    const hits = words.filter((w) => queryWords.has(w)).length;
    return { entry, score: hits / Math.max(1, Math.sqrt(words.length)) };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, MAX_RELEVANT_OLDER).map((s) => s.entry);
  const byId = /* @__PURE__ */ new Map();
  for (const e of scored) byId.set(e.id, e);
  for (const e of recent) byId.set(e.id, e);
  let ordered = Array.from(byId.values()).sort((a, b) => spoken.indexOf(a) - spoken.indexOf(b));
  const totalChars = () => ordered.reduce((sum, e) => sum + entryBody(e).length, 0);
  let truncated = false;
  while (ordered.length > 1 && totalChars() > CONVERSATION_BUDGET_CHARS) {
    ordered = ordered.slice(1);
    truncated = true;
  }
  const lines = ordered.map((t, i) => {
    const body = entryBody(t);
    return `${i + 1}. ${t.speakerName || t.speakerId} [${t.timestamp}] (id ${t.id}): ${body}`;
  });
  const recentIds = new Set(recent.map((e) => e.id));
  return {
    lines,
    latestLineNo: lines.length,
    relevantOlderCount: scored.filter((e) => ordered.some((o) => o.id === e.id) && !recentIds.has(e.id)).length,
    truncated
  };
};
var selectRelevantResources = (resources, question, topicAndNotes = "") => {
  const queryWords = new Set(contentKeywords(`${question} ${topicAndNotes}`, question));
  const blocks = (resources || []).map((r) => {
    let body = r.content || "";
    if (!body && r.url && r.url.startsWith("data:text/plain")) {
      try {
        body = decodeURIComponent(r.url.split(",")[1]);
      } catch {
        body = "";
      }
    }
    if (!body.trim()) return null;
    const words = contentKeywords(`${r.name} ${body}`);
    const hits = words.filter((w) => queryWords.has(w)).length;
    return { name: r.name, body, score: hits / Math.max(1, Math.sqrt(words.length)) };
  }).filter((b) => Boolean(b)).sort((a, b) => b.score - a.score);
  const relevant = blocks.filter((b) => b.score > 0);
  const chosen = relevant.length > 0 ? relevant : blocks.slice(0, 2);
  const kept = [];
  let used = 0;
  for (const block of chosen) {
    const chunk = block.body.length > RESOURCE_CHUNK_CHARS ? `${block.body.slice(0, RESOURCE_CHUNK_CHARS)}
...(truncated)` : block.body;
    const text = `### ${block.name}
${chunk}`;
    if (used + text.length > RESOURCE_BUDGET_CHARS) continue;
    kept.push(text);
    used += text.length;
  }
  return kept.join("\n\n");
};
var buildPrompt = (prompt, context, actionType = "query") => {
  const conversation = selectConversationContext(context.transcript, prompt);
  const transcriptSnippet = conversation.lines.join("\n");
  const latestLineNo = conversation.latestLineNo;
  const notes = (context.pastedNotes || "").slice(0, 1e3);
  const kbSnippet = selectRelevantResources(context.resources, prompt, `${context.topic} ${notes}`);
  const kbBlock = kbSnippet ? `
Knowledge Base (uploaded documents, most relevant first):
${kbSnippet}
` : "";
  const hasTranscript = transcriptSnippet.trim().length > 0;
  const groundingRule = hasTranscript ? "Ground the answer in the conversation above, including older remarks that are listed there. If the conversation does NOT contain the answer, still answer the question from your own knowledge, and add one short note that this meeting did not cover it. Never claim someone said something they did not." : "NO TRANSCRIPT HAS BEEN CAPTURED YET. Never refuse and never say you were given no transcript. Answer from the meeting topic, the user notes and the uploaded documents, then close with one short line telling the user to turn on the microphone so answers are grounded in the live conversation.";
  return `You are MEETX, an elite real-time multilingual AI meeting copilot.
Meeting Topic: "${context.topic}".
Language: "${context.language}".
User Notes: "${notes}"${kbBlock}Meeting conversation so far (real, live, chronological; older relevant remarks are included - use the whole thing, not only the last line):
${transcriptSnippet || "(no speech captured yet \u2014 microphone off, not permitted, or silent)"}

` + (latestLineNo ? `The participant just spoke remark #${latestLineNo} - answer THAT remark, using the rest of the conversation as context.

` : "") + `Rules - REPLY FAST AND CONCISE. Answer in TEXT ONLY, in exactly this shape:
1) the answer itself - one or two short lines, at most 25 words (or up to 3 short bullets). ` + (actionType === "say" ? `The user is asking WHAT TO SAY, so start the answer with "Say: ...".` : `The user is asking a question, so answer it directly and do NOT start with "Say:".`) + `
2) then a single line starting with "Context:" that gives the short reason in a few words (you may add the remark number in brackets). 
Stop there. No preamble, no filler, no disclaimers, no repetition, no offer to elaborate, and never mention audio, voice, speaking aloud or reading aloud - the answer is read on screen.
Use the whole conversation above for context, and answer the most recent remark. ${groundingRule}

User Question: ${prompt}`;
};
var geminiCooldownUntil = 0;
var LLM_DIAGNOSTICS_CAP = 50;
var llmDiagnostics = [];
var recordAttempt = (attempt) => {
  llmDiagnostics.push(attempt);
  if (llmDiagnostics.length > LLM_DIAGNOSTICS_CAP) llmDiagnostics.shift();
  if (import.meta.env?.DEV) {
    const detail = attempt.ok ? "ok" : `${attempt.errorCategory || "network-error"}${attempt.httpStatus !== void 0 ? ` http=${attempt.httpStatus}` : ""}`;
    console.debug(
      `[llm] ${attempt.provider}/${attempt.model} ${detail} ${attempt.latencyMs}ms`
    );
  }
};
var classifyGeminiError = (status) => status === 429 ? "rate-limit" : status >= 500 ? "server-error" : "client-error";
async function callGemini(prompt, context, actionType = "query") {
  const apiKey = geminiKey();
  if (!apiKey) {
    return null;
  }
  if (Date.now() < geminiCooldownUntil) {
    recordAttempt({
      provider: "gemini",
      model: geminiModels()[0] || GEMINI_DEFAULTS[0],
      ok: false,
      latencyMs: 0,
      errorCategory: "cooldown",
      endpoint: "gemini:generateContent"
    });
    return null;
  }
  const fullPrompt = buildPrompt(prompt, context, actionType);
  for (const model of geminiModels()) {
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4e3);
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
            generationConfig: { maxOutputTokens: 512, temperature: 0.3 }
          })
        }
      );
      clearTimeout(timer);
      const latencyMs = Date.now() - startedAt;
      if (res.status === 429 || res.status >= 500) {
        geminiCooldownUntil = Date.now() + 6e4;
        recordAttempt({
          provider: "gemini",
          model,
          ok: false,
          latencyMs,
          httpStatus: res.status,
          errorCategory: classifyGeminiError(res.status),
          endpoint: "gemini:generateContent"
        });
        return null;
      }
      if (!res.ok) {
        recordAttempt({
          provider: "gemini",
          model,
          ok: false,
          latencyMs,
          httpStatus: res.status,
          errorCategory: classifyGeminiError(res.status),
          endpoint: "gemini:generateContent"
        });
        continue;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && String(text).trim()) {
        recordAttempt({ provider: "gemini", model, ok: true, latencyMs, httpStatus: res.status, endpoint: "gemini:generateContent" });
        return String(text).trim();
      }
      recordAttempt({
        provider: "gemini",
        model,
        ok: false,
        latencyMs,
        httpStatus: res.status,
        errorCategory: "empty-response",
        endpoint: "gemini:generateContent"
      });
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const timedOut = err instanceof Error && err.name === "AbortError";
      geminiCooldownUntil = Date.now() + 3e4;
      recordAttempt({
        provider: "gemini",
        model,
        ok: false,
        latencyMs,
        errorCategory: timedOut ? "timeout" : "network-error",
        endpoint: "gemini:generateContent"
      });
      return null;
    }
  }
  return null;
}
async function callGroq(prompt, context, actionType = "query") {
  const apiKey = groqKey();
  if (!apiKey) {
    return null;
  }
  const fullPrompt = buildPrompt(prompt, context, actionType);
  for (const model of groqModels()) {
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4e3);
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: 'You are MEETX, a real-time multilingual AI meeting copilot. TEXT ONLY: never produce audio, never suggest speaking or reading aloud. Answer in exactly two parts - (1) the answer, one or two short lines, at most 25 words or up to 3 short bullets, starting with "Say: ..." when asked what to say; (2) a single "Context:" line naming the remark it is based on. Then stop. No preamble, filler or disclaimers. Ground answers in the transcript when one has been captured; when none has, still answer from the topic and notes and say how to enable the mic. Never reply that you were given no transcript.'
            },
            { role: "user", content: fullPrompt }
          ],
          max_tokens: 1024,
          ...model.includes("gpt-oss") ? { reasoning_effort: "low" } : {},
          temperature: 0.3
        })
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - startedAt;
      if (res.status === 429 || res.status >= 500) {
        recordAttempt({
          provider: "groq",
          model,
          ok: false,
          latencyMs,
          httpStatus: res.status,
          errorCategory: res.status === 429 ? "rate-limit" : "server-error",
          endpoint: "groq:chat-completions"
        });
        return null;
      }
      if (!res.ok) {
        recordAttempt({
          provider: "groq",
          model,
          ok: false,
          latencyMs,
          httpStatus: res.status,
          errorCategory: "client-error",
          endpoint: "groq:chat-completions"
        });
        continue;
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text && String(text).trim()) {
        recordAttempt({ provider: "groq", model, ok: true, latencyMs, httpStatus: res.status, endpoint: "groq:chat-completions" });
        return String(text).trim();
      }
      recordAttempt({
        provider: "groq",
        model,
        ok: false,
        latencyMs,
        httpStatus: res.status,
        errorCategory: "empty-response",
        endpoint: "groq:chat-completions"
      });
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const timedOut = err instanceof Error && err.name === "AbortError";
      recordAttempt({
        provider: "groq",
        model,
        ok: false,
        latencyMs,
        errorCategory: timedOut ? "timeout" : "network-error",
        endpoint: "groq:chat-completions"
      });
      continue;
    }
  }
  return null;
}

// src/services/aiAssistantService.ts
var PROVIDER_UNAVAILABLE_MESSAGE = "AI provider unavailable. Please try again.";
function buildOfflineConversationAnswer(queryOrAction, actionType, context) {
  const entries = (context.transcript || []).filter((t) => (t.text || "").trim());
  const lastLines = entries.slice(-8).map((t) => {
    const speaker = t.speakerName || t.speakerId || "Speaker";
    const body = (t.translatedText && t.translatedText !== "\u2026translating\u2026" ? t.translatedText : t.text).trim();
    return speaker + " [" + t.timestamp + "]: " + body;
  });
  const convo = lastLines.length > 0 ? lastLines.join("\n") : "(no spoken conversation captured yet)";
  const kbNames = (context.resources || []).map((r) => r.name).filter(Boolean);
  const kbLine = kbNames.length > 0 ? "Knowledge base: " + kbNames.join(", ") : "Knowledge base: (none uploaded)";
  const topicLine = 'Meeting: "' + context.topic + '"';
  const emptyGuard = entries.length === 0 ? "\n\nNOTE: no live conversation has been captured yet \u2014 start speaking (mic on, Chrome/Edge) and I will answer from the real discussion." : "";
  const tail = (label) => "\n\n---\n" + topicLine + " \u2022 " + kbLine + "\nLast " + lastLines.length + " remarks (" + label + " from live conversation):\n" + convo;
  if (actionType === "say") {
    const last = entries.slice(-3).map((t) => t.text.trim()).join(" ");
    const reply = last ? 'Say: "Thanks for that \u2014 building on what you just said about \u2018' + last.slice(0, 120) + '\u2019, here is my take: [add your 1 key point, then ask: does that align with what you need?]".' : 'Say: "Thanks everyone for joining. To make sure we are aligned \u2014 could you walk me through the current status and what you need from my side?"';
    return {
      text: reply + tail("script grounded in"),
      followupSuggestions: ["Give me a shorter version", "Give me 2 follow-up questions", "Recap so far"]
    };
  }
  if (actionType === "followup") {
    const qs = buildFollowups(entries, context.topic);
    return {
      text: "Smart follow-ups for this conversation:\n" + qs.map((q, i) => i + 1 + ". " + q).join("\n") + tail("drawn from"),
      followupSuggestions: qs.slice(0, 3)
    };
  }
  if (actionType === "recap") {
    if (entries.length === 0) {
      return {
        text: "No conversation to recap yet." + emptyGuard,
        followupSuggestions: ["What should I say to open?", "How do I use this widget?"]
      };
    }
    const speakers = Array.from(new Set(entries.map((t) => t.speakerName || t.speakerId || "Speaker")));
    return {
      text: "Live recap (" + entries.length + " remarks, speakers: " + speakers.join(", ") + "):\n" + lastLines.map((l) => "\u2022 " + l).join("\n") + "\n\n" + kbLine,
      followupSuggestions: ["What should I say next?", "Give me 2 follow-up questions", "List action items"]
    };
  }
  if (actionType === "assist") {
    if (entries.length === 0) {
      return {
        text: "MEETX is listening in " + context.language + ". " + topicLine + ". " + kbLine + "." + emptyGuard,
        followupSuggestions: ["What should I say to open?", "Give me 2 follow-up questions"]
      };
    }
    const last = entries[entries.length - 1];
    return {
      text: "Live read: the other side just said \u2018" + last.text.trim().slice(0, 160) + "\u2019. Suggested move: acknowledge it in one line, state your position in one line, then ask one sharp question to keep control." + tail("grounded in"),
      followupSuggestions: ["What should I say?", "Give me 2 follow-up questions", "Recap so far"]
    };
  }
  return {
    text: 'On "' + queryOrAction.slice(0, 140) + '" \u2014 based on the live conversation so far:\n' + (lastLines.length > 0 ? lastLines.slice(-4).map((l) => "\u2022 " + l).join("\n") : "(no remarks yet \u2014 speak first)") + "\n\n" + kbLine + emptyGuard,
    followupSuggestions: ["What should I say next?", "Give me 2 follow-up questions", "Recap so far"]
  };
}
function buildFollowups(entries, topic) {
  const last = entries.slice(-2).map((t) => t.text.trim()).join(" ").slice(0, 90);
  const base2 = last ? "you just mentioned \u2018" + last + "\u2019" : "this " + topic + " discussion";
  return [
    "When you say " + base2 + " \u2014 what does success look like from your side?",
    "What is the biggest blocker here, and what would unblock it this week?",
    "Can we agree on one owner and one deadline for the next step?",
    "Is there anything I can clarify or provide from my side right now?"
  ];
}
var generateAssistantResponse = async (queryOrAction, actionType, context) => {
  const suggestions = [
    "What should I say next?",
    "Give me 2 follow-up questions",
    "Summarize recent points"
  ];
  const groqAnswer = await callGroq(queryOrAction, context, actionType);
  if (groqAnswer) {
    return { text: groqAnswer, followupSuggestions: suggestions, source: "llm" };
  }
  const geminiAnswer = await callGemini(queryOrAction, context, actionType);
  if (geminiAnswer) {
    return { text: geminiAnswer, followupSuggestions: suggestions, source: "llm" };
  }
  if (!geminiKey() && !groqKey()) {
    const offline = buildOfflineConversationAnswer(queryOrAction, actionType, context);
    return {
      ...offline,
      text: offline.text + "\n\nProvider: none configured \u2014 configure a Gemini/Groq key for live answers.",
      source: "offline"
    };
  }
  return { text: PROVIDER_UNAVAILABLE_MESSAGE, followupSuggestions: suggestions, source: "provider-unavailable" };
};

// src/services/meetingInsightService.ts
var ACTION_PATTERNS = /\b(action item|to-do|follow ?up|deadline|due|next step|we need to|i need to|you need to|we should|need to (do|deliver|send|update|test|fix)|will (be )?(sending|delivering|updating|following up))\b/i;
function buildSummaryFromTranscript(meeting, transcript) {
  const entries = (transcript || []).filter((t) => t && (t.text || "").trim().length > 0);
  if (entries.length === 0) {
    return null;
  }
  const MAX_POINTS = 6;
  let pointEntries;
  if (entries.length <= MAX_POINTS) {
    pointEntries = entries;
  } else {
    const step = (entries.length - 1) / (MAX_POINTS - 1);
    pointEntries = Array.from(
      { length: MAX_POINTS },
      (_, i) => entries[Math.round(i * step)]
    );
  }
  const keyPoints = pointEntries.map((e) => {
    const speaker = e.speakerName || e.speakerId || "Speaker";
    const text = e.text.trim();
    const trimmed = text.length > 160 ? `${text.slice(0, 157)}...` : text;
    return `${speaker}: "${trimmed}"`;
  });
  const actions = entries.filter((e) => ACTION_PATTERNS.test(e.text)).slice(0, 5).map((e) => e.text.trim());
  const speakers = Array.from(
    new Set(entries.map((e) => e.speakerName || e.speakerId || "Speaker"))
  );
  const firstAt = entries[0].timestamp || "start";
  const lastAt = entries[entries.length - 1].timestamp || "end";
  const languageLabel = getLanguageDisplayName(meeting.selectedLanguage);
  const overview = `Meeting "${meeting.topic || meeting.title || "Untitled Meeting"}" on ${meeting.platform} (${languageLabel}) recorded ${entries.length} spoken remark${entries.length === 1 ? "" : "s"} between ${firstAt} and ${lastAt} with ${speakers.length} speaker${speakers.length === 1 ? "" : "s"} (${speakers.join(", ")}). This summary is generated directly from the recorded transcript.`;
  return {
    overview,
    keyPoints,
    actions
  };
}
function buildMeetingInsights(meeting, transcript) {
  const summary = buildSummaryFromTranscript(meeting, transcript || []);
  if (!summary) return null;
  const brief = buildLiveBrief(meeting.topic || meeting.title || "Meeting", transcript || []);
  return {
    overview: summary.overview,
    // Prefer the brief's richer extraction, fall back to the summary's own.
    keyPoints: brief && brief.keyPoints.length ? brief.keyPoints : summary.keyPoints || [],
    actions: brief && brief.actions.length ? brief.actions.map((a) => a.text) : summary.actions || [],
    deadlines: brief ? brief.deadlines.map((d) => d.text) : [],
    reminders: brief ? brief.reminders : [],
    updatedAt: Date.now()
  };
}
function mergeTranscriptEntriesById(base2, incoming) {
  const merged = [];
  const indexById = /* @__PURE__ */ new Map();
  const superseded = /* @__PURE__ */ new Set();
  const add = (entry) => {
    if (!entry || !(entry.text || "").trim()) return;
    const id = entry.id;
    const isTranslated = id.endsWith("-t") && id.length > 2;
    const targetId = isTranslated ? id.slice(0, -2) : id;
    if (isTranslated && superseded.has(targetId)) {
      const at2 = indexById.get(id);
      if (at2 !== void 0) merged[at2] = entry;
      return;
    }
    if (isTranslated) {
      const at2 = indexById.get(targetId);
      superseded.add(targetId);
      indexById.set(id, at2 === void 0 ? merged.length : at2);
      if (at2 === void 0) merged.push(entry);
      else merged[at2] = entry;
      return;
    }
    const at = indexById.get(id);
    if (at === void 0) {
      indexById.set(id, merged.length);
      merged.push(entry);
    } else {
      merged[at] = entry;
    }
  };
  for (const entry of base2 || []) add(entry);
  for (const entry of incoming || []) add(entry);
  return merged;
}
function buildMeetingTranscriptContext(persistedTranscript, liveTranscript) {
  return mergeTranscriptEntriesById(persistedTranscript, liveTranscript);
}
var ACTION_VERBS = /\b(will|shall|must|need to|needs to|should|going to|action item|to-?do|follow ?up|send|share|deliver|submit|prepare|schedule|call|email|review|update|fix|test|deploy|deadline|due|by (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|eod|end of (day|week))|\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?)\b/i;
var QUESTION_RE = /\?\s*$/;
var NAME_PREFIX = /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[:\-–]\s*(.+)$/;
function groupTranscriptBySpeaker(transcript) {
  const groups = [];
  for (const entry of transcript) {
    let speaker = entry.speakerName || entry.speakerId || "Speaker";
    let text = entry.translatedText && entry.translatedText !== "\u2026translating\u2026" ? entry.translatedText : entry.text;
    const m = text.match(NAME_PREFIX);
    if (m) {
      speaker = m[1];
      text = m[2];
    }
    const last = groups[groups.length - 1];
    if (last && last.speaker === speaker) {
      last.lines.push({ ...entry, text });
      last.lastAt = entry.timestamp;
    } else {
      groups.push({ speaker, lines: [{ ...entry, text }], lastAt: entry.timestamp });
    }
  }
  return groups;
}
var extractAssignee = (text) => {
  const m = text.match(/\b([A-Z][a-z]+)\s+(will|shall|should|must|needs?\s+to|is\s+going\s+to)\b/);
  return m ? m[1] : void 0;
};
var extractDueDate = (text) => {
  const m = text.match(
    /\b(by|due|before|deadline:?)\s+([A-Z][a-z]+day|tomorrow|today|next week|EOD|end of (day|week)|\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?)/i
  );
  return m ? m[0] : void 0;
};
var STOPWORDS = new Set(
  "the,a,an,and,or,but,is,are,was,were,be,been,to,of,in,on,for,with,that,this,it,as,at,by,we,you,they,he,she,i,my,our,your,his,her,its,so,do,does,did,have,has,had,will,shall,can,could,should,would,what,when,where,who,how,why,not,no,yes,yeah,okay,ok,um,uh,like,just,very,really,also,well,now,then,there,here,from,about,into,over,after,before,me,him,us,them,all,any,each,more,most,some,such,only,own,same,than,too".split(",")
);
function extractKeywords(text) {
  const freq = /* @__PURE__ */ new Map();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (raw.length < 4 || STOPWORDS.has(raw)) continue;
    freq.set(raw, (freq.get(raw) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}
function buildLiveBrief(topic, transcript) {
  const entries = (transcript || []).filter((t) => t && (t.text || "").trim());
  if (entries.length === 0) return null;
  const speakers = Array.from(
    new Set(entries.map((e) => e.speakerName || e.speakerId || "Speaker"))
  );
  const lastLineTexts = entries.slice(-5).map((e) => e.text.trim());
  const keywords = extractKeywords(entries.map((e) => e.text).join(" "));
  const title = topic && topic !== "Active Meeting" ? topic : keywords.length > 0 ? "Meeting: " + keywords.slice(0, 4).join(", ") : "Live meeting \u2014 " + entries.length + " remarks";
  const lastLine = lastLineTexts[lastLineTexts.length - 1];
  const summary = entries.length + " remark" + (entries.length === 1 ? "" : "s") + " from " + speakers.length + " speaker" + (speakers.length === 1 ? "" : "s") + " (" + speakers.join(", ") + '). Latest: "' + lastLine.slice(0, 140) + (lastLine.length > 140 ? "\u2026" : "") + '"';
  const keyPoints = entries.slice(-6).map((e) => e.text.trim().slice(0, 180));
  const actions = [];
  const deadlines = [];
  for (const e of entries) {
    if (!ACTION_VERBS.test(e.text)) continue;
    const text = e.text.trim().slice(0, 220);
    const due = extractDueDate(e.text);
    actions.push({
      id: e.id + "-action",
      text,
      assignee: extractAssignee(e.text),
      dueDate: due,
      done: false
    });
    if (due && deadlines.length < 8) {
      deadlines.push({ id: e.id + "-due", text, date: due });
    }
    if (actions.length >= 10) break;
  }
  const questions = entries.filter((e) => QUESTION_RE.test(e.text.trim())).slice(-3);
  const reminders = [
    ...deadlines.slice(0, 3).map((d) => "\u23F0 Reminder: " + d.date + " \u2014 " + d.text.slice(0, 100)),
    ...questions.map((q) => '\u2753 Open question: "' + q.text.trim().slice(0, 110) + '"')
  ].slice(0, 6);
  return {
    title,
    summary,
    keyPoints,
    actions: actions.slice(0, 10),
    deadlines,
    reminders,
    updatedAt: Date.now()
  };
}

// meetx-stub:firebase-stub
var db = {};
var isFirebaseConfigured = () => globalThis.__firebaseConfigured === true;
var doc = (...a) => ({ path: a.slice(1).join("/") });
var serverTimestamp = () => "ts";
var setDoc = async () => {
};
var getDoc = async () => ({ exists: () => false, data: () => void 0 });

// src/services/meetingService.ts
var MAX_LOCAL_RESOURCE_URL_CHARS = 250 * 1024;
var slimResourcesForLocalPersistence = (resources) => (resources || []).map((r) => ({
  id: r.id,
  name: r.name,
  type: r.type,
  size: r.size
}));
var lastMeetingIdTimestamp = 0;
var sameMillisecondIdSuffix = 0;
var createMeetingId = () => {
  const now = Date.now();
  if (now === lastMeetingIdTimestamp) {
    sameMillisecondIdSuffix += 1;
  } else {
    lastMeetingIdTimestamp = now;
    sameMillisecondIdSuffix = 0;
  }
  return sameMillisecondIdSuffix === 0 ? `meet-${now}` : `meet-${now}-${sameMillisecondIdSuffix}`;
};
async function updateStoredMeeting(meetingId, userId, updates, fallbackMeeting) {
  let hasLocalRecord = false;
  try {
    const localKey = `meetx_meetings_${userId}`;
    const raw = localStorage.getItem(localKey);
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((m) => m.id === meetingId && m.userId === userId);
    let hasChanges = false;
    if (idx !== -1) {
      const stored = list[idx];
      hasLocalRecord = true;
      const next = { ...stored, ...updates };
      if (updates.transcript) {
        next.transcript = mergeTranscriptEntriesById(stored.transcript, updates.transcript);
      }
      list[idx] = next;
      hasChanges = true;
    } else if (fallbackMeeting && fallbackMeeting.id === meetingId) {
      const created = { ...fallbackMeeting, userId, ...updates };
      if (updates.transcript) {
        created.transcript = mergeTranscriptEntriesById(fallbackMeeting.transcript, updates.transcript);
      }
      list.unshift(created);
      hasChanges = true;
    }
    if (hasChanges) {
      try {
        localStorage.setItem(localKey, JSON.stringify(list));
      } catch (quotaErr) {
        const slimmed = list.map((m) => ({
          ...m,
          resources: slimResourcesForLocalPersistence(m.resources)
        }));
        localStorage.setItem(localKey, JSON.stringify(slimmed));
        console.warn("Local storage quota exceeded during meeting update:", quotaErr);
      }
    }
  } catch (localErr) {
    console.warn("Local meeting update warning:", localErr);
  }
  if (isFirebaseConfigured()) {
    try {
      const firestoreUpdates = { ...updates };
      if (fallbackMeeting && fallbackMeeting.id === meetingId) {
        const identity = { ...fallbackMeeting, id: meetingId };
        delete identity.transcript;
        delete identity.status;
        delete identity.duration;
        identity.resources = slimResourcesForLocalPersistence(fallbackMeeting.resources);
        Object.assign(firestoreUpdates, identity);
      }
      if (updates.transcript && !hasLocalRecord) {
        try {
          const existing = await getDoc(doc(db, "meetings", meetingId));
          if (existing.exists()) {
            const remote = existing.data();
            if (remote && remote.userId === userId) {
              firestoreUpdates.transcript = mergeTranscriptEntriesById(
                remote.transcript,
                updates.transcript
              );
            }
          }
        } catch (readErr) {
          console.warn("Firestore transcript merge read warning:", readErr);
        }
      }
      await setDoc(
        doc(db, "meetings", meetingId),
        { ...firestoreUpdates, userId, serverUpdatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (fsErr) {
      console.warn("Firestore meeting update warning:", fsErr);
    }
  }
}

// tools/auth-context-stub.mjs
var useAuth = () => {
  const auth = globalThis.__meetxTestAuth || {};
  return {
    currentUser: auth.currentUser || null,
    loading: false,
    isRegisteredUser: true,
    register: async () => {
    },
    login: async () => {
    },
    signInWithGoogle: async () => {
    },
    resetPassword: async () => {
    },
    logout: async () => {
      if (auth) auth.currentUser = null;
    },
    setIsRegisteredUser: () => {
    },
    loadUserProfile: async () => auth.currentUser || null,
    updateUserProfile: async () => {
    }
  };
};

// src/contexts/MeetingContext.tsx
var MAX_FREE_MEETINGS = 10;
var FREE_MEETINGS_LEFT_KEY = "meetx_free_meetings_left";
var FREE_MEETINGS_LIMIT_KEY = "meetx_free_meetings_limit";
var MeetingContext = createContext(void 0);
var MeetingProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const [isDetectable, setIsDetectable] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(SUPPORTED_LANGUAGES[0]);
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFloatingActive, setIsFloatingActive] = useState(false);
  const [isWidgetCollapsed, setIsWidgetCollapsed] = useState(false);
  const [answerCardSize, setAnswerCardSize] = useState("normal");
  const [hideMeetxHidesWidget, setHideMeetxHidesWidget] = useState(false);
  const [isPlatformClosed, setIsPlatformClosed] = useState(false);
  const [freeMeetingsLeft, setFreeMeetingsLeft] = useState(() => {
    const saved = localStorage.getItem(FREE_MEETINGS_LEFT_KEY);
    const savedLimit = Number(localStorage.getItem(FREE_MEETINGS_LIMIT_KEY));
    if (saved === null || savedLimit !== MAX_FREE_MEETINGS) {
      localStorage.setItem(FREE_MEETINGS_LEFT_KEY, String(MAX_FREE_MEETINGS));
      localStorage.setItem(FREE_MEETINGS_LIMIT_KEY, String(MAX_FREE_MEETINGS));
      return MAX_FREE_MEETINGS;
    }
    const parsed = parseInt(saved, 10);
    return Number.isFinite(parsed) ? parsed : MAX_FREE_MEETINGS;
  });
  const [isProUser, setIsProUser] = useState(() => {
    return localStorage.getItem("meetx_is_pro") === "true";
  });
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState([]);
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [sessionStartTime, setSessionStartTime] = useState(Date.now());
  const [isThinking, setIsThinking] = useState(false);
  const [liveBrief, setLiveBrief] = useState(null);
  const [checkedActions, setCheckedActions] = useState(/* @__PURE__ */ new Set());
  const briefTimer = useRef(null);
  const toggleActionCheck = (id) => {
    setCheckedActions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [targetLanguage, setTargetLanguage] = useState(SUPPORTED_LANGUAGES[0]);
  const [speakTranslations, setSpeakTranslations] = useState(false);
  const translationEnabled = targetLanguage.code !== selectedLanguage.code;
  const transcriptSaveTimer = useRef(null);
  const activeMeetingRef = useRef(null);
  const sessionBaseTranscriptRef = useRef([]);
  const sessionTranscriptRef = useRef([]);
  const sessionStartTimeRef = useRef(Date.now());
  const increaseCardSize = () => {
    if (answerCardSize === "compact") setAnswerCardSize("normal");
    else if (answerCardSize === "normal") setAnswerCardSize("expanded");
  };
  const decreaseCardSize = () => {
    if (answerCardSize === "expanded") setAnswerCardSize("normal");
    else if (answerCardSize === "normal") setAnswerCardSize("compact");
  };
  const upgradeToPro = (planType) => {
    setIsProUser(true);
    localStorage.setItem("meetx_is_pro", "true");
    localStorage.setItem("meetx_plan_type", planType);
    setIsPlanModalOpen(false);
  };
  const flushTranscriptNow = (status = "live", duration) => {
    const session = activeMeetingRef.current;
    if (!session?.id || !session?.userId) return Promise.resolve();
    const merged = mergeTranscriptEntriesById(
      sessionBaseTranscriptRef.current,
      sessionTranscriptRef.current
    );
    sessionTranscriptRef.current = merged;
    const updates = {
      transcript: merged,
      status
    };
    if (duration !== void 0) updates.duration = duration;
    const insights = buildMeetingInsights({ ...session, transcript: merged }, merged);
    if (insights) updates.summary = insights;
    return updateStoredMeeting(
      session.id,
      session.userId,
      updates,
      // F2: create the record from this snapshot if the background initial
      // save has not landed yet, instead of silently dropping the flush.
      { ...session, ...updates }
    ).catch((err) => {
      console.warn("Transcript persist warning:", err);
    });
  };
  const persistTranscriptDebounced = () => {
    if (transcriptSaveTimer.current) {
      window.clearTimeout(transcriptSaveTimer.current);
      transcriptSaveTimer.current = null;
    }
    transcriptSaveTimer.current = window.setTimeout(() => {
      transcriptSaveTimer.current = null;
      void flushTranscriptNow("live");
    }, 1200);
  };
  const addStoredDuration = (stored, sessionSeconds) => {
    const match = /(\d+)\s*m\s*(\d+)\s*s/.exec(stored || "");
    const previous = match ? Number(match[1]) * 60 + Number(match[2]) : 0;
    const total = previous + Math.max(0, sessionSeconds);
    return `${Math.floor(total / 60)}m ${total % 60}s`;
  };
  const addTranscriptEntry = (entry) => {
    setLiveTranscript((prev) => {
      let next;
      if (entry.id.endsWith("-t")) {
        const baseId = entry.id.slice(0, -2);
        const idx = prev.findIndex((e) => e.id === baseId);
        if (idx !== -1) {
          next = [...prev];
          next[idx] = entry;
        } else {
          next = [...prev, entry];
        }
      } else {
        next = [...prev, entry];
      }
      sessionTranscriptRef.current = mergeTranscriptEntriesById(
        sessionBaseTranscriptRef.current,
        next
      );
      persistTranscriptDebounced();
      if (briefTimer.current) window.clearTimeout(briefTimer.current);
      const snapshot = next;
      briefTimer.current = window.setTimeout(() => {
        briefTimer.current = null;
        try {
          const topic = activeMeetingRef.current?.topic || "Active Meeting";
          const brief = buildLiveBrief(
            topic,
            mergeTranscriptEntriesById(sessionBaseTranscriptRef.current, snapshot)
          );
          if (brief) setLiveBrief(brief);
        } catch (err) {
          console.warn("Live brief build warning:", err);
        }
      }, 800);
      return next;
    });
  };
  const clearTranscript = () => {
    setLiveTranscript([]);
  };
  const addAssistantMessage = (msg) => {
    setAssistantMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.sender === msg.sender && last.text.trim() === msg.text.trim()) {
        return prev;
      }
      return [...prev, msg];
    });
  };
  const clearAssistantMessages = () => {
    setAssistantMessages([]);
  };
  const startMeetingSession = (config) => {
    if (!isProUser && freeMeetingsLeft <= 0) {
      setIsPlanModalOpen(true);
      return false;
    }
    if (!isProUser) {
      const updated = freeMeetingsLeft - 1;
      setFreeMeetingsLeft(updated);
      localStorage.setItem(FREE_MEETINGS_LEFT_KEY, updated.toString());
      localStorage.setItem(FREE_MEETINGS_LIMIT_KEY, String(MAX_FREE_MEETINGS));
    }
    const userId = config.userId || currentUser?.uid || "user-anonymous";
    let newMeeting;
    if (config.meeting && config.meeting.id) {
      newMeeting = {
        ...config.meeting,
        userId: config.meeting.userId || userId,
        transcript: config.meeting.transcript || [],
        resources: config.meeting.resources || [],
        status: "live"
      };
    } else {
      newMeeting = {
        // F2: reuse the caller's authoritative id when one is supplied; this is
        // the only place a session id may be created, and it is generated by
        // meetingService so HomePage, the local record, Firestore, resources,
        // transcript flushes and completion all share one id.
        id: config.meetingId || createMeetingId(),
        userId,
        title: config.topic || "Live Meeting Session",
        platform: config.platform || "Google Meet",
        meetingLink: config.meetingLink || "",
        topic: config.topic || "Live Session",
        selectedLanguage: selectedLanguage.code,
        pastedNotes: config.pastedNotes || "",
        resources: config.resources || [],
        createdAt: Date.now(),
        transcript: [],
        status: "live"
      };
    }
    if (activeMeetingRef.current?.id) {
      void flushTranscriptNow("live");
    }
    activeMeetingRef.current = newMeeting;
    setActiveMeeting(newMeeting);
    setLiveBrief(null);
    setCheckedActions(/* @__PURE__ */ new Set());
    setSessionStartTime(Date.now());
    sessionBaseTranscriptRef.current = mergeTranscriptEntriesById(newMeeting.transcript, []);
    sessionTranscriptRef.current = sessionBaseTranscriptRef.current;
    sessionStartTimeRef.current = Date.now();
    setLiveTranscript([]);
    setAssistantMessages([
      {
        id: "msg-init",
        sender: "assistant",
        actionType: "assist",
        text: `MEETX is now active and listening in ${selectedLanguage.name}. Click an action pill or ask any question.`,
        time: "0:00",
        followupSuggestions: ["What should I say?", "Follow-up questions", "Recap"]
      }
    ]);
    setIsPlatformClosed(true);
    setIsFloatingActive(true);
    setIsWidgetCollapsed(false);
    return true;
  };
  const stopMeetingSession = () => {
    const meeting = activeMeetingRef.current;
    if (transcriptSaveTimer.current) {
      window.clearTimeout(transcriptSaveTimer.current);
      transcriptSaveTimer.current = null;
    }
    if (meeting?.id && meeting?.userId) {
      const sessionSeconds = Math.max(
        0,
        Math.floor((Date.now() - sessionStartTimeRef.current) / 1e3)
      );
      void flushTranscriptNow("completed", addStoredDuration(meeting.duration, sessionSeconds));
    }
    if (briefTimer.current) {
      window.clearTimeout(briefTimer.current);
      briefTimer.current = null;
    }
    setLiveBrief(null);
    setIsFloatingActive(false);
    setIsPlatformClosed(false);
    activeMeetingRef.current = null;
    sessionBaseTranscriptRef.current = [];
    sessionTranscriptRef.current = [];
    setActiveMeeting(null);
    setLiveTranscript([]);
  };
  const askAssistantRequest = async (queryOrAction, actionType = "query") => {
    const elapsedSecs = Math.floor((Date.now() - sessionStartTime) / 1e3);
    const m = Math.floor(elapsedSecs / 60);
    const s = elapsedSecs % 60;
    const timeStr = `${m}:${s.toString().padStart(2, "0")}`;
    if (actionType === "query") {
      addAssistantMessage({
        id: Date.now().toString(),
        sender: "user",
        text: queryOrAction,
        time: timeStr
      });
    }
    setIsThinking(true);
    try {
      const session = activeMeetingRef.current;
      const response = await generateAssistantResponse(queryOrAction, actionType, {
        topic: session?.topic || "Active Meeting",
        pastedNotes: session?.pastedNotes || "",
        resources: session?.resources || [],
        language: selectedLanguage.name,
        transcript: buildMeetingTranscriptContext(session?.transcript, liveTranscript)
      });
      addAssistantMessage({
        id: (Date.now() + 1).toString(),
        sender: "assistant",
        actionType,
        text: response.text,
        time: timeStr,
        followupSuggestions: response.followupSuggestions
      });
    } finally {
      setIsThinking(false);
    }
  };
  const assistantQueueRef = useRef([]);
  const assistantBusyRef = useRef(false);
  const pumpAssistantQueue = () => {
    if (assistantBusyRef.current) return;
    const queue = assistantQueueRef.current;
    if (queue.length === 0) return;
    const index = queue.findIndex((item2) => !item2.auto);
    const at = index === -1 ? 0 : index;
    const [item] = queue.splice(at, 1);
    item.started = true;
    assistantBusyRef.current = true;
    item.run().catch(() => void 0).then(() => {
      assistantBusyRef.current = false;
      pumpAssistantQueue();
    });
  };
  const askAssistant = (queryOrAction, actionType = "query", options) => {
    const auto = options?.auto === true;
    let settle = () => {
    };
    const done = new Promise((resolve) => {
      settle = resolve;
    });
    const item = {
      run: async () => {
        try {
          await askAssistantRequest(queryOrAction, actionType);
        } finally {
          settle();
        }
      },
      auto,
      started: false,
      settle
    };
    if (auto) {
      const queue = assistantQueueRef.current;
      const superseded = queue.filter((q) => q.auto && !q.started);
      if (superseded.length > 0) {
        assistantQueueRef.current = queue.filter((q) => !(q.auto && !q.started));
        for (const q of superseded) q.settle();
      }
    }
    assistantQueueRef.current.push(item);
    pumpAssistantQueue();
    return done;
  };
  const currentMeetingTranscript = mergeTranscriptEntriesById(
    sessionBaseTranscriptRef.current,
    liveTranscript
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
    const flushOnLeave = () => {
      if (!activeMeetingRef.current) return;
      if (transcriptSaveTimer.current) {
        window.clearTimeout(transcriptSaveTimer.current);
        transcriptSaveTimer.current = null;
      }
      void flushTranscriptNow("live");
    };
    window.addEventListener("pagehide", flushOnLeave);
    window.addEventListener("beforeunload", flushOnLeave);
    return () => {
      window.removeEventListener("pagehide", flushOnLeave);
      window.removeEventListener("beforeunload", flushOnLeave);
    };
  }, []);
  return /* @__PURE__ */ jsx(
    MeetingContext.Provider,
    {
      value: {
        isDetectable,
        setIsDetectable,
        selectedLanguage,
        setSelectedLanguage,
        targetLanguage,
        setTargetLanguage,
        translationEnabled,
        speakTranslations,
        setSpeakTranslations,
        activeMeeting,
        setActiveMeeting,
        searchQuery,
        setSearchQuery,
        isFloatingActive,
        setIsFloatingActive,
        isWidgetCollapsed,
        setIsWidgetCollapsed,
        answerCardSize,
        setAnswerCardSize,
        increaseCardSize,
        decreaseCardSize,
        hideMeetxHidesWidget,
        setHideMeetxHidesWidget,
        isPlatformClosed,
        setIsPlatformClosed,
        freeMeetingsLeft,
        isProUser,
        isPlanModalOpen,
        setIsPlanModalOpen,
        upgradeToPro,
        liveTranscript,
        currentMeetingTranscript,
        addTranscriptEntry,
        clearTranscript,
        liveBrief,
        checkedActions,
        toggleActionCheck,
        assistantMessages,
        addAssistantMessage,
        clearAssistantMessages,
        sessionStartTime,
        startMeetingSession,
        stopMeetingSession,
        askAssistant,
        isThinking
      },
      children
    }
  );
};
var useMeeting = () => {
  const context = useContext(MeetingContext);
  if (!context) {
    throw new Error("useMeeting must be used within a MeetingProvider");
  }
  return context;
};

// meetx-stub:router-stub
var useNavigate = () => () => {
};

// meetx-stub:react-dom-stub
var createPortal = (children, container) => {
  globalThis.__meetxPortalContainer = container;
  return children;
};

// meetx-stub:icon-stub
var ArrowRight = () => null;
var Check = () => null;
var ChevronDown = () => null;
var ChevronUp = () => null;
var Copy = () => null;
var CreditCard = () => null;
var Eye = () => null;
var EyeOff = () => null;
var Languages = () => null;
var Layers = () => null;
var Loader2 = () => null;
var Maximize2 = () => null;
var MessageSquare = () => null;
var Mic = () => null;
var Minimize2 = () => null;
var MoreHorizontal = () => null;
var PictureInPicture = () => null;
var RotateCcw = () => null;
var Send = () => null;
var Sparkles = () => null;
var Square = () => null;
var Volume2 = () => null;
var VolumeX = () => null;

// src/services/translationService.ts
var cache = /* @__PURE__ */ new Map();
var MAX_CACHE = 500;
var base = (code) => (code || "en").split("-")[0].toLowerCase();
var remember = (key, value) => {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, value);
  return value;
};
async function viaMyMemory(text, from, to, signal) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(from + "|" + to)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const out = (data?.responseData?.translatedText || "").trim();
    if (!out || data?.responseStatus === 429) return null;
    return out;
  } catch {
    return null;
  }
}
async function viaLibre(text, from, to, signal) {
  try {
    const res = await fetch("https://libretranslate.com/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({ q: text, source: from, target: to, format: "text" })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out = (data?.translatedText || "").trim();
    return out || null;
  } catch {
    return null;
  }
}
async function viaGoogleWeb(text, from, to, signal) {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const out = Array.isArray(data) && Array.isArray(data[0]) ? data[0].map((seg) => Array.isArray(seg) ? String(seg[0] || "") : "").join("") : "";
    return out.trim() || null;
  } catch {
    return null;
  }
}
async function translateText(text, opts) {
  const src = base(opts.from);
  const dst = base(opts.to);
  const clean = (text || "").trim();
  if (!clean) return "";
  if (src === dst) return clean;
  const key = `${src}|${dst}|${clean}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const translators = [viaMyMemory, viaLibre, viaGoogleWeb];
  for (const fn of translators) {
    const out = await fn(clean, src, dst, opts.signal);
    if (out) return remember(key, out);
  }
  return clean;
}

// src/hooks/useSpeechToText.ts
var looksLikeQuestion = (text) => {
  const t = text.toLowerCase().trim();
  if (t.endsWith("?")) return true;
  return /^(what|how|should|can|could|would|tell me|explain|summar|giv|recap|assist|advise|help|meaning|reason|why)\b/.test(t);
};
var useSpeechToText = ({ language, targetLanguage, speakTranslations, onTranscriptReceived, onVoiceQuery, hostWindow }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [isTranslating, setIsTranslating] = useState(false);
  const recognitionRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const audioStreamRef = useRef(null);
  const openFocusedMicStream = useCallback(async () => {
    try {
      const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
      if (!md || typeof md.getUserMedia !== "function") return null;
      const stream = await md.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      });
      audioStreamRef.current = stream;
      return stream;
    } catch {
      return null;
    }
  }, []);
  const releaseMicStream = useCallback(() => {
    const stream = audioStreamRef.current;
    audioStreamRef.current = null;
    try {
      stream?.getTracks?.().forEach((track) => track.stop());
    } catch {
    }
  }, []);
  const callbacksRef = useRef({ onTranscriptReceived, onVoiceQuery });
  const optionsRef = useRef({ targetLanguage, speakTranslations });
  const isListeningRef = useRef(false);
  useEffect(() => {
    callbacksRef.current = { onTranscriptReceived, onVoiceQuery };
    optionsRef.current = { targetLanguage, speakTranslations };
  });
  const formatTimestamp = (millis) => {
    const totalSecs = Math.floor(millis / 1e3);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };
  const startTokenRef = useRef(0);
  const startListening = useCallback(() => {
    const host = hostWindow ?? window;
    const SpeechRecognition = host.SpeechRecognition || host.webkitSpeechRecognition || window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setIsListening(true);
      isListeningRef.current = true;
      return;
    }
    if (isListeningRef.current) return;
    const token = startTokenRef.current += 1;
    isListeningRef.current = true;
    const buildAndStart = (stream) => {
      try {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.lang = language || "en-US";
        if (stream) {
          try {
            recognition.stream = stream;
          } catch {
          }
        }
        recognition.onresult = (event) => {
          const { onTranscriptReceived: emitTranscript, onVoiceQuery: emitVoiceQuery } = callbacksRef.current;
          const { targetLanguage: liveTargetLanguage, speakTranslations: liveSpeakTranslations } = optionsRef.current;
          const lastResult2 = event.results[event.results.length - 1];
          if (lastResult2.isFinal) {
            const text = lastResult2[0].transcript.trim();
            if (text) {
              const timeOffset = Date.now() - startTimeRef.current;
              const id = Date.now().toString();
              const srcLang = language;
              const dstLang = liveTargetLanguage && liveTargetLanguage !== srcLang ? liveTargetLanguage : void 0;
              if (dstLang) {
                emitTranscript({
                  id,
                  speakerId: "Speaker",
                  text,
                  originalText: text,
                  translatedText: "\u2026translating\u2026",
                  timestamp: formatTimestamp(timeOffset),
                  language: srcLang,
                  targetLanguage: dstLang
                });
                setIsTranslating(true);
                translateText(text, { from: srcLang, to: dstLang }).then((translated) => {
                  emitTranscript({
                    id: `${id}-t`,
                    speakerId: "Speaker",
                    text: translated,
                    originalText: text,
                    translatedText: translated,
                    timestamp: formatTimestamp(Date.now() - startTimeRef.current),
                    language: dstLang,
                    targetLanguage: dstLang
                  });
                  if (liveSpeakTranslations && "speechSynthesis" in window) {
                    try {
                      const utter = new SpeechSynthesisUtterance(translated);
                      utter.lang = dstLang;
                      window.speechSynthesis.speak(utter);
                    } catch {
                    }
                  }
                  if (emitVoiceQuery && looksLikeQuestion(translated)) {
                    emitVoiceQuery(translated);
                  }
                }).finally(() => setIsTranslating(false));
              } else {
                emitTranscript({
                  id,
                  speakerId: "Speaker",
                  text,
                  timestamp: formatTimestamp(timeOffset),
                  language: srcLang
                });
                if (liveSpeakTranslations && "speechSynthesis" in window) {
                  try {
                    const utter = new SpeechSynthesisUtterance(text);
                    utter.lang = srcLang;
                    window.speechSynthesis.speak(utter);
                  } catch {
                  }
                }
                if (emitVoiceQuery && looksLikeQuestion(text)) {
                  emitVoiceQuery(text);
                }
              }
            }
          }
        };
        recognition.onerror = (err) => {
          console.warn("Speech recognition warning:", err);
        };
        recognition.onend = () => {
          if (recognitionRef.current === recognition && isListeningRef.current) {
            try {
              recognition.start();
            } catch {
            }
          }
        };
        recognition.start();
        recognitionRef.current = recognition;
        startTimeRef.current = Date.now();
        isListeningRef.current = true;
        setIsListening(true);
      } catch (err) {
        console.warn("Error starting speech recognition:", err);
        setIsListening(true);
        isListeningRef.current = true;
      }
    };
    buildAndStart(null);
    void (async () => {
      const stream = await openFocusedMicStream();
      if (!stream || startTokenRef.current !== token || !isListeningRef.current) {
        if (stream && audioStreamRef.current !== stream) {
          try {
            stream.getTracks().forEach((t) => t.stop());
          } catch {
          }
        }
        return;
      }
      try {
        recognitionRef.current?.stop();
      } catch {
      }
      buildAndStart(stream);
    })();
  }, [language, hostWindow, openFocusedMicStream, releaseMicStream]);
  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    startTokenRef.current += 1;
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    releaseMicStream();
    setIsListening(false);
  }, [releaseMicStream]);
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      startTokenRef.current += 1;
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      releaseMicStream();
    };
  }, [releaseMicStream]);
  return {
    isListening,
    isSupported,
    isTranslating,
    startListening,
    stopListening
  };
};

// src/hooks/useDesktopAssistantWindow.ts
var PIP_WIDTH = 520;
var PIP_HEIGHT = 700;
var CONTAINER_ID = "meetx-desktop-assistant-root";
var copyStyleSheets = (targetWindow) => {
  const sheets = typeof document !== "undefined" && document.styleSheets ? Array.from(document.styleSheets) : [];
  for (const sheet of sheets) {
    try {
      const rules = Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
      const style = targetWindow.document.createElement("style");
      style.textContent = rules;
      targetWindow.document.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = targetWindow.document.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        targetWindow.document.head.appendChild(link);
      }
    }
  }
};
var useDesktopAssistantWindow = () => {
  const [pipWindow, setPipWindow] = useState(null);
  const pipWindowRef = useRef(null);
  const containerRef = useRef(null);
  const openingRef = useRef(false);
  const mountedRef = useRef(false);
  const unmountTimerRef = useRef(null);
  const isSupported = typeof window !== "undefined" && "documentPictureInPicture" in window;
  const clearWindow = useCallback((win) => {
    if (pipWindowRef.current !== win) return;
    pipWindowRef.current = null;
    containerRef.current = null;
    setPipWindow(null);
  }, []);
  const openWindow = useCallback(async () => {
    const controller = typeof window !== "undefined" ? window.documentPictureInPicture : void 0;
    if (!controller) return null;
    if (controller.window) return controller.window;
    if (openingRef.current) return null;
    openingRef.current = true;
    try {
      const win = await controller.requestWindow({
        width: PIP_WIDTH,
        height: PIP_HEIGHT
      });
      copyStyleSheets(win);
      const doc2 = win.document;
      doc2.body.style.margin = "0";
      doc2.body.style.minHeight = "100vh";
      doc2.body.style.background = "#151822";
      doc2.body.style.overflow = "auto";
      const container = doc2.createElement("div");
      container.id = CONTAINER_ID;
      container.style.minHeight = "100vh";
      doc2.body.appendChild(container);
      win.addEventListener("pagehide", () => clearWindow(win), { once: true });
      containerRef.current = container;
      pipWindowRef.current = win;
      setPipWindow(win);
      return win;
    } catch (err) {
      console.warn("Desktop floating window could not open:", err);
      return null;
    } finally {
      openingRef.current = false;
    }
  }, [clearWindow]);
  const closeWindow = useCallback(() => {
    const win = pipWindowRef.current;
    if (!win) return;
    try {
      win.close();
    } catch {
    }
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
    return () => {
      mountedRef.current = false;
      unmountTimerRef.current = window.setTimeout(() => {
        unmountTimerRef.current = null;
        if (!mountedRef.current && pipWindowRef.current) {
          try {
            pipWindowRef.current.close();
          } catch {
          }
        }
      }, 0);
    };
  }, []);
  return {
    isSupported,
    isOpen: pipWindow !== null,
    window: pipWindow,
    container: pipWindow ? containerRef.current : null,
    openWindow,
    closeWindow
  };
};

// src/components/assistant/LiveConversationPane.tsx
var LiveConversationPane = ({
  liveTranscript,
  onCopy,
  copiedId,
  onQuickAction,
  isListening,
  isSupported
}) => {
  if (liveTranscript.length === 0) {
    const unsupported = isSupported === false;
    const head = unsupported ? "Speech recognition is not available in this browser." : isListening === false ? "The microphone is off \u2014 no speech is being captured." : "Listening for the other side\u2026 speak now.";
    const hint = unsupported ? "Open MEETX in Chrome or Edge (with mic permission) to capture the conversation. The AI can still answer from your topic, notes and documents until then." : isListening === false ? "Turn the microphone on in MEETX so the live conversation \u2014 and therefore the AI answers \u2014 are based on what is actually being said." : "Chrome/Edge + mic permission required. Each remark appears here instantly.";
    return /* @__PURE__ */ jsxs("div", { className: "py-4 text-center text-slate-400 flex flex-col items-center gap-1.5", children: [
      /* @__PURE__ */ jsx(Mic, { className: `w-4 h-4 ${isListening === false ? "text-slate-500" : "text-emerald-400 animate-pulse"}` }),
      /* @__PURE__ */ jsx("span", { children: head }),
      /* @__PURE__ */ jsx("span", { className: "text-[10px] text-slate-500", children: hint })
    ] });
  }
  const turns = groupTranscriptBySpeaker(liveTranscript);
  return /* @__PURE__ */ jsx("div", { className: "pt-1 space-y-2.5", children: turns.map((turn, ti) => /* @__PURE__ */ jsxs("div", { className: "rounded-xl bg-slate-800/50 border border-slate-700/60 p-2.5", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between mb-1", children: [
      /* @__PURE__ */ jsx("span", { className: "text-[11px] font-bold text-emerald-300", children: turn.speaker }),
      /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-slate-500", children: [
        turn.lastAt,
        " \u2022 ",
        turn.lines.length,
        " remark",
        turn.lines.length === 1 ? "" : "s"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "space-y-1.5", children: turn.lines.map((line) => {
      const shown = line.translatedText && !line.translatedText.includes("translating") ? line.translatedText : line.text;
      const pending = (line.translatedText || "").includes("translating");
      return /* @__PURE__ */ jsxs("div", { className: "text-[11px] leading-relaxed", children: [
        /* @__PURE__ */ jsx("span", { className: "text-slate-500 mr-1.5", children: line.timestamp }),
        /* @__PURE__ */ jsx("span", { className: "text-slate-100", children: shown }),
        line.originalText && !pending && line.originalText !== shown && /* @__PURE__ */ jsxs("div", { className: "text-[10px] text-slate-500 mt-0.5", children: [
          "Original: ",
          line.originalText
        ] }),
        pending && /* @__PURE__ */ jsx("div", { className: "text-[10px] text-emerald-400 animate-pulse", children: "\u2026translating\u2026" }),
        /* @__PURE__ */ jsxs("div", { className: "mt-1 flex flex-wrap gap-1", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => onQuickAction("whatToSay"),
              className: "px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-400/20 text-[9px] text-blue-300 hover:bg-blue-500/20 cursor-pointer",
              children: "What to say"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => onQuickAction("followUp"),
              className: "px-1.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-400/20 text-[9px] text-teal-300 hover:bg-teal-500/20 cursor-pointer",
              children: "Follow-up"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => onQuickAction("recap"),
              className: "px-1.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-400/20 text-[9px] text-amber-300 hover:bg-amber-500/20 cursor-pointer",
              children: "Recap"
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => onCopy(line.id, shown),
              className: "px-1.5 py-0.5 rounded-full bg-slate-700/60 border border-slate-600/60 text-[9px] text-slate-300 hover:text-white cursor-pointer",
              children: copiedId === line.id ? "Copied!" : "Copy"
            }
          )
        ] })
      ] }, line.id);
    }) })
  ] }, ti)) });
};

// src/components/assistant/LiveBriefPane.tsx
var LiveBriefPane = ({ liveBrief, checkedActions, toggleActionCheck }) => {
  if (!liveBrief) {
    return /* @__PURE__ */ jsx("div", { className: "py-4 text-center text-slate-400 text-[11px]", children: "No conversation yet \u2014 the live title, summary, actions, deadlines and reminders appear here as people speak." });
  }
  const doneCount = liveBrief.actions.filter((a) => checkedActions.has(a.id)).length;
  return /* @__PURE__ */ jsxs("div", { className: "pt-1 space-y-2.5", children: [
    /* @__PURE__ */ jsxs("div", { className: "rounded-xl bg-blue-500/10 border border-blue-400/25 p-2.5", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] uppercase tracking-wider text-blue-300 font-bold mb-0.5", children: "Title" }),
      /* @__PURE__ */ jsx("div", { className: "text-xs font-semibold text-white", children: liveBrief.title }),
      /* @__PURE__ */ jsx("div", { className: "text-[11px] text-slate-300 mt-1 leading-relaxed", children: liveBrief.summary })
    ] }),
    liveBrief.keyPoints.length > 0 && /* @__PURE__ */ jsxs("div", { className: "rounded-xl bg-slate-800/50 border border-slate-700/60 p-2.5", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1", children: "Summary \u2022 key points" }),
      /* @__PURE__ */ jsx("ul", { className: "space-y-1 text-[11px] text-slate-200", children: liveBrief.keyPoints.map((k, i) => /* @__PURE__ */ jsxs("li", { children: [
        "\u2022 ",
        k
      ] }, i)) })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "rounded-xl bg-slate-800/50 border border-slate-700/60 p-2.5", children: [
      /* @__PURE__ */ jsxs("div", { className: "text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1", children: [
        "Actions (",
        doneCount,
        "/",
        liveBrief.actions.length,
        " done)"
      ] }),
      liveBrief.actions.length === 0 ? /* @__PURE__ */ jsx("div", { className: "text-[11px] text-slate-500", children: "No action items detected yet." }) : /* @__PURE__ */ jsx("ul", { className: "space-y-1.5", children: liveBrief.actions.map((a) => /* @__PURE__ */ jsxs("li", { className: "flex items-start gap-2 text-[11px]", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "checkbox",
            checked: checkedActions.has(a.id),
            onChange: () => toggleActionCheck(a.id),
            className: "mt-0.5 accent-emerald-500 w-3 h-3"
          }
        ),
        /* @__PURE__ */ jsxs(
          "span",
          {
            className: checkedActions.has(a.id) ? "line-through text-slate-500" : "text-slate-200",
            children: [
              a.text,
              a.assignee && /* @__PURE__ */ jsxs("span", { className: "ml-1 px-1 rounded bg-indigo-500/20 text-indigo-300 text-[9px]", children: [
                "@",
                a.assignee
              ] }),
              a.dueDate && /* @__PURE__ */ jsx("span", { className: "ml-1 px-1 rounded bg-amber-500/20 text-amber-300 text-[9px]", children: a.dueDate })
            ]
          }
        )
      ] }, a.id)) })
    ] }),
    liveBrief.deadlines.length > 0 && /* @__PURE__ */ jsxs("div", { className: "rounded-xl bg-amber-500/10 border border-amber-400/25 p-2.5", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] uppercase tracking-wider text-amber-300 font-bold mb-1", children: "Deadlines" }),
      /* @__PURE__ */ jsx("ul", { className: "space-y-1 text-[11px] text-amber-100", children: liveBrief.deadlines.map((d) => /* @__PURE__ */ jsxs("li", { children: [
        "\u23F0 ",
        d.date,
        " \u2014 ",
        d.text.slice(0, 120)
      ] }, d.id)) })
    ] }),
    liveBrief.reminders.length > 0 && /* @__PURE__ */ jsxs("div", { className: "rounded-xl bg-emerald-500/10 border border-emerald-400/25 p-2.5", children: [
      /* @__PURE__ */ jsx("div", { className: "text-[10px] uppercase tracking-wider text-emerald-300 font-bold mb-1", children: "Reminders" }),
      /* @__PURE__ */ jsx("ul", { className: "space-y-1 text-[11px] text-emerald-100", children: liveBrief.reminders.map((r, i) => /* @__PURE__ */ jsx("li", { children: r }, i)) })
    ] })
  ] });
};

// src/components/assistant/FloatingAssistantWidget.tsx
var renderMessageContent = (text, msgId, copiedId, onCopy) => {
  if (text.includes("```")) {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const raw = part.slice(3, -3);
        const newlineIdx = raw.indexOf("\n");
        const lang = newlineIdx !== -1 ? raw.slice(0, newlineIdx).trim() : "";
        const code = newlineIdx !== -1 ? raw.slice(newlineIdx + 1) : raw;
        const codeId = `${msgId}-code-${i}`;
        const isCopied = copiedId === codeId;
        return /* @__PURE__ */ jsxs(
          "div",
          {
            className: "my-2.5 rounded-xl bg-[#0d1117] border border-slate-700/70 overflow-hidden select-text shadow-lg",
            children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/60 text-[10px]", children: [
                /* @__PURE__ */ jsx("span", { className: "text-[10px] uppercase tracking-wider text-slate-300 font-mono font-semibold", children: lang || "Code" }),
                /* @__PURE__ */ jsx(
                  "button",
                  {
                    type: "button",
                    onClick: () => onCopy(codeId, code),
                    className: "flex items-center gap-1 text-[10px] text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-slate-700/50",
                    title: "Copy code snippet",
                    children: isCopied ? /* @__PURE__ */ jsxs(Fragment, { children: [
                      /* @__PURE__ */ jsx(Check, { className: "w-3 h-3 text-emerald-400" }),
                      /* @__PURE__ */ jsx("span", { className: "text-emerald-400 font-medium", children: "Copied" })
                    ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                      /* @__PURE__ */ jsx(Copy, { className: "w-3 h-3 text-slate-400" }),
                      /* @__PURE__ */ jsx("span", { children: "Copy code" })
                    ] })
                  }
                )
              ] }),
              /* @__PURE__ */ jsx("pre", { className: "p-3 font-mono text-[11px] leading-relaxed text-emerald-300 overflow-x-auto whitespace-pre", children: code })
            ]
          },
          i
        );
      }
      return /* @__PURE__ */ jsx("div", { className: "whitespace-pre-line leading-relaxed", children: part }, i);
    });
  }
  return /* @__PURE__ */ jsx("div", { className: "whitespace-pre-line leading-relaxed", children: text });
};
var VIEWPORT_MARGIN = 10;
var FALLBACK_WIDGET_WIDTH = 500;
var FALLBACK_WIDGET_HEIGHT = 200;
var clampWidgetPosition = (nextPosition, widget, viewport = window) => {
  const width = widget?.offsetWidth || FALLBACK_WIDGET_WIDTH;
  const height = widget?.offsetHeight || FALLBACK_WIDGET_HEIGHT;
  const availableWidth = Math.max(0, viewport.innerWidth - width);
  const availableHeight = Math.max(0, viewport.innerHeight - height);
  const minX = Math.min(VIEWPORT_MARGIN, availableWidth);
  const minY = Math.min(VIEWPORT_MARGIN, availableHeight);
  const maxX = Math.max(minX, availableWidth - VIEWPORT_MARGIN);
  const maxY = Math.max(minY, availableHeight - VIEWPORT_MARGIN);
  return {
    x: Math.min(Math.max(nextPosition.x, minX), maxX),
    y: Math.min(Math.max(nextPosition.y, minY), maxY)
  };
};
var WIDGET_POSITION_KEY = "meetx_widget_position";
var getInitialWidgetPosition = () => {
  try {
    const saved = typeof localStorage !== "undefined" ? JSON.parse(localStorage.getItem(WIDGET_POSITION_KEY) || "null") : null;
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      return clampWidgetPosition(saved, null);
    }
  } catch {
  }
  return clampWidgetPosition(
    {
      x: window.innerWidth / 2 - FALLBACK_WIDGET_WIDTH / 2,
      y: 25
    },
    null
  );
};
var FloatingAssistantWidget = () => {
  const navigate = useNavigate();
  const {
    isFloatingActive,
    isWidgetCollapsed,
    setIsWidgetCollapsed,
    answerCardSize,
    increaseCardSize,
    decreaseCardSize,
    stopMeetingSession,
    activeMeeting,
    selectedLanguage,
    targetLanguage,
    setTargetLanguage,
    translationEnabled,
    speakTranslations,
    setSpeakTranslations,
    liveTranscript,
    currentMeetingTranscript,
    liveBrief,
    checkedActions,
    toggleActionCheck,
    isDetectable,
    setIsDetectable,
    hideMeetxHidesWidget,
    setHideMeetxHidesWidget,
    setIsPlatformClosed,
    setIsPlanModalOpen,
    freeMeetingsLeft,
    isProUser,
    assistantMessages,
    clearAssistantMessages,
    askAssistant,
    addTranscriptEntry,
    isThinking
  } = useMeeting();
  const [inputQuery, setInputQuery] = useState("");
  const [activeAssistantMode, setActiveAssistantMode] = useState("assist");
  const [liveTab, setLiveTab] = useState("answers");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const widgetRef = useRef(null);
  const menuRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [position, setPosition] = useState(getInitialWidgetPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [copiedId, setCopiedId] = useState(null);
  const handleCopy = (id, textToCopy) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(textToCopy);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopiedId(id);
    setTimeout(() => {
      setCopiedId((prev) => prev === id ? null : prev);
    }, 2e3);
  };
  const lastAutoAnsweredId = useRef(null);
  const lastAutoAnsweredTextRef = useRef("");
  const autoFollowRef = useRef(true);
  useEffect(() => {
    if (!autoFollowRef.current || liveTranscript.length === 0) return;
    const last = liveTranscript[liveTranscript.length - 1];
    if (!last || last.id === lastAutoAnsweredId.current) return;
    if (last.id.endsWith("-t") === false && (last.translatedText || "").includes("translating")) return;
    const text = (last.translatedText && !last.translatedText.includes("translating") ? last.translatedText : last.text || "").trim().toLowerCase();
    if (text && text === lastAutoAnsweredTextRef.current) {
      lastAutoAnsweredId.current = last.id;
      return;
    }
    lastAutoAnsweredId.current = last.id;
    lastAutoAnsweredTextRef.current = text;
    if (activeAssistantMode === "whatToSay") void askAssistant("What should I say right now to the interviewer/meeting?", "say", { auto: true });
    else if (activeAssistantMode === "followUp") void askAssistant("Give me smart follow-up questions to ask.", "followup", { auto: true });
    else if (activeAssistantMode === "recap") void askAssistant("Give me a quick recap of the conversation so far.", "recap", { auto: true });
    else void askAssistant("Please assist me with key points and advice for this meeting.", "assist", { auto: true });
  }, [liveTranscript.length]);
  const {
    isSupported: isDesktopWindowSupported,
    window: desktopWindow,
    container: desktopContainer,
    openWindow: openDesktopWindow,
    closeWindow: closeDesktopWindow
  } = useDesktopAssistantWindow();
  const hostEventTarget = desktopWindow ?? window;
  const hostDocument = desktopWindow?.document ?? document;
  const { startListening, stopListening, isTranslating, isListening, isSupported } = useSpeechToText({
    language: selectedLanguage.code,
    hostWindow: desktopWindow ?? void 0,
    targetLanguage: translationEnabled ? targetLanguage.code : void 0,
    speakTranslations,
    onTranscriptReceived: (entry) => {
      addTranscriptEntry(entry);
    },
    onVoiceQuery: (text) => {
      askAssistant(text, "query");
    }
  });
  useEffect(() => {
    if (isFloatingActive) {
      startListening();
    } else {
      stopListening();
    }
    return () => {
      stopListening();
    };
  }, [isFloatingActive, startListening, stopListening]);
  const wasMeetingActiveRef = useRef(false);
  useEffect(() => {
    if (!isDesktopWindowSupported) return;
    if (isFloatingActive && !wasMeetingActiveRef.current) {
      void openDesktopWindow();
    } else if (!isFloatingActive && wasMeetingActiveRef.current) {
      closeDesktopWindow();
    }
    wasMeetingActiveRef.current = isFloatingActive;
  }, [isFloatingActive, isDesktopWindowSupported, openDesktopWindow, closeDesktopWindow]);
  useEffect(() => {
    if (isDragging) return;
    try {
      localStorage.setItem(WIDGET_POSITION_KEY, JSON.stringify(position));
    } catch {
    }
  }, [position, isDragging]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [assistantMessages, isWidgetCollapsed, answerCardSize, isThinking]);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === "\\") {
        e.preventDefault();
        setIsWidgetCollapsed(!isWidgetCollapsed);
      }
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (inputQuery.trim()) {
          handleSend();
        } else {
          askAssistant("What should I say right now based on our context?", "say");
        }
      }
      if (e.ctrlKey && e.key === "r" && e.shiftKey) {
        e.preventDefault();
        clearAssistantMessages();
      }
      if (e.ctrlKey && e.shiftKey && e.key === "|") {
        e.preventDefault();
        stopMeetingSession();
      }
    };
    hostEventTarget.addEventListener("keydown", handleKeyDown);
    return () => hostEventTarget.removeEventListener("keydown", handleKeyDown);
  }, [isWidgetCollapsed, inputQuery, askAssistant, clearAssistantMessages, stopMeetingSession, hostEventTarget]);
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsMenuOpen(false);
      }
    };
    hostDocument.addEventListener("mousedown", handleOutsideClick);
    return () => hostDocument.removeEventListener("mousedown", handleOutsideClick);
  }, [hostDocument]);
  useEffect(() => {
    const viewport = desktopWindow ?? window;
    const handleViewportResize = () => {
      setPosition(
        (currentPosition) => clampWidgetPosition(currentPosition, widgetRef.current, viewport)
      );
    };
    handleViewportResize();
    viewport.addEventListener("resize", handleViewportResize);
    return () => viewport.removeEventListener("resize", handleViewportResize);
  }, [desktopWindow]);
  const handleMouseDown = (e) => {
    if (e.target.closest(".drag-handle")) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDragging) {
        setPosition(clampWidgetPosition(
          {
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y
          },
          widgetRef.current
        ));
      }
    };
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    if (isDragging) {
      hostEventTarget.addEventListener("mousemove", handleMouseMove);
      hostEventTarget.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      hostEventTarget.removeEventListener("mousemove", handleMouseMove);
      hostEventTarget.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, dragOffset, hostEventTarget]);
  if (!isFloatingActive) return null;
  const handleLogoClick = () => {
    setIsPlatformClosed(false);
    navigate("/home");
  };
  const handleSend = () => {
    const q = inputQuery.trim();
    if (!q) return;
    setInputQuery("");
    void askAssistant(q, "query");
  };
  const handleAssistantModeChange = (mode) => {
    setActiveAssistantMode(mode);
    switch (mode) {
      case "assist":
        askAssistant("Please assist me with key points and advice for this meeting.", "assist");
        break;
      case "whatToSay":
        askAssistant("What should I say right now to the interviewer/meeting?", "say");
        break;
      case "followUp":
        askAssistant("Give me smart follow-up questions to ask.", "followup");
        break;
      case "recap":
        askAssistant("Give me a quick recap of the conversation so far.", "recap");
        break;
    }
  };
  const assistantModeButtonClass = (mode) => {
    const isActive = activeAssistantMode === mode;
    return `flex items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer ${isActive ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20" : "text-slate-300 hover:bg-white/10 hover:text-white"}`;
  };
  const cardHeightClasses = {
    compact: "max-h-36",
    normal: "max-h-56",
    expanded: "max-h-[380px]"
  };
  const widgetNode = /* @__PURE__ */ jsxs(
    "div",
    {
      ref: widgetRef,
      style: { left: `${position.x}px`, top: `${position.y}px` },
      onMouseDown: handleMouseDown,
      className: "fixed z-[9999] flex flex-col items-center select-none font-sans",
      children: [
        /* @__PURE__ */ jsxs("div", { className: "drag-handle cursor-move flex items-center gap-2 px-3 py-1.5 bg-[#232733]/95 hover:bg-[#232733] border border-slate-700/70 rounded-full shadow-2xl backdrop-blur-md transition-all", children: [
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: handleLogoClick,
              title: "Return to Home Page",
              className: "h-6 w-10 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 hover:scale-105 active:scale-95 flex items-center justify-center text-white shadow-sm transition-transform cursor-pointer overflow-hidden",
              children: /* @__PURE__ */ jsx("span", { className: "text-white text-sm font-extrabold leading-none", children: "M" })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setIsWidgetCollapsed(!isWidgetCollapsed),
              title: isWidgetCollapsed ? "Show assistant" : "Hide assistant",
              "aria-label": isWidgetCollapsed ? "Show assistant" : "Hide assistant",
              className: "h-6 w-6 rounded-full text-slate-300 hover:text-white hover:bg-slate-700/50 flex items-center justify-center transition-colors cursor-pointer",
              children: isWidgetCollapsed ? /* @__PURE__ */ jsx(ChevronUp, { className: "w-3.5 h-3.5" }) : /* @__PURE__ */ jsx(ChevronDown, { className: "w-3.5 h-3.5" })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => setIsWidgetCollapsed(!isWidgetCollapsed),
              className: "h-6 px-2 rounded-full text-xs font-semibold text-slate-200 hover:text-white hover:bg-slate-700/50 transition-colors cursor-pointer",
              children: isWidgetCollapsed ? "Show" : "Hide"
            }
          ),
          isDesktopWindowSupported && /* @__PURE__ */ jsx(
            "button",
            {
              type: "button",
              onClick: () => {
                if (desktopWindow) closeDesktopWindow();
                else void openDesktopWindow();
              },
              title: desktopWindow ? "Close desktop floating window (meeting keeps running)" : "Open desktop floating window (always on top)",
              "aria-label": desktopWindow ? "Close desktop floating window" : "Open desktop floating window",
              className: `h-6 w-6 rounded-full flex items-center justify-center transition-colors cursor-pointer ${desktopWindow ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25" : "text-slate-300 hover:text-white hover:bg-slate-700/50"}`,
              children: /* @__PURE__ */ jsx(PictureInPicture, { className: "w-3.5 h-3.5" })
            }
          ),
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: stopMeetingSession,
              title: "Stop session (Ctrl+Shift+\\)",
              "aria-label": "Stop session",
              className: "h-6 w-6 rounded-full bg-slate-800 hover:bg-rose-600 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer",
              children: /* @__PURE__ */ jsx(Square, { className: "w-2.5 h-2.5 fill-current" })
            }
          )
        ] }),
        !isWidgetCollapsed && /* @__PURE__ */ jsxs("div", { className: "mt-2.5 w-[460px] sm:w-[490px] bg-[#1a1d26]/95 border border-slate-700/70 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-visible animate-in fade-in zoom-in-95 duration-150 text-white", children: [
          /* @__PURE__ */ jsxs("div", { className: "px-4 pt-3 flex items-center gap-2 text-[11px]", children: [
            /* @__PURE__ */ jsxs("span", { className: `flex items-center gap-1.5 px-2 py-1 rounded-lg border ${translationEnabled ? "bg-emerald-500/10 border-emerald-400/30 text-emerald-300" : "bg-slate-800/60 border-slate-700/60 text-slate-300"}`, children: [
              /* @__PURE__ */ jsx(Languages, { className: "w-3.5 h-3.5" }),
              /* @__PURE__ */ jsx("span", { className: "font-semibold", children: translationEnabled ? `Live translate \u2192 ${targetLanguage.name}` : "Translation off" })
            ] }),
            /* @__PURE__ */ jsx(
              "select",
              {
                value: targetLanguage.code,
                onChange: (e) => {
                  const found = SUPPORTED_LANGUAGES.find((l) => l.code === e.target.value);
                  if (found) setTargetLanguage(found);
                },
                title: "Subtitle language \u2014 pick a different language than speech to translate live",
                className: "px-2 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-200 text-[11px] outline-none focus:border-emerald-400 cursor-pointer max-w-[150px]",
                children: SUPPORTED_LANGUAGES.map((l) => /* @__PURE__ */ jsx("option", { value: l.code, children: l.code === selectedLanguage.code ? `\u2713 ${l.name} (speech)` : l.name }, l.code))
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => setSpeakTranslations(!speakTranslations),
                title: speakTranslations ? "Mute spoken translations" : "Speak translations aloud",
                className: `p-1.5 rounded-lg border transition-colors cursor-pointer ${speakTranslations ? "bg-emerald-500/15 border-emerald-400/30 text-emerald-300" : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"}`,
                children: speakTranslations ? /* @__PURE__ */ jsx(Volume2, { className: "w-3.5 h-3.5" }) : /* @__PURE__ */ jsx(VolumeX, { className: "w-3.5 h-3.5" })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "drag-handle cursor-move px-4 pt-3.5 pb-2.5 flex items-center justify-between border-b border-slate-800/80 text-xs font-medium text-slate-300", children: [
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: () => handleAssistantModeChange("assist"),
                "aria-pressed": activeAssistantMode === "assist",
                className: assistantModeButtonClass("assist"),
                children: [
                  /* @__PURE__ */ jsx(Sparkles, { className: "w-3.5 h-3.5 text-blue-400" }),
                  /* @__PURE__ */ jsx("span", { children: "Assist" })
                ]
              }
            ),
            /* @__PURE__ */ jsx("span", { className: "text-slate-600", children: "\u2022" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => handleAssistantModeChange("whatToSay"),
                "aria-pressed": activeAssistantMode === "whatToSay",
                className: assistantModeButtonClass("whatToSay"),
                children: /* @__PURE__ */ jsx("span", { children: "What should I say?" })
              }
            ),
            /* @__PURE__ */ jsx("span", { className: "text-slate-600", children: "\u2022" }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: () => handleAssistantModeChange("followUp"),
                "aria-pressed": activeAssistantMode === "followUp",
                className: assistantModeButtonClass("followUp"),
                children: [
                  /* @__PURE__ */ jsx(MessageSquare, { className: "w-3.5 h-3.5 text-teal-400" }),
                  /* @__PURE__ */ jsx("span", { children: "Follow-up questions" })
                ]
              }
            ),
            /* @__PURE__ */ jsx("span", { className: "text-slate-600", children: "\u2022" }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                type: "button",
                onClick: () => handleAssistantModeChange("recap"),
                "aria-pressed": activeAssistantMode === "recap",
                className: assistantModeButtonClass("recap"),
                children: [
                  /* @__PURE__ */ jsx(RotateCcw, { className: "w-3.5 h-3.5 text-amber-400" }),
                  /* @__PURE__ */ jsx("span", { children: "Recap" })
                ]
              }
            ),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 ml-1 pl-2 border-l border-slate-700/80", children: [
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: decreaseCardSize,
                  disabled: answerCardSize === "compact",
                  title: "Decrease answer card size",
                  className: "p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer",
                  children: /* @__PURE__ */ jsx(Minimize2, { className: "w-3 h-3" })
                }
              ),
              /* @__PURE__ */ jsx(
                "button",
                {
                  onClick: increaseCardSize,
                  disabled: answerCardSize === "expanded",
                  title: "Increase answer card size",
                  className: "p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer",
                  children: /* @__PURE__ */ jsx(Maximize2, { className: "w-3 h-3" })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "px-4 pt-2 flex items-center gap-1.5 text-[11px]", children: [
            /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setLiveTab("answers"), className: "px-2.5 py-1 rounded-lg border font-semibold transition-colors cursor-pointer " + (liveTab === "answers" ? "bg-blue-600/20 border-blue-400/40 text-blue-200" : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"), children: "Answers" }),
            /* @__PURE__ */ jsxs("button", { type: "button", onClick: () => setLiveTab("conversation"), className: "px-2.5 py-1 rounded-lg border font-semibold transition-colors cursor-pointer " + (liveTab === "conversation" ? "bg-blue-600/20 border-blue-400/40 text-blue-200" : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"), children: [
              "Live conversation (",
              currentMeetingTranscript.length,
              ")"
            ] }),
            /* @__PURE__ */ jsx("button", { type: "button", onClick: () => setLiveTab("brief"), className: "px-2.5 py-1 rounded-lg border font-semibold transition-colors cursor-pointer " + (liveTab === "brief" ? "bg-blue-600/20 border-blue-400/40 text-blue-200" : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white"), children: "Title-Summary-Actions" })
          ] }),
          liveTab === "conversation" ? /* @__PURE__ */ jsx(LiveConversationPane, { liveTranscript: currentMeetingTranscript, liveBrief, checkedActions, toggleActionCheck, copiedId, onCopy: handleCopy, onQuickAction: (m) => {
            setLiveTab("answers");
            handleAssistantModeChange(m);
          }, isListening, isSupported }) : liveTab === "brief" ? /* @__PURE__ */ jsx(LiveBriefPane, { liveBrief, checkedActions, toggleActionCheck }) : (
            /* liveTab panes */
            /* @__PURE__ */ jsxs("div", { className: `${cardHeightClasses[answerCardSize]} overflow-y-auto px-4 py-3 space-y-3 divide-y divide-slate-800/40 text-xs text-slate-200 transition-all duration-200`, children: [
              assistantMessages.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "py-4 text-center text-slate-400 flex flex-col items-center gap-1.5", children: [
                /* @__PURE__ */ jsx(Mic, { className: "w-4 h-4 text-emerald-400 animate-pulse" }),
                /* @__PURE__ */ jsx("span", { children: "MEETX is following the meeting in real-time..." }),
                /* @__PURE__ */ jsxs("span", { className: "text-[10px] text-slate-500", children: [
                  "Topic: ",
                  activeMeeting?.topic,
                  " \u2022 ",
                  activeMeeting?.pastedNotes ? "Knowledge-base loaded" : "Default mode"
                ] })
              ] }) : assistantMessages.map((msg) => /* @__PURE__ */ jsxs("div", { className: "pt-2.5 first:pt-0", children: [
                /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-[10px] text-slate-400 mb-1.5", children: [
                  /* @__PURE__ */ jsx("span", { className: "font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5", children: /* @__PURE__ */ jsx("span", { children: msg.sender === "user" ? "You" : `MeetX Assistant ${msg.actionType ? `\u2022 ${msg.actionType}` : ""}` }) }),
                  /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                    msg.sender === "assistant" && /* @__PURE__ */ jsx(
                      "button",
                      {
                        type: "button",
                        onClick: () => handleCopy(msg.id, msg.text),
                        className: "flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/80 transition-all cursor-pointer shadow-xs active:scale-95",
                        title: "Copy full solution to clipboard",
                        children: copiedId === msg.id ? /* @__PURE__ */ jsxs(Fragment, { children: [
                          /* @__PURE__ */ jsx(Check, { className: "w-3 h-3 text-emerald-400" }),
                          /* @__PURE__ */ jsx("span", { className: "text-emerald-400 font-semibold text-[10px]", children: "Copied!" })
                        ] }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                          /* @__PURE__ */ jsx(Copy, { className: "w-3 h-3 text-slate-400" }),
                          /* @__PURE__ */ jsx("span", { className: "text-[10px]", children: "Copy Solution" })
                        ] })
                      }
                    ),
                    /* @__PURE__ */ jsx("span", { children: msg.time })
                  ] })
                ] }),
                /* @__PURE__ */ jsx("div", { className: "text-xs text-slate-100", children: renderMessageContent(msg.text, msg.id, copiedId, handleCopy) }),
                msg.followupSuggestions && msg.followupSuggestions.length > 0 && /* @__PURE__ */ jsx("div", { className: "mt-2 flex flex-wrap gap-1.5", children: msg.followupSuggestions.map((suggestion, sIdx) => /* @__PURE__ */ jsxs(
                  "button",
                  {
                    onClick: () => askAssistant(suggestion, "query"),
                    className: "px-2 py-0.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-400/20 text-[10px] text-blue-300 transition-colors cursor-pointer flex items-center gap-1",
                    children: [
                      /* @__PURE__ */ jsx("span", { children: suggestion }),
                      /* @__PURE__ */ jsx(ArrowRight, { className: "w-2.5 h-2.5" })
                    ]
                  },
                  sIdx
                )) })
              ] }, msg.id)),
              isThinking && /* @__PURE__ */ jsxs("div", { className: "pt-2 flex items-center gap-2 text-xs text-blue-400 font-medium animate-in fade-in duration-150", children: [
                /* @__PURE__ */ jsx(Loader2, { className: "w-3.5 h-3.5 animate-spin text-blue-400" }),
                /* @__PURE__ */ jsx("span", { className: "animate-pulse text-blue-300", children: "MEETX is synthesizing your real-time response..." })
              ] }),
              liveTab === "answers" && isTranslating && /* @__PURE__ */ jsxs("div", { className: "pt-1 flex items-center gap-2 text-[11px] text-emerald-400 font-medium", children: [
                /* @__PURE__ */ jsx(Languages, { className: "w-3.5 h-3.5 animate-pulse" }),
                /* @__PURE__ */ jsxs("span", { children: [
                  "Translating live speech \u2192 ",
                  targetLanguage.name,
                  "\u2026"
                ] })
              ] }),
              /* @__PURE__ */ jsx("div", { ref: messagesEndRef })
            ] })
          ),
          /* @__PURE__ */ jsxs("div", { className: "p-3 bg-[#13151c]/90 rounded-b-2xl border-t border-slate-800/80 flex flex-col gap-2 relative", children: [
            /* @__PURE__ */ jsx(
              "textarea",
              {
                rows: 2,
                value: inputQuery,
                onChange: (e) => setInputQuery(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                },
                placeholder: "Ask a question about this meeting \u2014 press Enter to send",
                className: "w-full bg-transparent text-xs text-white placeholder:text-slate-500 resize-none outline-none leading-relaxed"
              }
            ),
            /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between pt-1", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx("span", { className: "px-2 py-0.5 rounded-full bg-slate-800 text-[11px] font-medium text-slate-300 border border-slate-700", children: "Smart" }),
                /* @__PURE__ */ jsxs("div", { className: "relative", ref: menuRef, children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      onClick: () => setIsMenuOpen(!isMenuOpen),
                      className: "w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer",
                      title: "Menu & Keybinds",
                      children: /* @__PURE__ */ jsx(MoreHorizontal, { className: "w-4 h-4" })
                    }
                  ),
                  isMenuOpen && /* @__PURE__ */ jsxs("div", { className: "absolute left-0 bottom-9 w-64 bg-[#1e222e] border border-slate-700 rounded-xl shadow-2xl p-3 z-50 text-xs text-slate-200 animate-in fade-in zoom-in-95 duration-100", children: [
                    /* @__PURE__ */ jsx("div", { className: "text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2", children: "Keybinds" }),
                    /* @__PURE__ */ jsxs("div", { className: "space-y-2 pb-2.5 border-b border-slate-700/80 text-[11px]", children: [
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
                        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-slate-300", children: [
                          /* @__PURE__ */ jsx("span", { className: "text-slate-400", children: "\u25A3" }),
                          " Show/hide MeetX"
                        ] }),
                        /* @__PURE__ */ jsx("span", { className: "text-slate-400 font-mono bg-slate-800/80 px-1 rounded", children: "Ctrl+\\" })
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
                        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-slate-300", children: [
                          /* @__PURE__ */ jsx("span", { className: "text-slate-400", children: "\u{1F4AC}" }),
                          " Ask MeetX"
                        ] }),
                        /* @__PURE__ */ jsx("span", { className: "text-slate-400 font-mono bg-slate-800/80 px-1 rounded", children: "Ctrl+\u21B5" })
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
                        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-slate-300", children: [
                          /* @__PURE__ */ jsx("span", { className: "text-slate-400", children: "\u27F2" }),
                          " Clear chat"
                        ] }),
                        /* @__PURE__ */ jsx("span", { className: "text-slate-400 font-mono bg-slate-800/80 px-1 rounded", children: "Ctrl+Shift+R" })
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
                        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-slate-300", children: [
                          /* @__PURE__ */ jsx("span", { className: "text-slate-400", children: "\u23F9" }),
                          " Stop session"
                        ] }),
                        /* @__PURE__ */ jsx("span", { className: "text-slate-400 font-mono bg-slate-800/80 px-1 rounded", children: "Ctrl+Shift+\\" })
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
                        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-slate-300", children: [
                          /* @__PURE__ */ jsx("span", { className: "text-slate-400", children: "\u2722" }),
                          " Move MeetX"
                        ] }),
                        /* @__PURE__ */ jsx("span", { className: "text-slate-400 font-mono bg-slate-800/80 px-1 rounded", children: "Ctrl+\u2198\u219B\u2190\u2192" })
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
                        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-slate-300", children: [
                          /* @__PURE__ */ jsx("span", { className: "text-slate-400", children: "\u21A1" }),
                          " Scroll Chat"
                        ] }),
                        /* @__PURE__ */ jsx("span", { className: "text-slate-400 font-mono bg-slate-800/80 px-1 rounded", children: "Ctrl+Shift+\u2198\u219B" })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsxs("div", { className: "pt-2.5 space-y-2.5 text-[11px]", children: [
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between cursor-pointer", onClick: () => setIsDetectable(!isDetectable), children: [
                        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-slate-300", children: [
                          isDetectable ? /* @__PURE__ */ jsx(Eye, { className: "w-3.5 h-3.5 text-slate-400" }) : /* @__PURE__ */ jsx(EyeOff, { className: "w-3.5 h-3.5 text-emerald-400" }),
                          /* @__PURE__ */ jsx("span", { children: "Undetectability" })
                        ] }),
                        /* @__PURE__ */ jsx("div", { className: `w-7 h-4 rounded-full relative p-0.5 transition-colors ${!isDetectable ? "bg-emerald-500" : "bg-slate-700"}`, children: /* @__PURE__ */ jsx("div", { className: `w-3 h-3 bg-white rounded-full transition-transform ${!isDetectable ? "ml-auto" : ""}` }) })
                      ] }),
                      /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between cursor-pointer", onClick: () => setHideMeetxHidesWidget(!hideMeetxHidesWidget), children: [
                        /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5 text-slate-300", children: [
                          /* @__PURE__ */ jsx(Layers, { className: "w-3.5 h-3.5 text-slate-400" }),
                          /* @__PURE__ */ jsx("span", { children: "Hide MeetX hides widget" })
                        ] }),
                        /* @__PURE__ */ jsx("div", { className: `w-7 h-4 rounded-full relative p-0.5 transition-colors ${hideMeetxHidesWidget ? "bg-blue-600" : "bg-slate-700"}`, children: /* @__PURE__ */ jsx("div", { className: `w-3 h-3 bg-white rounded-full transition-transform ${hideMeetxHidesWidget ? "ml-auto" : ""}` }) })
                      ] }),
                      /* @__PURE__ */ jsxs(
                        "div",
                        {
                          onClick: () => {
                            setIsPlanModalOpen(true);
                            setIsMenuOpen(false);
                          },
                          className: "flex items-center justify-between text-blue-400 hover:text-blue-300 cursor-pointer pt-1 border-t border-slate-700/60",
                          children: [
                            /* @__PURE__ */ jsxs("span", { className: "flex items-center gap-1.5", children: [
                              /* @__PURE__ */ jsx(CreditCard, { className: "w-3.5 h-3.5" }),
                              /* @__PURE__ */ jsxs("span", { children: [
                                "Upgrade to Pro (",
                                isProUser ? "Active" : `${freeMeetingsLeft} free left`,
                                ")"
                              ] })
                            ] }),
                            /* @__PURE__ */ jsx("span", { children: "\u203A" })
                          ]
                        }
                      ),
                      /* @__PURE__ */ jsxs(
                        "div",
                        {
                          onClick: () => {
                            setIsPlatformClosed(false);
                            setIsMenuOpen(false);
                          },
                          className: "pt-1 text-slate-300 hover:text-white cursor-pointer font-medium flex items-center justify-between",
                          children: [
                            /* @__PURE__ */ jsx("span", { children: "Reopen Main Platform" }),
                            /* @__PURE__ */ jsx(Maximize2, { className: "w-3 h-3" })
                          ]
                        }
                      )
                    ] })
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  type: "button",
                  onClick: handleSend,
                  disabled: !inputQuery.trim(),
                  className: "w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-600/30 transition-all cursor-pointer",
                  children: /* @__PURE__ */ jsx(Send, { className: "w-3.5 h-3.5 ml-0.5" })
                }
              )
            ] })
          ] })
        ] })
      ]
    }
  );
  if (desktopContainer) return createPortal(widgetNode, desktopContainer);
  return widgetNode;
};

// tools/desktop-assistant-window.test.mjs
var passed = 0;
var failed = 0;
var report = [];
var check = (label, condition, detail = "") => {
  if (condition) {
    passed += 1;
    report.push(`PASS  ${label}`);
  } else {
    failed += 1;
    report.push(`FAIL  ${label}${detail ? `  [${detail}]` : ""}`);
  }
};
var UID = "user-pip-lifecycle";
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var tick = () => sleep(0);
var store = /* @__PURE__ */ new Map();
globalThis.localStorage = {
  getItem: (k) => store.has(k) ? store.get(k) : null,
  setItem: (k, v) => {
    store.set(k, String(v));
  },
  removeItem: (k) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  }
};
localStorage.setItem("meetx_is_pro", "true");
globalThis.__meetxTestAuth = { currentUser: { uid: UID } };
var windowEvents = /* @__PURE__ */ new Map();
globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  addEventListener: (type, fn) => {
    if (!windowEvents.has(type)) windowEvents.set(type, []);
    windowEvents.get(type).push(fn);
    const pip = {
      requests: [],
      // every requestWindow() option object
      windows: [],
      // every window ever opened
      closes: 0
      // Window.close() calls (programmatic, e.g. on meeting stop)
    };
    const makePipWindow = () => {
      const listeners = /* @__PURE__ */ new Map();
      const makeNode = (tag) => ({
        tagName: tag,
        id: "",
        textContent: "",
        rel: "",
        href: "",
        style: {},
        children: [],
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        removeChild(child) {
          const at = this.children.indexOf(child);
          if (at !== -1) this.children.splice(at, 1);
          return child;
        }
      });
      const win = {
        document: { head: makeNode("head"), body: makeNode("body"), createElement: makeNode },
        innerWidth: 520,
        innerHeight: 700,
        closed: false,
        addEventListener(type2, fn2) {
          if (!listeners.has(type2)) listeners.set(type2, []);
          listeners.get(type2).push(fn2);
        },
        removeEventListener(type2, fn2) {
          const list = listeners.get(type2) || [];
          const at = list.indexOf(fn2);
          if (at !== -1) list.splice(at, 1);
        },
        close() {
          if (this.closed) return;
          this.closed = true;
          pip.closes += 1;
          this.__fire("pagehide");
        },
        resizeTo() {
        },
        __fire(type2, event = { type: type2 }) {
          for (const fn2 of [...listeners.get(type2) || []]) fn2(event);
        },
        __listeners: listeners
      };
      pip.windows.push(win);
      return win;
    };
    const pipController = {
      window: null,
      async requestWindow(options) {
        pip.requests.push({ ...options || {} });
        if (this.window) return this.window;
        const win = makePipWindow();
        this.window = win;
        win.addEventListener("pagehide", () => {
          if (this.window === win) this.window = null;
        });
        return win;
      }
    };
    globalThis.window.documentPictureInPicture = pipController;
    globalThis.document = {
      addEventListener: () => {
      },
      removeEventListener: () => {
      },
      createElement: () => ({ value: "", select: () => {
      }, setSelectionRange: () => {
      } }),
      body: { appendChild: () => {
      }, removeChild: () => {
      } },
      execCommand: () => true,
      // The stylesheet copy into the PiP window iterates these (empty is fine).
      styleSheets: []
    };
    let widgetTree = null;
    let meetingValue = null;
    const renderAll = () => {
      __hookTest.useInstance("provider");
      const providerElement = __hookTest.render(() => MeetingProvider({ children: null }));
      meetingValue = providerElement.props.value;
      __hookTest.provideContext(MeetingContext, meetingValue);
      __hookTest.useInstance("widget");
      widgetTree = __hookTest.render(() => FloatingAssistantWidget());
      return widgetTree;
    };
    const collectText = (node, out = [], depth = 0) => {
      if (depth > 60 || node === null || node === void 0 || typeof node === "boolean") return out;
      if (typeof node === "string" || typeof node === "number") {
        out.push(String(node));
        return out;
      }
      if (Array.isArray(node)) {
        for (const c of node) collectText(c, out, depth + 1);
        return out;
      }
      if (typeof node !== "object") return out;
      if (typeof node.type === "function") {
        try {
          return collectText(node.type(node.props || {}), out, depth + 1);
        } catch {
          return out;
        }
      }
      if (node.type === Symbol.for("react.fragment")) {
        return collectText(node.props?.children, out, depth + 1);
      }
      if (node.props && node.props.children !== void 0) {
        collectText(node.props.children, out, depth + 1);
      }
      return out;
    };
    const findNode = (node, predicate, depth = 0) => {
      if (depth > 60 || node === null || node === void 0 || typeof node !== "object") return null;
      if (Array.isArray(node)) {
        for (const c of node) {
          const hit = findNode(c, predicate, depth + 1);
          if (hit) return hit;
        }
        return null;
      }
      if (predicate(node)) return node;
      if (typeof node.type === "function") {
        try {
          const hit = findNode(node.type(node.props || {}), predicate, depth + 1);
          if (hit) return hit;
        } catch {
        }
      }
      if (node.props && node.props.children !== void 0) {
        return findNode(node.props.children, predicate, depth + 1);
      }
      return null;
    };
    const text = () => collectText(widgetTree).join(" ");
    const desktopToggle = () => findNode(widgetTree, (n) => typeof n.props?.title === "string" && n.props.title.includes("desktop floating window"));
    const portalContainer = () => globalThis.__meetxPortalContainer ?? null;
    const resetPortalCapture = () => {
      globalThis.__meetxPortalContainer = null;
    };
    const entry = (id, body, seconds = 0) => ({
      id,
      speakerId: "speaker-remote",
      speakerName: "Dana",
      text: body,
      timestamp: `00:${String(seconds).padStart(2, "0")}`,
      language: "en-US"
    });
    const main = async () => {
      console.log("=== MEETX desktop floating-window lifecycle verification ===\n");
      renderAll();
      check("precondition: no desktop window before a meeting", pip.requests.length === 0 && portalContainer() === null);
      const started = meetingValue.startMeetingSession({
        meetingId: "meet-pip-lifecycle",
        userId: UID,
        topic: "Desktop floating window lifecycle"
      });
      check("TEST 1: the session started", started === true, `started=${started}`);
      renderAll();
      await tick();
      renderAll();
      check("TEST 1: the desktop window was requested", pip.requests.length === 1, `requests=${pip.requests.length}`);
      check("TEST 1: requested at 520\xD7700", pip.requests[0]?.width === 520 && pip.requests[0]?.height === 700, JSON.stringify(pip.requests[0]));
      const firstWindow = pip.windows[0];
      check("TEST 1: the controller holds the open window", pipController.window === firstWindow);
      check("TEST 1: the widget rendered INTO the desktop window", portalContainer() === firstWindow.document.body.children[0], "portal target mismatch");
      check("TEST 1: the window body is styled dark", firstWindow.document.body.style.background === "#151822", firstWindow.document.body.style.background);
      check("TEST 1: the active session is shown", text().includes("MEETX is now active"), text().slice(0, 120));
      check("TEST 1: a desktop-window close toggle exists in the window", desktopToggle()?.props?.title?.includes("Close desktop floating window") === true);
      resetPortalCapture();
      firstWindow.__fire("pagehide");
      await tick();
      renderAll();
      check("TEST 6: the meeting is still active after the window closed", meetingValue.isFloatingActive === true && meetingValue.activeMeeting?.id === "meet-pip-lifecycle");
      check("TEST 6: the controller released the window", pipController.window === null);
      check("TEST 6: no programmatic close was counted (the user closed it)", pip.closes === 0, `closes=${pip.closes}`);
      check("TEST 6: the widget fell back to the in-page render", portalContainer() === null);
      check("TEST 6: no automatic reopen happened", pip.requests.length === 1, `requests=${pip.requests.length}`);
      check("TEST 6: a restore toggle is available in-page", desktopToggle()?.props?.title?.includes("Open desktop floating window") === true);
      meetingValue.addTranscriptEntry(entry("pip-r1", "The assistant keeps listening while hidden."));
      await tick();
      renderAll();
      for (let i = 0; i < 5; i += 1) await tick();
      renderAll();
      check("TEST 7: the transcript continued while the window was hidden", meetingValue.currentMeetingTranscript.length === 1 && text().includes("keeps listening while hidden"), `len=${meetingValue.currentMeetingTranscript.length}`);
      check("TEST 7: AI processing continued (an auto answer was produced)", meetingValue.assistantMessages.length >= 2, `messages=${meetingValue.assistantMessages.length}`);
      check("TEST 7: the meeting was never stopped", meetingValue.isFloatingActive === true);
      check("TEST 7: still no desktop window while hidden", portalContainer() === null && pip.requests.length === 1);
      const restoreButton = desktopToggle();
      check("TEST 8: the restore button was found in-page", Boolean(restoreButton));
      restoreButton?.props?.onClick();
      await tick();
      await tick();
      renderAll();
      const secondWindow = pip.windows[1];
      check("TEST 8: a (new) desktop window was opened", pip.requests.length === 2, `requests=${pip.requests.length}`);
      check("TEST 8: the restore targeted a fresh window", secondWindow !== firstWindow && pipController.window === secondWindow);
      check("TEST 8: the SAME session is rendered into it", portalContainer() === secondWindow.document.body.children[0] && meetingValue.activeMeeting?.id === "meet-pip-lifecycle");
      check("TEST 8: the transcript captured while hidden is displayed", text().includes("keeps listening while hidden"));
      meetingValue.stopMeetingSession();
      await tick();
      renderAll();
      await tick();
      renderAll();
      check("TEST 9: stopping the meeting closed the desktop window", pip.closes >= 1, `closes=${pip.closes}`);
      check("TEST 9: the controller released the window", pipController.window === null);
      check("TEST 9: the meeting session ended", meetingValue.isFloatingActive === false && meetingValue.activeMeeting === null);
      check("TEST 9: no portal target remains", portalContainer() === null);
      const restarted = meetingValue.startMeetingSession({
        meetingId: "meet-pip-lifecycle-2",
        userId: UID,
        topic: "Second desktop session"
      });
      check("TEST 10: a second session started", restarted === true);
      renderAll();
      await tick();
      renderAll();
      const thirdWindow = pip.windows[2];
      check("TEST 10: a fresh desktop window was opened for it", pip.requests.length === 3 && thirdWindow && thirdWindow !== secondWindow, `requests=${pip.requests.length}`);
      check("TEST 10: the new session renders into the new window", portalContainer() === thirdWindow.document.body.children[0]);
      check("TEST 10: the second meeting owns the window content", text().includes("Second desktop session") || text().includes("MEETX is now active"));
      console.log(report.join("\n"));
      console.log(`
${passed} passed, ${failed} failed`);
      console.log(`RESULT: desktop floating-window lifecycle ${failed === 0 ? "verified" : "FAILED"}`);
      console.log(`windows opened: ${pip.requests.length}, programmatic closes: ${pip.closes}`);
      process.exit(failed === 0 ? 0 : 1);
    };
    main().catch((err) => {
      console.error("FATAL:", err);
      process.exit(1);
    });
  },
  removeEventListener: (type, fn) => {
    const list = windowEvents.get(type) || [];
    const at = list.indexOf(fn);
    if (at !== -1) list.splice(at, 1);
  },
  scrollTo: () => {
  },
  innerWidth: 1920,
  innerHeight: 1080
};
