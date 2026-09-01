/**
 * What the "Then → Go to" picker offers, and how a picked option survives a `<select>`.
 *
 * A `<select>` deals in strings, and a jump target is a tagged object. Encoding it as
 * `"question:q8"` here — in one place, with its inverse beside it — is what stops the encoding
 * being reinvented slightly differently in the template.
 *
 * FORWARD-ONLY is enforced by what the caller puts in the list, matching the resolver: a target
 * at or before the current position is inert there, so offering one would let an author write a
 * rule that silently never fires.
 */
import type { JumpTarget } from '@mj-biz-apps/forms-entities';
import { sectionHeading, type FormSection } from './section-groups';

/** The heading a target sits under in the picker. */
export type JumpTargetGroup = 'Questions' | 'Sections' | 'Endings' | 'Finish';

export interface JumpTargetOption {
  /** The `<option>` value — see {@link targetValue}. */
  value: string;
  label: string;
  group: JumpTargetGroup;
  target: JumpTarget;
}

/** One target as an option value. `submit` names nothing, so it is its own whole value. */
export function targetValue(target: JumpTarget): string {
  return target.kind === 'submit' ? 'submit' : `${target.kind}:${target.id}`;
}

/**
 * The inverse, tolerant of anything a stale DOM could hand back.
 *
 * Returns `undefined` rather than guessing: a value this build does not understand must not
 * become a target pointing somewhere arbitrary.
 */
export function targetFromValue(value: string): JumpTarget | undefined {
  if (value === 'submit') {
    return { kind: 'submit' };
  }
  const split = value.indexOf(':');
  if (split <= 0) {
    return undefined;
  }
  const kind = value.slice(0, split);
  const id = value.slice(split + 1);
  if (id.length === 0) {
    return undefined;
  }
  if (kind === 'question' || kind === 'page' || kind === 'ending') {
    return { kind, id };
  }
  return undefined;
}

/** An item a jump may point at, as the host supplies it. */
export interface JumpDestination {
  id: string;
  label: string;
}

/**
 * Build the picker's options.
 *
 * `Finish` comes last and always exists: "stop asking, they are done" needs no configuration and
 * is the honest destination when an author wants the form over without choosing a screen — the
 * ending is then picked by the conditional/default logic that already exists.
 */
export function jumpTargetOptions(
  questions: ReadonlyArray<JumpDestination>,
  pages: ReadonlyArray<JumpDestination>,
  endings: ReadonlyArray<JumpDestination>,
): JumpTargetOption[] {
  const options: JumpTargetOption[] = [];
  for (const q of questions) {
    options.push({
      value: targetValue({ kind: 'question', id: q.id }),
      label: q.label,
      group: 'Questions',
      target: { kind: 'question', id: q.id },
    });
  }
  for (const p of pages) {
    options.push({
      value: targetValue({ kind: 'page', id: p.id }),
      label: p.label,
      group: 'Sections',
      target: { kind: 'page', id: p.id },
    });
  }
  for (const e of endings) {
    options.push({
      value: targetValue({ kind: 'ending', id: e.id }),
      label: e.label,
      group: 'Endings',
      target: { kind: 'ending', id: e.id },
    });
  }
  options.push({ value: 'submit', label: 'Submit the form', group: 'Finish', target: { kind: 'submit' } });
  return options;
}

/**
 * The options grouped for rendering: one group per section, then Endings, then Finish.
 *
 * WHAT THIS REPLACED, and why. The groups used to be the four fixed ones `jumpTargetOptions`
 * tags its output with — every question on the form in one flat `Questions` list, and then
 * `Sections` beside it. On a form with more than one section that list is unreadable: the names
 * are all that is left, and nothing says which question sits where. Worse, putting the two lists
 * side by side asserts that questions and sections are peers, when a section contains questions.
 *
 * A SECTION'S OWN TARGET LEADS ITS GROUP, relabelled "Start of <section>". Jumping to a section
 * IS arriving at the top of the questions listed under it, and letting position say so is what
 * removes the separate list. The row is renamed only for DISPLAY — a copy, carrying the same
 * `value` and the same `target`, because that value is what a stored rule matches on. The bare
 * section name would otherwise repeat the heading directly above it.
 *
 * PRESENTATION ONLY. `jumpTargetOptions` above is untouched, and so is every option's `value`
 * and `target`; this only decides what headings they appear under. The forward-only filtering
 * that decides which options exist happened before this was called.
 *
 * NOTHING IS EVER DROPPED. An option the sections cannot place still gets a group, because a
 * picker that silently loses a destination leaves an author unable to write a rule the engine
 * would run — the failure would look like the target "not existing", which it does.
 */
