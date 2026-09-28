/**
 * The pure decisions behind a text-style control's answer: what raw DOM text becomes, and whether
 * two answers are the same one.
 *
 * Split out of `FormQuestionComponent` (#268) because these decisions, not the DOM plumbing
 * around them, are where the dedupe/merge bugs actually live — a stale-snapshot merge or a
 * key-order-sensitive equality check is invisible in a component that cannot be instantiated in
 * this suite (zoneless, `inject()`-based, needs a real DOM). Pure functions have neither problem.
 */

/** What `emitIfChanged` / `emitComposite` compare and eventually emit as `AnswerValue`. */
export type ControlAnswer = string | number | null | Readonly<Record<string, string>>;

/**
 * A scalar (ShortText/Number/etc.) DOM value, parsed the way that control's type requires.
 *
 * `'number'`: blank AFTER TRIMMING is unanswered; a value that parses becomes a `number`; one
 * that doesn't (a partially-typed "12-", or whatever AutoFill happened to put there) is kept as
 * the raw string rather than discarded, matching what typing it in by hand already produces.
 * `'text'`: only the EXACT empty string is unanswered — "   " is a strange but real answer for a
 * free-text field, unlike a Number control where it can never be a valid number.
 */
export function scalarAnswer(raw: string, kind: 'text' | 'number'): string | number | null {
  if (kind === 'text') {
    return raw === '' ? null : raw;
  }
  if (raw.trim() === '') {
    return null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

/**
 * A composite (Address/ContactInfo) answer from its parts, or `null` when nothing was filled in.
 *
 * Blank parts are DROPPED rather than kept as empty strings, so a respondent who tabs through an
 * optional address without typing leaves no answer at all. Keeping them would emit
 * `{line1:'', city:''}` — an object `isAnswerSupplied` correctly calls unanswered, but which every
 * reader downstream still has to receive, store and skip.
 */
export function compositeAnswer(parts: Readonly<Record<string, string>>): Record<string, string> | null {
  const next: Record<string, string> = {};
  for (const [key, part] of Object.entries(parts)) {
    if (part.trim() !== '') {
      next[key] = part;
    }
  }
  return Object.keys(next).length > 0 ? next : null;
}

/**
 * Whether two answers are the one already held — key order never matters for a composite.
 *
 * Both `(input)` and `(change)` reach the same handler for every text-style control (#268), so a
 * typed value arrives twice — once per keystroke and again on blur — and re-emitting the value
 * that is already held must not look like an edit.
 */
export function sameAnswer(a: ControlAnswer, b: ControlAnswer): boolean {
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every((key) => a[key] === b[key]);
  }
  return a === b;
}
