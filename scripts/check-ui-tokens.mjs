#!/usr/bin/env node
/**
 * UI quality gate — enforces the CLAUDE.md design-system rules:
 *
 *   1. HARDCODED-COLOR GATE
 *      "All component CSS uses semantic --mj-* design tokens — no hardcoded
 *       colors (breaks dark mode)."
 *      Flags hex / rgb() / rgba() / hsl() / hsla() / named CSS colors used as a
 *      *property value*. The only sanctioned place a literal color may appear is
 *      the *definition* of a --mj-* / --mjf-* token (the widget custom element
 *      supplies its own token values because it renders outside the Explorer
 *      shell) or as the fallback in `var(--token, <fallback>)`.
 *
 *   2. RAW-BUTTON GATE (informational / disabled by default — see BUTTON_GATE)
 *      CLAUDE.md prefers mj-btn for dialog/action buttons. The current tree uses
 *      raw `<button class="btn|mjf-btn">` by deliberate convention (the widget is
 *      a framework-free custom element; the builder/dashboard haven't adopted
 *      ng-ui-components buttons yet). Enabling this gate today would flag every
 *      button with no real signal, so it ships OFF and is flipped on once mj-btn
 *      becomes the established convention.
 *
 * Read-only. No --fix. Reports file:line for each violation, prints a summary,
 * and exits non-zero if any ENABLED gate finds a violation.
 *
 * Zero dependencies beyond Node's stdlib so it runs fast in CI.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// CONFIG — tunable rule arrays
// ---------------------------------------------------------------------------

/** Directories scanned for component styles/templates. */
const SCAN_ROOTS = ['packages/Angular/src'];

/** Path fragments that exclude a file from ALL gates. */
const EXCLUDE_PATH_FRAGMENTS = [
  '/generated/', // never touch CodeGen output
  '/node_modules/',
  '/dist/',
  '.spec.ts', // test fixtures legitimately embed literal colors
  '.test.ts',
];

/** Extensions the color gate inspects. */
const COLOR_GATE_EXTS = new Set(['.css', '.scss', '.ts', '.html']);

/**
 * Color literals. Each pattern is matched per-line; a match is only a violation
 * if the line is NOT an allowed context (see isAllowedColorLine).
 */
