/**
 * Pure reorder guard shared by the builder's arrow-button and drag-drop reorder paths.
 *
 * Both `moveQuestion` (keyboard/arrows) and `dropQuestion` (CDK drag) compute a source
 * and target index, then persist the page's question order the same way. This decides
 * whether a proposed move is a real, in-bounds reorder before we touch the array or the
 * database — keeping the two entry points behaviourally identical.
 */
import type { RuleEntry } from './rules-inventory';

export function isValidReorder(from: number, to: number, length: number): boolean {
  return (
    Number.isInteger(from) &&
    Number.isInteger(to) &&
    from >= 0 &&
    from < length &&
    to >= 0 &&
    to < length &&
    from !== to
  );
}

// ---------------------------------------------------------------------------
// What a move COSTS (issue #73)
// ---------------------------------------------------------------------------

/**
 * The rules carrying a reason they did not carry before the move.
 *
 * Rule health is already a pure function of the tree (`collectRuleEntries`), so warning at the
 * drag is a SET DIFFERENCE, not a second implementation of "is this rule broken". That matters
 * more than the code it saves: a drag-time checker could disagree with the badge, and the author
 * would then be told two things about one rule. This cannot, because it *is* the badge — and
 * every breakage class added to the inventory later is warned about here for free.
 *
 * Keyed on `(entry.id, reason)` PAIRS, not on entry ids. Keyed on ids alone, a rule already
 * broken by a deleted question that ALSO becomes unreadable is silently not reported — the rule
 * with the most to fix, and the one whose author has the least chance of noticing.
 *
 * One-directional by design: a move that REPAIRS a rule says nothing. An interrupt is for a
 * consequence the author did not ask for.
 */
export function newlyBrokenRules(
  before: readonly RuleEntry[],
  after: readonly RuleEntry[],
): RuleEntry[] {
  const was = new Map(before.map((entry) => [entry.id, new Set(entry.broken)]));
  return after.filter((entry) => entry.broken.some((reason) => !was.get(entry.id)?.has(reason)));
}

/**
 * The one sentence the author reads after a costly move, or `''` when the move cost nothing.
 *
 * It does NOT explain the breakage. The badge on the affected item already does that in full,
 * in the item's own words, where the fix is; a band that also explained would be a second
 * wording of one fact, free to drift from the first.
 *
 * Three forms, and the distinction between the first two is information rather than grammar:
 * whether the rule that broke is on the question the author just moved, or on a DIFFERENT one.
 * Those send them to different places on the canvas. Naming the moved question twice reads as a
 * mistake and says less — "Moved "Email". This broke 1 rule on "Email"" is the sentence this
 * arm exists to avoid. Past one affected item, listing three questions in a band is a list
 * nobody reads and the badges are already on them.
 */
export function reorderNoticeText(
  moved: { readonly id: string; readonly label: string },
  broken: readonly RuleEntry[],
  labelOf: (itemId: string) => string,
): string {
  if (broken.length === 0) {
    return '';
  }
  const items = new Set(broken.map((entry) => entry.itemId));
  const count = `${broken.length} ${broken.length === 1 ? 'rule' : 'rules'}`;
  const where =
    items.size > 1
      ? '— the affected questions are badged'
      : items.has(moved.id)
        ? 'on it'
        : `on "${labelOf(broken[0].itemId)}"`;
  return `Moved "${moved.label}". This broke ${count} ${where}.`;
}

/** A reorder that broke something, and enough to put it back. */
export interface ReorderNotice {
  /** What the author reads — see {@link reorderNoticeText}. */
  readonly text: string;
  readonly pageId: string;
  readonly questionId: string;
  /** Where the question came FROM. That is where Undo returns it. */
  readonly originalIndex: number;
}

/**
 * The move that undoes a reorder, or `null` when there is nothing to put back.
 *
 * KEYED ON IDS, NOT INDICES, and that is what makes moving the wrong question unrepresentable
 * rather than merely unlikely. A stored `{from, to}` is only correct while nothing else has
 * shifted the page, an invariant that needs every other write path to retire the notice first —
 * and the obvious clock for that, `markDirty()`, fires on every keystroke in a prompt and once
 * from a background automation-event subscription, so it would clear a standing Undo for reasons
 * that have nothing to do with the author. Resolving by id at click time is `indexOf`.
 *
 * `currentQuestionIds` is the notice's page as it stands NOW; a page that no longer exists
 * arrives as an empty list, which resolves to "not there" through the same path as a deleted
 * question rather than through a second branch.
 */
export function undoReorderMove(
  notice: Pick<ReorderNotice, 'questionId' | 'originalIndex'>,
  currentQuestionIds: readonly string[],
): { readonly from: number; readonly to: number } | null {
  const from = currentQuestionIds.indexOf(notice.questionId);
  if (from < 0) {
    return null;
  }
  // Clamped: questions may have been deleted while the band stood, and the index it came from
  // can now be past the end.
  const to = Math.min(Math.max(notice.originalIndex, 0), currentQuestionIds.length - 1);
  return from === to ? null : { from, to };
}
