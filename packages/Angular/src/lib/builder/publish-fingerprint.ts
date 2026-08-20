/**
 * "Is there anything to publish?", answered by comparison rather than by a flag.
 *
 * THE BUG THIS REPLACES. The builder tracked unpublished work with a boolean latch: any
 * edit set `dirty = true`, and only a successful publish cleared it. A latch cannot answer the
 * question it is standing in for — add a question, delete that same question, and the form
 * is byte-identical to what is already live while the UI still insists you have changes to
 * publish. The state is one-way; the user's edits are not.
 *
 * THE METHOD. This is the standard "dirty checking by baseline comparison": keep a
 * canonical representation of the last known-good state, derive the same representation
 * from the current state, and compare. It is what MJ already does one level down —
 * `BaseEntity.Dirty` is `_Fields.some(f => f.Dirty)`, and a field is dirty only while
 * `OldValue !== Value`, so reverting an edit correctly un-dirties the record. It is also
 * what React Hook Form's `isDirty` does against `defaultValues`, what an HTTP ETag does
 * for a resource, and what git does with content-addressed objects. Angular's own
 * `AbstractControl.dirty` is NOT this — it is a latch cleared only by `markAsPristine()`,
 * which is exactly the trap we fell into.
 *
 * WHY IT IS CHEAP HERE. We are not inventing a representation: `buildPublishedDefinition`
 * already produces the exact snapshot a publish writes, and `FormVersion.DefinitionSnapshot`
 * stores it. Comparing those two is comparing what actually ships, so a change that cannot
 * affect a respondent cannot report as publishable. Snapshots are a few KB and the
 * comparison runs once per edit, so the string itself is the fingerprint — hashing it
 * (FNV-1a, xxhash) would only start to pay off if these grew large enough that holding two
 * copies mattered.
 *
 * CANONICALIZATION IS THE LOAD-BEARING PART. One side is built in memory, the other is
 * parsed from JSON stored months ago. `JSON.stringify` preserves insertion order, so two
 * semantically identical snapshots serialize differently whenever key order differs, and a
 * naive comparison reports "unpublished changes" forever. Sorting keys recursively (the
 * same idea as RFC 8785 JSON Canonicalization) removes that whole class of false positive.
 */
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

/**
 * Keys excluded from the comparison.
 *
 * `formVersionId` identifies the snapshot, not its content — a fresh GUID every publish, so
 * including it would make every form permanently dirty.
 *
 * `automations` is excluded for a different and less satisfying reason: it is real
 * publishable content, but it is edited in the Automate tab, which does not report changes
 * to the builder shell. The latch did not track it either, so excluding it holds the
 * existing behaviour rather than quietly regressing — but it IS a gap, and the fix is to
 * have the automation tab feed its state up, not to add it here where nothing refreshes it.
 */
const IGNORED_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(['formVersionId', 'automations']);

/**
 * Deterministic JSON: object keys sorted at every depth, array order preserved.
 *
 * Array order is meaningful here — pages and questions are ordered by DisplayOrder and
 * reordering them IS a publishable change — so only object keys get sorted.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    // `undefined` is dropped by JSON.stringify on the built side but simply absent on the
    // parsed side; normalizing here keeps an optional field from reading as a difference.
    if (source[key] === undefined) {
      continue;
    }
    out[key] = sortKeysDeep(source[key]);
  }
  return out;
}

/**
 * The comparable content of a published-form snapshot.
 *
 * Takes `unknown` because one caller passes a freshly built {@link PublishedFormDefinition}
 * and the other passes whatever `JSON.parse` returned from the database. Both are compared
 * as data; neither is trusted to have a particular shape.
 */
export function definitionFingerprint(definition: PublishedFormDefinition | unknown): string {
  if (definition === null || typeof definition !== 'object') {
    return '';
  }
  const source = definition as Record<string, unknown>;
  const comparable: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (!IGNORED_TOP_LEVEL_KEYS.has(key)) {
      comparable[key] = source[key];
    }
  }
  return canonicalJson(comparable);
}

/**
 * The fingerprint of a stored snapshot, or `null` when there is nothing to compare against.
 *
 * `null` means "never published" — a distinct state from "published and identical", and the
 * caller needs the difference: one offers Publish, the other says Published.
 */
export function storedSnapshotFingerprint(snapshotJson: string | null | undefined): string | null {
  if (!snapshotJson) {
    return null;
  }
  try {
    return definitionFingerprint(JSON.parse(snapshotJson));
  } catch {
    // A snapshot we cannot parse cannot be compared against. Reporting "no baseline" makes
    // the builder offer Publish, which is the safe direction: the worst case is republishing
    // something already live, versus hiding changes that never reach a respondent.
    return null;
  }
}

/** What the publish control should offer the author. */
export type PublishControlState = 'publish' | 'update' | 'current';

/** What {@link publishControlState} needs to decide. */
export interface PublishControlInputs {
  /** The draft differs from the published baseline. Requires both fingerprints to be known. */
  dirty: boolean;
  /**
   * Whether a published baseline was actually READ.
   *
   * False covers three different situations that used to be indistinguishable: the form has
   * never been published, the `FormVersion` read failed, and the stored snapshot would not
   * parse. Only the first is benign.
   */
  hasPublishedBaseline: boolean;
  /** `Form.Status` — what the record claims about itself. */
  status: string | null | undefined;
}

/**
 * Which publish control to show.
 *
 * `'current'` renders as a static "Published" badge with NO BUTTON, so it is the one answer the
 * builder cannot afford to get wrong: it tells the author their edits are live and removes the
 * only control that would make them live.
 *
 * Claiming it requires a baseline. Without one there is nothing to compare the draft against, so
 * `dirty` is false for lack of evidence rather than because the form is up to date — and a
 * Published form whose version row could not be read therefore rendered "Published" over a draft
 * full of unpublished edits, with no way to publish them. `storedSnapshotFingerprint` already
 * documents the intended safe direction ("makes the builder offer Publish… the worst case is
 * republishing something already live, versus hiding changes that never reach a respondent");
 * this is where that intent has to be honoured, because the status check was overriding it.
 */
export function publishControlState(inputs: PublishControlInputs): PublishControlState {
  if (inputs.dirty) {
    return 'update';
  }
  if (!inputs.hasPublishedBaseline) {
    return 'publish';
  }
  return inputs.status === 'Published' ? 'current' : 'publish';
}
