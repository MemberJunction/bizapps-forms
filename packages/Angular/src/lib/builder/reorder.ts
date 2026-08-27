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
 *
 * EACH RETURNED RULE CARRIES ONLY THE REASONS THIS MOVE ADDED, not everything wrong with it —
 * `broken` is narrowed on the way out. That is what the callers are asking for: the sentence
 * counts what the move cost, and {@link damageKeys} records what it will take to consider the
 * move undone. The rule's full state is the badge's business, and reading it from here would
 * make the band answerable for breakage it never announced.
 */
export function newlyBrokenRules(
  before: readonly RuleEntry[],
  after: readonly RuleEntry[],
): RuleEntry[] {
  const was = new Map(before.map((entry) => [entry.id, new Set(entry.broken)]));
  return after.flatMap((entry) => {
    const added = entry.broken.filter((reason) => !was.get(entry.id)?.has(reason));
    return added.length > 0 ? [{ ...entry, broken: added }] : [];
  });
}

/**
 * The `(rule, reason)` pairs a move is answerable for, as opaque keys — the band's identity.
 *
 * A pair and not a rule id, matching the diff that produced it. A rule can be broken twice over
 * for unrelated causes, and the band speaks for exactly one of them: the one the move added.
 * Keyed on the id alone, repairing what the move did left the band standing on the strength of
 * breakage it never announced, still offering to Undo a move already undone.
 */
export function damageKeys(broken: readonly RuleEntry[]): string[] {
  return broken.flatMap((entry) => entry.broken.map((reason) => damageKey(entry.id, reason)));
}

/** `\0` cannot occur in a rule id or a reason, so the halves cannot fuse into a false match. */
function damageKey(ruleId: string, reason: string): string {
  return `${ruleId}\0${reason}`;
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
  /**
   * The question this one used to sit immediately BEFORE, or `null` when it was last on its page.
   *
   * An ANCHOR rather than the index it came from, because an index is only true until the next
   * write. A band stands until it is undone, dismissed or repaired, and anything the author does
   * in between — nudging a different question, deleting one — renumbers the page underneath it.
   * "Put it back at index 1" then names whatever now sits at index 1, which in the case that
   * found this was the moved question itself: Undo resolved to a no-op, dismissed the band, and
   * left the rule exactly as broken as it was. An anchor says what the move actually did, and
   * inverting it needs nothing to have held still.
   */
  readonly wasBefore: string | null;
  /**
   * What this band announced, as {@link damageKeys} — the `(rule, reason)` pairs that decide when
   * it has outlived its truth. See {@link noticeStillTrue}.
   *
   * Pairs, not question ids and not rule ids: one question can carry a show rule and several
   * jumps, and one rule can be broken for two unrelated causes.
   */
  readonly damage: readonly string[];
}

/**
 * Whether a standing notice still describes something that is true.
 *
 * The band announces a consequence, and a consequence can be undone by something other than its
 * Undo button — the author drags the question back by hand, or opens the rule and fixes it in the
 * dialog. Either way the band must stop saying a rule is broken, because a warning that outlives
 * what it warned about is the same class of untrustworthy as one that lies about a deleted
 * question.
 *
 * A rule that has VANISHED — deleted along with its question — contributes no keys, so the notice
 * lapses. Gone is not broken. So is a rule still broken for a reason this band never named: the
 * move's damage is what it is answerable for, and the badge goes on saying the rest.
 *
 * The counterpart to `undoReorderMove`: that one answers "what would putting this back mean", and
 * this one answers "is there still anything to put back for".
 */
export function noticeStillTrue(
  notice: Pick<ReorderNotice, 'damage'>,
  entries: readonly RuleEntry[],
): boolean {
  const live = new Set(damageKeys(entries));
  return notice.damage.some((key) => live.has(key));
}

/**
 * The move that undoes a reorder, or `null` when there is nothing to put back.
 *
 * KEYED ON IDS, NOT INDICES — both ends of it. A stored `{from, to}` is only correct while
 * nothing else has shifted the page, an invariant that needs every other write path to retire the
 * notice first; and the obvious clock for that, `markDirty()`, fires on every keystroke in a
 * prompt and once from a background automation-event subscription, so it would clear a standing
 * Undo for reasons that have nothing to do with the author. Resolving both the question and where
 * it goes by id at click time needs nothing to have held still.
 *
 * `currentQuestionIds` is the notice's page as it stands NOW; a page that no longer exists
 * arrives as an empty list, which resolves to "not there" through the same path as a deleted
 * question rather than through a second branch.
 */
export function undoReorderMove(
  notice: Pick<ReorderNotice, 'questionId' | 'wasBefore'>,
  currentQuestionIds: readonly string[],
): { readonly from: number; readonly to: number } | null {
  const from = currentQuestionIds.indexOf(notice.questionId);
  if (from < 0) {
    return null;
  }
  const to = destination(notice.wasBefore, from, currentQuestionIds);
  return to === null || to === from ? null : { from, to };
}

/**
 * Where the moved question has to land to sit immediately before its anchor again, or `null`
 * when there is no such place.
 *
 * `moveItemInArray` splices OUT and then IN, so the anchor has already shifted down by one by
 * the time the insert happens if it sat after the question. That off-by-one is the whole of the
 * arithmetic, and it is why this is a named function rather than an expression inline.
 *
 * A DELETED anchor refuses rather than falling back to an index. Undo is a promise to put one
 * thing back exactly; where "before a question that is gone" is cannot be worked out, and
 * guessing is how a band ends up moving the right question to the wrong place.
 *
 * KNOWN LIMIT: an anchor that has itself been MOVED is resolved against where it now sits. No
 * neighbour survives that — undoing one move while a second has reordered the same pair has no
 * unique answer — and this is the case where Undo can resolve to "already there" and simply
 * lapse. It is a convenience that declines; the badge goes on reporting the rule, which is the
 * half that has to be right.
 */
function destination(
  wasBefore: string | null,
  from: number,
  currentQuestionIds: readonly string[],
): number | null {
  if (wasBefore === null) {
    // Nothing followed it. The end of the page is still the end of the page: every write path
    // other than a reorder APPENDS (plan §1.5), so anything added since was added after it, and
    // "last among everything that existed at the time" is where it was.
    return currentQuestionIds.length - 1;
  }
  const anchor = currentQuestionIds.indexOf(wasBefore);
  if (anchor < 0) {
    return null;
  }
  return anchor > from ? anchor - 1 : anchor;
}
