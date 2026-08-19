/**
 * Naming and identity for a choice question's options.
 *
 * Both functions here exist because of the same live bug, reported after an author deleted
 * "Option 1", added a fresh option, and got a second "Option 2" — after which selecting either
 * one in the published form selected BOTH.
 *
 * The two halves of that are separate faults and both are fixed:
 *
 *  1. The new option was named from the COUNT of options, so a list that had lost one reused a
 *     name that was already taken. {@link nextOptionLabel} names from what exists instead.
 *
 *  2. An option's identity in the published form is its VALUE, because the value is literally
 *     what gets stored as the respondent's answer. Two options sharing a value are therefore the
 *     same answer, and the widget — correctly, given the data — highlighted both.
 *     {@link withUniqueValues} makes the values unique at the point the definition is built.
 *
 * Fixing only the naming would have left the second fault live for any author who deliberately
 * writes the same label twice, which is a reasonable thing to do ("Other" under two headings).
 */

/** The minimum an option needs for these rules to apply to it. */
export interface LabelledOption {
  label: string;
  value: string;
}

/**
 * The next free `<prefix> N`, given the labels already in use.
 *
 * Counts UP from 1 and takes the first gap, so deleting "Option 1" and adding one gives
 * "Option 1" back rather than minting a duplicate of a name further down the list. Case- and
 * space-insensitive, because "option 2" and "Option 2" collide for a reader even though they do
 * not collide for a string comparison.
 */
export function nextOptionLabel(existingLabels: readonly string[], prefix: string): string {
  const taken = new Set(existingLabels.map((l) => l.trim().toLowerCase()));
  for (let n = 1; n <= existingLabels.length + 1; n++) {
    const candidate = `${prefix} ${n}`;
    if (!taken.has(candidate.trim().toLowerCase())) {
      return candidate;
    }
  }
  // Unreachable for any finite list — the loop runs one past the length, so at least one of the
  // candidates must be free. Kept as a total function rather than a non-null assertion.
  return `${prefix} ${existingLabels.length + 1}`;
}

/**
 * The same options, with any duplicate value disambiguated.
 *
 * The first occurrence keeps the value the author gave it, so the common case is untouched and
 * the answer stays readable; later collisions get a numeric suffix. Order-dependent on purpose —
 * the caller passes options in display order, so the value a given option gets is stable as long
 * as the list is.
 */
export function withUniqueValues<T extends LabelledOption>(options: readonly T[]): T[] {
  const seen = new Set<string>();
  return options.map((option) => {
    if (!seen.has(option.value)) {
      seen.add(option.value);
      return option;
    }
    let suffix = 2;
    while (seen.has(`${option.value} (${suffix})`)) {
      suffix++;
    }
    const value = `${option.value} (${suffix})`;
    seen.add(value);
    return { ...option, value };
  });
}

/**
 * The badge shown beside an option: A, B, C … then AA, AB for a list longer than the alphabet.
 *
 * Spreadsheet-style rather than stopping at Z or falling back to numbers, so the badge never
 * repeats however many options an author adds — a second "A" in the same list would undo the
 * only thing the badge is for.
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
