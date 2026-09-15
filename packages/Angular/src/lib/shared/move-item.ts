/**
 * Move one item of a list to another position, returning a new list.
 *
 * Ranking has two ways to reorder — the up/down buttons and now dragging — and they are different
 * operations. A button SWAPS with a neighbour; a drag LIFTS an item out and puts it down
 * somewhere else, which for a non-adjacent move shifts everything in between. Using a swap for a
 * drag is the classic version of this bug: drag item 1 to position 4 and you get 4 and 1 traded
 * while 2 and 3 sit still, which is not what the author's hand just did.
 *
 * Pure and free of Angular so the widget and the builder can both use it, and so the index
 * arithmetic is testable on its own — it is the part that silently does the wrong thing.
 */

/**
 * `list` with the item at `from` reinserted at `to`.
 *
 * Out-of-range indices return the list unchanged rather than throwing: this is driven by pointer
 * gestures and a drag that ends outside the list is a no-op, not an error.
 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || to < 0 || from >= next.length || to >= next.length) {
    return next;
  }
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
