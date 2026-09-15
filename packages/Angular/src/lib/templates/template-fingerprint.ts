/**
 * "Is this form still the same as the template I saved from it?", answered by comparison.
 *
 * WHY NOT A FLAG. The builder briefly tracked "already saved as a template" as a boolean read
 * once at load. That is the same latch mistake `publish-fingerprint.ts` was written to undo, and
 * it produced the same class of lie in a new place: delete the template from the gallery and the
 * form still announced "Saved as template", because nothing had told the latch otherwise. Worse
 * in the other direction — add five questions after saving, and the form claimed to be safely
 * templated while the template in the gallery knew nothing about them.
 *
 * So the state is derived, every time, from the content on both sides. Same method as Publish,
 * and deliberately the same vocabulary: nothing to compare against means offer the action;
 * identical means say so; different means offer it again.
 *
 * WHAT IS IGNORED, AND WHY EACH ONE.
 *   - `formId` / `formVersionId` — identity, not content. They differ by construction: a template
 *     IS a different row.
 *   - `name` / `description` — the author names a template independently of the form ("Client
 *     intake" saved as "Standard intake template"). Comparing them would report drift on every
 *     template that was sensibly named, which is all of them.
 *   - `automations` — excluded for the same unsatisfying reason `publish-fingerprint.ts` excludes
 *     it: the Automate tab does not report its changes up to the builder shell, so including it
 *     here would compare a value that never refreshes. It IS a gap, and the fix is the same one —
 *     have that tab feed its state up — not a special case here.
 *
 * `styleTokens` is deliberately NOT ignored: a template carries the form's theme, so restyling
 * the form genuinely does move it away from what was saved.
 *
 * AND THE IDS, WHICH IS THE WHOLE DIFFICULTY. A template is a deep COPY, so every page, question
 * and option in it has a different primary key from the form it came from — the ids are not just
 * allowed to differ, they are guaranteed to. Comparing raw definitions therefore reports drift on
 * a template saved one second ago, which is exactly what the first version of this did. So record
 * ids are stripped at every depth, and the question references inside conditional rules are
 * rewritten to the question's POSITION rather than its key: two forms branch the same way when
 * each rule points at the same question in reading order, whatever that question happens to be
 * called in the database. Repointing a rule at a different question moves the position and shows
 * up as the real change it is.
 */
import { canonicalJson } from '../builder/publish-fingerprint';

const TEMPLATE_IGNORED_KEYS: ReadonlySet<string> = new Set([
  'formId',
  'formVersionId',
  'name',
  'description',
  'automations',
]);

/**
 * The comparable content of a form, for template purposes.
 *
 * Takes `unknown` for the same reason `definitionFingerprint` does: one side is a freshly built
 * definition, the other is built from rows loaded out of the database. Both are treated as data.
 */
export function templateFingerprint(definition: unknown): string {
  if (definition === null || typeof definition !== 'object') {
    return '';
  }
  const source = definition as Record<string, unknown>;
  const comparable: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (!TEMPLATE_IGNORED_KEYS.has(key)) {
      comparable[key] = source[key];
    }
  }
  return canonicalJson(withoutRecordIdentity(comparable, questionPositions(source)));
}

/**
 * Question id -> its position in reading order, across every page.
 *
 * Position is the stable identity a copy preserves and a key does not. `flattenQuestions` is not
 * used here because this walks a plain parsed object, not a typed definition.
 */
function questionPositions(definition: Record<string, unknown>): ReadonlyMap<string, number> {
  const positions = new Map<string, number>();
  const pages = definition.pages;
  if (!Array.isArray(pages)) {
    return positions;
  }
  let index = 0;
  for (const page of pages) {
    const questions = (page as { questions?: unknown }).questions;
    if (!Array.isArray(questions)) {
      continue;
    }
    for (const question of questions) {
      const id = (question as { id?: unknown }).id;
      if (typeof id === 'string') {
        positions.set(id, index);
      }
      index++;
    }
  }
  return positions;
}

/**
 * The same structure with record keys removed and question references replaced by position.
 *
 * An unrecognised `questionId` becomes `'?'` rather than being dropped: a rule pointing at a
 * question that is not in this form is itself a difference worth seeing, and collapsing all such
 * rules to one marker keeps two equally-broken forms comparing equal.
 */
function withoutRecordIdentity(value: unknown, positions: ReadonlyMap<string, number>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => withoutRecordIdentity(item, positions));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'id') {
      continue;
    }
    if (key === 'questionId' && typeof item === 'string') {
      out[key] = positions.has(item) ? `#${positions.get(item)}` : '?';
      continue;
    }
    out[key] = withoutRecordIdentity(item, positions);
  }
  return out;
}

/** What the builder's template control should be offering. */
export type TemplateControlState =
  /** No template saved from this form (or nothing to compare) — offer to save one. */
  | 'none'
  /** A template exists and still matches this form — say so, offer nothing. */
  | 'current'
  /** A template exists but the form has moved on — offer to save the newer shape. */
  | 'drifted';

export interface TemplateControlInputs {
  /** Fingerprint of the template saved from this form; null when there is none. */
  savedFingerprint: string | null;
  /** Fingerprint of the form as it stands; null while the tree is still loading. */
  draftFingerprint: string | null;
}

/**
 * Decide the control's state from the two fingerprints.
 *
 * An unknown draft resolves to `none` rather than `current`: claiming "Saved" is a statement of
 * fact the UI would be making without evidence, and being wrong there is how an author loses work
 * they believed was safely templated. Offering a save they did not need costs one dismissed
 * dialog.
 */
export function templateControlState(inputs: TemplateControlInputs): TemplateControlState {
  if (inputs.savedFingerprint === null || inputs.draftFingerprint === null) {
    return 'none';
  }
  return inputs.savedFingerprint === inputs.draftFingerprint ? 'current' : 'drifted';
}
