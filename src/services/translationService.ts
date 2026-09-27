// Real-time translation service — 100% free, no API key required.
// Strategy (tried in order, first success wins):
//  1. MyMemory (api.mymemory.translated.net) — free ~5000 chars/day anonymous,
//     no key needed. Reliable for short meeting utterances.
//  2. LibreTranslate public instance (libretranslate.com) — free, no key.
//  3. Google Translate public web endpoint (translate.googleapis.com) —
//     unofficial but free and keyless; works from browsers via GET.
// Results are cached per (text|from|to) so repeated subtitles don't re-hit
// the network, and every failure falls back to the original text — the app
// never blanks the transcript because translation failed.

export interface TranslateOptions {
  from?: string; // BCP-47 e.g. 'en-US' — only the base ('en') is sent
  to: string; // BCP-47 e.g. 'hi-IN'
  signal?: AbortSignal;
}

const cache = new Map<string, string>();
const MAX_CACHE = 500;

const base = (code?: string): string => (code || 'en').split('-')[0].toLowerCase();

const remember = (key: string, value: string): string => {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(key, value);
  return value;
};

async function viaMyMemory(text: string, from: string, to: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const url =
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
      `&langpair=${encodeURIComponent(from + '|' + to)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const out = (data?.responseData?.translatedText || '').trim();
    if (!out || data?.responseStatus === 429) return null;
    return out;
  } catch {
    return null;
  }
}

async function viaLibre(text: string, from: string, to: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch('https://libretranslate.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ q: text, source: from, target: to, format: 'text' }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out = (data?.translatedText || '').trim();
    return out || null;
  } catch {
    return null;
  }
}

async function viaGoogleWeb(text: string, from: string, to: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(from)}` +
      `&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const out = Array.isArray(data) && Array.isArray(data[0])
      ? data[0].map((seg: unknown[]) => (Array.isArray(seg) ? String(seg[0] || '') : '')).join('')
      : '';
    return out.trim() || null;
  } catch {
    return null;
  }
}

export async function translateText(text: string, opts: TranslateOptions): Promise<string> {
  const src = base(opts.from);
  const dst = base(opts.to);
  const clean = (text || '').trim();
  if (!clean) return '';
  if (src === dst) return clean;

  const key = `${src}|${dst}|${clean}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const translators = [viaMyMemory, viaLibre, viaGoogleWeb];
  for (const fn of translators) {
    const out = await fn(clean, src, dst, opts.signal);
    if (out) return remember(key, out);
  }
  // All providers failed — return the original so the UI never goes blank.
  return clean;
}

export const clearTranslationCache = (): void => {
  cache.clear();
};