const COLOR_PATTERNS = [
  { name: 'hex', re: /#[0-9a-fA-F]{3,8}\b/ },
  { name: 'rgb', re: /\brgba?\(\s*\d/ }, // rgb(/rgba( with a literal numeric arg
  { name: 'hsl', re: /\bhsla?\(\s*\d/ },
];

/**
 * Named CSS colors that are violations when used as a value (e.g. `color: red`).
 * Kept deliberately small/high-signal — the common ones devs reach for. Keywords
 * that are NOT colors (transparent/currentColor/inherit/none) are in ALLOW below.
 */
const NAMED_COLORS = [
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black',
  'white', 'gray', 'grey', 'cyan', 'magenta', 'lime', 'navy', 'teal',
  'silver', 'maroon', 'olive', 'aqua', 'fuchsia',
];
// Match a named color used as a CSS value: after `:` (a property assignment),
// optionally preceded by other value words, bounded by word boundaries.
const NAMED_COLOR_RE = new RegExp(
  `:\\s*(?:[a-z-]+\\s+)*\\b(${NAMED_COLORS.join('|')})\\b`,
  'i',
);

/**
 * Opt-out marker, on the line immediately before the literal.
 *
 * Narrow on purpose, and it must carry a reason after the em dash. There IS a case where a
 * literal is the only correct value — a colour picker's saturation/value plane is built from
 * literal white and black because they are the AXES of the colour space, not theme decisions,
 * and its cursor ring must stay visible over whatever colour sits under it. A gate with no
 * escape hatch gets disabled wholesale the first time it is wrong; one that demands a written
 * reason stays on.
 */
const ALLOW_MARKER = /ui-gate:\s*allow-literal-color(?:\((\d+)\))?\s*—\s*\S/;

/** How many following lines a marker covers (default 1), or 0 when the line is not a marker. */
function allowanceOn(line) {
  const m = ALLOW_MARKER.exec(line);
  if (!m) return 0;
  return m[1] ? Math.min(Number(m[1]), MAX_ALLOWANCE_LINES) : 1;
}

/** A marker covers a handful of lines, never a file. Anything longer wants a different fix. */
const MAX_ALLOWANCE_LINES = 12;

/** Color keywords that are always allowed as values. */
const ALLOWED_COLOR_KEYWORDS = ['transparent', 'currentcolor', 'inherit', 'none', 'initial', 'unset'];

/**
 * Toggle for the raw-button gate. OFF: the repo uses raw <button> by convention
 * and has zero mj-btn usages, so enabling it produces only false positives.
 * Flip to true (and tune BUTTON_ALLOW_PATH_FRAGMENTS) once mj-btn is adopted.
 */
const BUTTON_GATE = { enabled: false };

/** Paths where raw <button> is always acceptable (framework-free custom element). */
const BUTTON_ALLOW_PATH_FRAGMENTS = [
  '/widget/', // the respondent widget is a standalone custom element, no MJ comps
];

const BUTTON_GATE_EXTS = new Set(['.html', '.ts']);

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function isExcluded(absPath) {
  const p = absPath.split('\\').join('/');
  return EXCLUDE_PATH_FRAGMENTS.some((frag) => p.includes(frag));
}

function walk(dirAbs, acc) {
  let entries;
  try {
    entries = readdirSync(dirAbs);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const abs = join(dirAbs, entry);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'generated') continue;
      walk(abs, acc);
    } else if (st.isFile()) {
      acc.push(abs);
    }
  }
  return acc;
}

/**
 * True if a line containing a color literal is in an ALLOWED context:
 *  - the literal is the value of a --mj-* / --mjf-* custom-property definition
 *  - the literal appears only as a var() fallback: var(--token, <fallback>)
 */
function isAllowedColorLine(line) {
  const trimmed = line.trim();

  // 1. Custom-property *definition*: `--mj-foo: #fff;` / `--mjf-bar: rgba(...)`.
  //    This is the sanctioned source of token values.
  if (/^--mjf?-[\w-]+\s*:/.test(trimmed)) return true;

  // 2. The only literals on the line are inside var() fallbacks.
  //    Strip every `var(--x, <fallback>)` occurrence; if no literal remains,
  //    the line is clean.
  const stripped = line.replace(/var\(\s*--[\w-]+\s*,[^)]*\)/g, 'var()');
  if (!hasRawColorLiteral(stripped)) return true;

  return false;
}

/**
 * Blank out comments so PROSE about colour is not read as colour.
 *
 * The gate used to flag its own documentation — a sentence explaining which colours failed a
 * contrast check tripped the hex pattern, and a comment naming `#fff` as the thing NOT to write
 * was reported as writing it. A gate that fires on the explanation of why it exists teaches
 * people to stop reading it.
 */
function stripComments(lines) {
  let inBlock = false;
  return lines.map((line) => {
    let out = '';
    let i = 0;
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i);
        if (end === -1) return out;
        inBlock = false;
        i = end + 2;
        continue;
      }
      const start = line.indexOf('/*', i);
      // `//` only when it opens the line's remaining content — never inside a URL.
      const slash = /^\s*\/\//.test(line.slice(i)) ? line.indexOf('//', i) : -1;
      if (slash !== -1 && (start === -1 || slash < start)) {
        return out + line.slice(i, slash);
      }
      if (start === -1) return out + line.slice(i);
      out += line.slice(i, start);
      inBlock = true;
      i = start + 2;
    }
    return out;
  });
}

