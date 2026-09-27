import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(resolve(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["'](.*)["']$/, '$1');
}

console.log('process.env.VITE_GEMINI_API_KEY present:', !!process.env.VITE_GEMINI_API_KEY);
console.log('process.env.VITE_GROQ_API_KEY present:', !!process.env.VITE_GROQ_API_KEY);
console.log('from-file GEMINI_API_KEY:', !!env.GEMINI_API_KEY, '| VITE_GEMINI_API_KEY:', !!env.VITE_GEMINI_API_KEY);
console.log('from-file GROQ_API_KEY:', !!env.GROQ_API_KEY, '| VITE_GROQ_API_KEY:', !!env.VITE_GROQ_API_KEY);
console.log('from-file GEMINI_MODELS:', JSON.stringify(env.GEMINI_MODELS));
console.log('from-file GROQ_MODELS:', JSON.stringify(env.GROQ_MODELS));
console.log('from-file VITE_GEMINI_MODELS:', JSON.stringify(env.VITE_GEMINI_MODELS));
console.log('from-file VITE_GROQ_MODELS:', JSON.stringify(env.VITE_GROQ_MODELS));
console.log('from-file GEMINI_KEY prefix:', env.GEMINI_API_KEY ? env.GEMINI_API_KEY.slice(0, 14) + '…' : '(missing)');
console.log('from-file GROQ_KEY prefix:', env.GROQ_API_KEY ? env.GROQ_API_KEY.slice(0, 14) + '…' : '(missing)');
