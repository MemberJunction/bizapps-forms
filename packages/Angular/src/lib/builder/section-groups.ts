/**
 * Grouping a rule picker's options by the section that owns them.
 *
 * Both rule pickers used to state something false about the form. The condition picker was a
 * flat list of every readable question, and the jump picker was a flat `Questions` list followed
 * by a separate `Sections` list — which says questions and sections are unrelated peers. They
 * are not: a section CONTAINS questions, and on a form with more than one section an author
 * reading a flat list cannot tell which question lives where.
 *
 * Nesting is the whole fix, and it is the same claim the canvas makes by indentation: position
 * states the relationship. What lives here is the part both pickers must agree on — the section
 * shape, the group shape, and the wording of a heading — because an author reads both and would
 * otherwise have to work out whether "Project Details (4)" and "Project Details — 4 questions"
 * meant the same thing.
 *
 * NOTHING HERE TOUCHES WHAT A RULE MEANS. These functions take options that are already built
 * and hand back the same objects under headings. The option `value` a stored rule matches on,
 * the `JumpTarget` it decodes to, and the forward-only filtering that decided which options
 * exist at all are all somebody else's business, unchanged.
 */
import type { ConditionalSourceQuestion } from './condition-sources';

/** A section, as a picker needs to know it: what to call it, and what it owns. */
export interface FormSection {
  readonly id: string;
  readonly label: string;
  /** Ids of the questions this section owns, in display order. */
  readonly questionIds: readonly string[];
}

/** One `<optgroup>`: its heading, and the options under it. */
export interface SectionGroup<T> {
  /**
   * Stable identity for the `@for` track expression — a section id, never the heading.
   *
   * The heading is DISPLAY TEXT and two sections can produce the same one: titles are free text,
   * so two can share a name, and with equal filtered counts their headings are then identical
   * character for character. Tracking by that gives Angular duplicate keys for distinct groups
   * (NG0955), and rows reconcile onto the wrong group.
   */
  readonly key: string;
  readonly group: string;
  readonly options: readonly T[];
}

/**
 * The heading over one section's options — "Project Details (4 questions)".
 *
 * THE COUNT IS WHAT THIS GROUP HOLDS, never the section's size. Both pickers are filtered: a
 * question's rule may only read questions before it, and may only jump forward. A heading
 * claiming four above a list of two is the same kind of lie the flat list was telling, moved.
 */
export function sectionHeading(label: string, questionCount: number): string {
  return `${label} (${questionCount} question${questionCount === 1 ? '' : 's'})`;
}

/**
 * The heading for sources that belong to no section.
 *
 * Exactly one thing reaches it today — the running score an ending may band on, which is not a
 * question and sits in no page. It gets a group rather than being dropped, because dropping it
 * would quietly remove a rule source the engine still honours.
 */
export const UNSECTIONED_GROUP = 'Form';

/**
 * The condition picker's options, grouped by section.
 *
 * Order is the form's own: sections in display order, and within a section the order the caller
 * supplied, which is already flow order. Anything the sections cannot place is kept in a
 * trailing group rather than discarded — see {@link UNSECTIONED_GROUP}.
 */
export function groupedConditionSources(
  sources: readonly ConditionalSourceQuestion[],
  sections: readonly FormSection[],
): SectionGroup<ConditionalSourceQuestion>[] {
  const groups: SectionGroup<ConditionalSourceQuestion>[] = [];
  const placed = new Set<string>();

  for (const section of sections) {
    const owned = sources.filter((s) => section.questionIds.includes(s.id));
    if (owned.length === 0) {
      continue;
    }
    owned.forEach((s) => placed.add(s.id));
    groups.push({ key: section.id, group: sectionHeading(section.label, owned.length), options: owned });
  }

  const rest = sources.filter((s) => !placed.has(s.id));
  if (rest.length > 0) {
    groups.push({ key: UNSECTIONED_GROUP, group: UNSECTIONED_GROUP, options: rest });
  }
  return groups;
}
