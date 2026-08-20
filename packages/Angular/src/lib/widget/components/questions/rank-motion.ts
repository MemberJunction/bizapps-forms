/**
 * Making a rank reorder PERCEIVABLE.
 *
 * Dragging already reads as movement — you carried the thing. The arrow buttons did not: the
 * list re-rendered and two rows had swapped, with nothing in between. That is change blindness,
 * and it is not a matter of taste — the visual system tracks objects through motion, so an
 * instantaneous jump gives it nothing to follow. Respondents reported the arrows as not working
 * even while the order changed correctly underneath them.
 *
 * Two answers, one per audience, and they are the same answer:
 *  - sighted: FLIP ({@link flipDeltas}) — measure where each row WAS, start it there, let it
 *    travel to where it now is. The eye follows the object rather than re-reading the list.
 *  - screen reader: {@link rankAnnouncement} — motion conveys nothing, so say it.
 *
 * Both are pure so the part that is easy to get wrong (the sign of the offset, which rows are
 * exempt, the wording) is tested rather than eyeballed.
 */

/**
 * How far each row must START from to appear, for one frame, exactly where the eye last saw it.
 *
 * The offset is `from - to`: a row that moved DOWN the page (`to` greater) gets a negative
 * offset, which lifts it back up to its old position before it travels down. Getting this sign
 * backwards animates every row the wrong way — it reads as the list rejecting the change.
 *
 * Rows that did not move, and rows with no `before` position (they were not on screen yet),
 * are omitted: animating those means starting something from nowhere.
 */
export function flipDeltas(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const [key, to] of after) {
    const from = before.get(key);
    if (from !== undefined && from !== to) {
      deltas.set(key, from - to);
    }
  }
  return deltas;
}

/**
 * What a screen reader hears after a reorder.
 *
 * Position is stated 1-based and WITH the total, because "moved to position 1" alone leaves the
 * listener to work out whether that is the top — the one fact they cannot see.
 */
export function rankAnnouncement(label: string, index: number, total: number): string {
  return `${label} moved to position ${index + 1} of ${total}.`;
}