export function groupedJumpTargets(
  options: ReadonlyArray<JumpTargetOption>,
  sections: ReadonlyArray<FormSection>,
): Array<{ group: string; options: JumpTargetOption[] }> {
  const groups: Array<{ group: string; options: JumpTargetOption[] }> = [];
  const placed = new Set<JumpTargetOption>();

  for (const section of sections) {
    const lead = options
      .filter((o) => o.target.kind === 'page' && o.target.id === section.id)
      .map((o) => ({ ...o, label: `Start of ${section.label}` }));
    const owned = options.filter(
      (o) => o.target.kind === 'question' && section.questionIds.includes(o.target.id),
    );
    if (lead.length === 0 && owned.length === 0) {
      continue;
    }
    // The lead is a COPY, so mark the original placed by matching value rather than identity.
    options
      .filter((o) => lead.some((l) => l.value === o.value) || owned.includes(o))
      .forEach((o) => placed.add(o));
    groups.push({ group: sectionHeading(section.label, owned.length), options: [...lead, ...owned] });
  }

  const strays = options.filter(
    (o) => !placed.has(o) && o.group !== 'Endings' && o.group !== 'Finish',
  );
  if (strays.length > 0) {
    groups.push({ group: 'Questions', options: [...strays] });
  }

  for (const trailing of ['Endings', 'Finish'] satisfies JumpTargetGroup[]) {
    const inGroup = options.filter((o) => o.group === trailing);
    if (inGroup.length > 0) {
      groups.push({ group: trailing, options: inGroup });
    }
  }
  return groups;
}

/**
 * How a destination is NAMED when it is missing from the picker — worded to match the badge on
 * the item, which says the same thing about the same rule.
 *
 * "an ending screen" rather than "an ending" because that is what `rules-inventory.ts` calls one
 * in `MISSING_ENDING`, and the rail and the badge are read together.
 */
const MISSING_KIND: Record<Exclude<JumpTarget['kind'], 'submit'>, string> = {
  question: 'a question',
  page: 'a page',
  ending: 'an ending screen',
};

/**
 * The label for a STORED target, including one the picker no longer offers.
 *
 * A `<select>` whose value is absent from its options renders BLANK, so a rule pointing at a
 * deleted question would show an empty box on a row that reads perfectly well in the database.
 * Returning a label lets the caller render the entry instead.
 *
 * TWO REASONS A TARGET IS UNOFFERED, and they need different sentences — the destination half of
 * issue #73. `options` is FORWARD-ONLY, so a reorder that puts a target behind its rule drops it
 * out of that list while the thing itself sits one row up the canvas, visibly present. Calling
 * that "no longer exists" is a rail caught lying, on the very row an author opens to fix the
 * rule; `collectRuleEntries` has always said the true thing about it (`UNREACHED_DESTINATION`),
 * so the two surfaces disagreed. `formTargets` is every destination the form has, wherever it
 * sits, and the difference between the two lists is exactly "exists, but not from here".
 *
 * An EMPTY `formTargets` is the safe default: with no evidence about where the target sits, the
 * honest answer is the one that makes no ordering claim, which is the old wording. Required
 * rather than defaulted, so a new caller has to decide rather than inherit the lie.
 *
 * `condition-sources.ts`'s `staleSourceLabel` is the same decision about a rule's SOURCES, and
 * the two read alike on purpose.
 */
export function storedTargetLabel(
  target: JumpTarget,
  options: ReadonlyArray<JumpTargetOption>,
  formTargets: ReadonlyArray<JumpTargetOption>,
): string {
  const value = targetValue(target);
  const known = options.find((o) => o.value === value);
  if (known) {
    return known.label;
  }
  if (target.kind === 'submit') {
    // Submit is ahead of everything and is offered everywhere; it can only be missing from a
    // list the caller never filled in.
    return 'Submit the form';
  }
  const elsewhere = formTargets.find((o) => o.value === value);
  return elsewhere
    ? `${elsewhere.label} — no longer ahead, so this rule never runs`
    : `(${MISSING_KIND[target.kind]} that no longer exists)`;
}
