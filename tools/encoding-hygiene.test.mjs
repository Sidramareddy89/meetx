/**
 * MEETX - encoding hygiene guard.
 *
 * Text corruption is invisible until a user reads a broken label, so this guard
 * fails the build when any own-source file contains one of the three signatures
 * of a bad encoding round trip:
 *
 *   1. a mojibake run - a cp1252 lead glyph (U+00C2 / U+00C3 / U+00E2 / U+00F0)
 *      immediately followed by a continuation glyph, e.g. an em dash stored as
 *      U+00E2 U+20AC U+201D, or U+00C3 U+00A9 instead of U+00E9;
 *   2. a raw C0 control character other than tab, newline or carriage return
 *      (a lost character that became U+0007/U+000B, for example);
 *   3. U+FFFD, the replacement character - data already lost, never recoverable.
 *
 * Run: node tools/encoding-hygiene.test.mjs
 * Exit code 0 = every scanned file is clean.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = (abs) => abs.slice(root.length + 1).split('\\').join('/');

// Lead glyphs of a mis-decoded UTF-8 sequence, and the characters that can
// follow them in cp1252 / latin1. Written as escapes on purpose: this file has
// to stay clean by its own rules.
const LEAD = '\u00c2\u00c3\u00e2\u00f0\u00fd\u00fe\u00ff';
const CONT =
  '\u0080-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192' +
  '\u2013\u2014\u2018\u2019\u201a\u201c\u201d\u201e\u2020\u2021\u2022\u2026' +
  '\u2030\u2039\u203a\u20ac\u2122\u02c6\u02dc';
const MOJIBAKE = new RegExp(`[${LEAD}][${CONT}]`, 'g');
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const LOST = /\ufffd/g;

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.vite']);
const SCAN_EXTS = new Set(['.ts', '.tsx', '.mjs', '.js', '.css', '.html', '.json', '.md', '.ps1']);
// Root-level files without a conventional extension that still ship text.
const SCAN_FILES = ['.gitignore', '.env.example'];

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs);
    else if (SCAN_EXTS.has(extname(entry))) files.push(abs);
  }
};
walk(join(root, 'src'));
walk(join(root, 'tools'));
if (existsSync(join(root, '.agents'))) walk(join(root, '.agents'));
for (const entry of readdirSync(root)) {
  const abs = join(root, entry);
  if (statSync(abs).isFile() && (SCAN_EXTS.has(extname(entry)) || SCAN_FILES.includes(entry))) files.push(abs);
}

const escape = (text) =>
  text.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.codePointAt(0).toString(16).padStart(4, '0')}`);

const checks = [];

// Self-check first: a guard that cannot detect anything would pass silently.
checks.push([
  'the scanner detects a mojibake run',
  '\u00e2\u20ac\u201d'.match(MOJIBAKE) !== null,
  'synthetic em dash not detected',
]);
checks.push([
  'the scanner detects a lost character',
  'A\u0007ll'.match(CONTROL) !== null,
  'synthetic U+0007 not detected',
]);
checks.push([
  'the scanner ignores legitimate punctuation',
  '\u2014 \u2192 \u00b7 \u2705'.match(MOJIBAKE) === null && '\u2014 \u2192 \u00b7 \u2705'.match(CONTROL) === null,
  'real Unicode punctuation flagged as corruption',
]);

const findings = [];
for (const abs of files) {
  const text = readFileSync(abs, 'utf8');
  text.split('\n').forEach((line, index) => {
    const moji = line.match(MOJIBAKE);
    const ctrl = line.match(CONTROL);
    const lost = line.match(LOST);
    if (!moji && !ctrl && !lost) return;
    findings.push(
      `${rel(abs)}:${index + 1} [mojibake=${moji ? moji.length : 0} control=${ctrl ? ctrl.length : 0} lost=${lost ? lost.length : 0}] ` +
        escape(line.trim().slice(0, 140))
    );
  });
}

checks.push(['no corrupted characters in any scanned file', findings.length === 0, findings.slice(0, 10).join('\n      ')]);
checks.push(['the scan actually read the project', files.length > 50, `only ${files.length} files scanned`]);

for (const [label, passed, detail] of checks) {
  if (passed) console.log(`PASS  ${label}`);
  else console.error(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`);
}
if (findings.length) console.error(`\n${findings.join('\n')}`);

const failed = checks.filter(([, ok]) => !ok).length;
console.log(`\nchecked ${files.length} files`);
console.log(`${checks.length - failed} passed, ${failed} failed`);
console.log(failed === 0 ? 'RESULT: encoding hygiene verified' : 'RESULT: corrupted text present');
process.exitCode = failed === 0 ? 0 : 1;
