/**
 * What an in-place title edit commits, and what it puts back.
 *
 * The builder's form name is edited where it is displayed, with no Save button and no dialog —
 * chromeless until you reach for it, because the title of the page you are on should not look
 * like a text box. The cost of that is that every way OUT of the box is a decision: blur, Enter,
 * Escape, and an emptied box all have to mean something, and until this existed they all meant
 * "write whatever is in there".
 *
 * WHY THE DECISION IS PURE AND SEPARATE. The three exits are DOM events and belong in the
 * template; what they agree on is one question — commit this, or put that back — and having it
 * in one place is what stops Escape and blur drifting into two different opinions about an empty
 * box. It also makes the rule testable in a suite with no DOM.
 *
 * THIS IS MJ'S OWN ANSWER, not a new one. `Generic/whiteboard/src/lib/whiteboard-pages.component.ts`
 * commits an inline rename on blur or Enter, abandons it on Escape, and — the part that matters
 * here — ignores an empty value and keeps the previous name. Select-on-focus is the same
 * decision in `base-forms/form-field.component.ts` (`OnFKFocus`), the theme-studio rename, and
 * the conversations prompt dialog.
 */

/**
 * The outcome of one edit. BOTH ARMS CARRY THE VALUE THE BOX SHOULD SHOW, so the caller assigns
 * `value` unconditionally and only branches on whether to write. A refused edit that left the
 * refused text on screen would be the original defect with a guard bolted on: the form would be
 * called one thing and the box would say another.
 */
export type InlineEditOutcome =
  | { readonly kind: 'commit'; readonly value: string }
  | { readonly kind: 'revert'; readonly value: string };

/**
 * Decide what an edit did, given what is in the box and what the record is currently called.
 *
 * Three ways to end up reverting, and they are one rule rather than three cases:
 *
 *  - **Emptied.** An empty name is not something an author can have meant — the only route to it
 *    is select-all-then-delete, which is how you start RETYPING a name, not how you finish. It
 *    reached the database before this existed, and left the canvas heading, the browser tab and
 *    the gallery card all blank.
 *  - **Whitespace only.** The same thing, spelled differently. Trimming first is what makes it
 *    the same case rather than a second one to remember.
 *  - **Unchanged.** Tabbing through the title is not an edit. Writing anyway would put a save, a
 *    Record Change row and a dirty marker behind every accidental click on the name.
 *
 * The COMMITTED value is trimmed, so " Leads Q4 " and "Leads Q4" are one name rather than two
 * that look identical in every list that shows them.
 */
export function resolveInlineEdit(typed: string, previous: string): InlineEditOutcome {
  const trimmed = typed.trim();
  if (trimmed.length === 0 || trimmed === previous) {
    return { kind: 'revert', value: previous };
  }
  return { kind: 'commit', value: trimmed };
}
