/**
 * The badge shown beside a choice: A, B, C … then AA, AB past the alphabet.
 *
 * Lives here rather than in the builder because BOTH sides need the same answer. The builder
 * shows the badge so an author can refer to "option C" while editing; the widget shows it to the
 * respondent. If the two disagreed about which option is C, the badge would be worse than not
 * having one — so there is one function, not one per surface.
 *
 * Deliberately free of Angular and of any barrel import: the widget is a standalone custom
 * element and must not pull the authoring layer into its bundle to get a letter.
 */

/**
 * Spreadsheet-style, so the badge never repeats however many options an author adds. Stopping at
 * Z, or falling back to numbers, would undo the only thing the badge is for.
 */
export function optionLetter(index: number): string {
  if (index < 0) {
    return '';
  }
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}