/** Does the (possibly var()-stripped) text contain a raw color literal value? */
function hasRawColorLiteral(text) {
  for (const { re } of COLOR_PATTERNS) {
    if (re.test(text)) return true;
  }
  // Named color used as a value, but not an allowed keyword.
  const m = text.match(NAMED_COLOR_RE);
  if (m) {
    const word = m[1].toLowerCase();
    if (!ALLOWED_COLOR_KEYWORDS.includes(word)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// GATES
// ---------------------------------------------------------------------------

function runColorGate(files) {
  const violations = [];
  for (const abs of files) {
    if (!COLOR_GATE_EXTS.has(extname(abs))) continue;
    const text = readFileSync(abs, 'utf8');
    const raw = text.split(/\r?\n/);
    const lines = stripComments(raw);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!hasRawColorLiteral(line)) continue; // fast reject
      if (isAllowedColorLine(line)) continue;
      // The marker is read from the RAW lines above — it lives in a comment.
      if (isAllowed(raw, lines, i)) continue;
      violations.push({
        file: relative(REPO_ROOT, abs),
        line: i + 1,
        text: raw[i].trim().slice(0, 120),
      });
    }
  }
  return violations;
}

/** Whether a marker above line `i` still covers it. */
function isAllowed(raw, lines, i) {
  // The span counts CODE lines, skipping the comment the marker itself sits in. Counting raw
  // lines made the number depend on how long the justification was — write a fuller reason and
  // your own marker stops reaching the thing it excuses, which is precisely backwards.
  let code = 0;
  for (let j = i - 1; j >= 0; j--) {
    const span = allowanceOn(raw[j]);
    if (span > 0) return span > code;
    if (lines[j].trim() !== '') code++;
    if (code > MAX_ALLOWANCE_LINES) return false;
  }
  return false;
}

function runButtonGate(files) {
  if (!BUTTON_GATE.enabled) return [];
  const violations = [];
  for (const abs of files) {
    if (!BUTTON_GATE_EXTS.has(extname(abs))) continue;
    const p = abs.split('\\').join('/');
    if (BUTTON_ALLOW_PATH_FRAGMENTS.some((frag) => p.includes(frag))) continue;
    const text = readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (/<button\b/.test(lines[i])) {
        violations.push({
          file: relative(REPO_ROOT, abs),
          line: i + 1,
          text: lines[i].trim().slice(0, 120),
        });
      }
    }
  }
  return violations;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function annotate(v, message) {
  // GitHub Actions annotation (matches existing .github/scripts style).
  console.log(`::error file=${v.file},line=${v.line}::${message}: ${v.text}`);
}

function main() {
  // Optional self-test: `--self-test` injects a synthetic violation line to
  // prove the matcher fires (used by CI / local sanity checks). It does not
  // touch the tree.
  if (process.argv.includes('--self-test')) {
    const bad = '  color: #ff0000;';
    const good = '  --mj-text-primary: #1a1d21;';
    const fallback = '  color: var(--mj-text-primary, #000);';
    const ok =
      hasRawColorLiteral(bad) &&
      !isAllowedColorLine(bad) === true &&
      isAllowedColorLine(good) &&
      isAllowedColorLine(fallback);
    if (!ok) {
      console.error('SELF-TEST FAILED');
      process.exit(2);
    }
    console.log('SELF-TEST PASS: literal flagged, token-def + var() fallback allowed.');
    process.exit(0);
  }

  const files = [];
  for (const root of SCAN_ROOTS) {
    walk(join(REPO_ROOT, root), files);
  }
  const scanned = files.filter((f) => !isExcluded(f));

  const colorViolations = runColorGate(scanned);
  const buttonViolations = runButtonGate(scanned);

  console.log('UI token gate');
  console.log('-------------');
  console.log(`Scanned ${scanned.length} file(s) under: ${SCAN_ROOTS.join(', ')}`);
  console.log(`Excluded: ${EXCLUDE_PATH_FRAGMENTS.join(', ')}`);
  console.log('');

  console.log(`[color] hardcoded-color gate: ${colorViolations.length} violation(s)`);
  for (const v of colorViolations) {
    annotate(v, 'hardcoded color (use a --mj-* token or var() fallback)');
    console.log(`  ${v.file}:${v.line}  ${v.text}`);
  }

  console.log('');
  if (BUTTON_GATE.enabled) {
    console.log(`[button] raw-button gate: ${buttonViolations.length} violation(s)`);
    for (const v of buttonViolations) {
      annotate(v, 'raw <button> (use mj-btn)');
      console.log(`  ${v.file}:${v.line}  ${v.text}`);
    }
  } else {
    console.log('[button] raw-button gate: DISABLED (repo uses raw <button> by convention; no mj-btn adopted yet)');
  }

  const total = colorViolations.length + (BUTTON_GATE.enabled ? buttonViolations.length : 0);
  console.log('');
  if (total > 0) {
    console.log(`FAIL — ${total} UI gate violation(s).`);
    process.exit(1);
  }
  console.log('PASS — no UI gate violations.');
}

main();
