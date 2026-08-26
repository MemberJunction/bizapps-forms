/**
 * Reading and writing an item's `ConditionalRule` JSON, and turning one condition into prose.
 *
 * This was the rules PANEL's model — which cards an item offered, which its picker still had
 * left, how a card summarized itself. The picker is gone (one dialog holds every verb now, see
 * `logic-draft.ts`), and what survives is the part that was never about the panel: the accessors
 * every writer of a rule shares, and `describeCondition`, which is the single source of prose for
 * a condition.
 *
 * That last one matters more than its size suggests. The rail summarises a rule in one line, the
 * Rules tab spells it out in full, and an author who reads one wording in the panel and another
 * in the hub has to work out whether the rule changed under them. Both call this.
 */
import type { ConditionalCondition, ConditionalGroup, ConditionalRule } from '@mj-biz-apps/forms-entities';
import { operatorLabel, operatorNeedsValue, type ConditionalSourceQuestion } from './condition-sources';

/**
 * One rule verb — a key of the ConditionalRule JSON, and nothing else.
 *
 * There used to be a pseudo-verb, `disqualify`, which was a screen COLUMN masquerading as a rule
 * key: it read the screen's own show group and wrote `IsDisqualification` through a separate
 * output. It is gone, along with the `RuleFlags` bag that carried that column into this model.
 * Every verb here is now exactly what it says — something stored in the rule.
 */
export type RuleVerb = keyof ConditionalRule;

/** The group a rule holds for one verb, or undefined when the verb is not present. */
export function verbGroup(
  rule: ConditionalRule | undefined,
  verb: RuleVerb,
): ConditionalGroup | undefined {
  const value = rule?.[verb];
  return Array.isArray(value) ? undefined : value;
}

/**
 * The rule with one verb's group replaced.
 *
 * Setting a verb's only group to `undefined` collapses the whole rule to `undefined` rather than
 * leaving `{}` behind — an empty rule object would serialize as a phantom "has a rule" marker
 * every consumer then has to see through.
 */
export function withVerbGroup(
  rule: ConditionalRule | undefined,
  verb: RuleVerb,
  group: ConditionalGroup | undefined,
): ConditionalRule | undefined {
  const next: ConditionalRule = { ...rule };
  if (group === undefined) {
    delete next[verb];
  } else if (verb === 'show') {
    next.show = group;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * The conditions a group carries, whichever combinator holds them.
 *
 * One reader for both keys, because `{ all: [] }`, `{ any: [] }`, `{}` and `undefined` all mean
 * the same thing to an author — "nothing written yet" — and every caller that hand-rolled
 * `group?.all ?? group?.any ?? []` had to remember that.
 */
export function groupConditions(group: ConditionalGroup | undefined): ReadonlyArray<ConditionalCondition> {
  return group?.all ?? group?.any ?? [];
}

/**
 * One condition as a phrase: "Ticket type equals VIP", "Interests includes any of Sports".
 *
 * Labelled in the SOURCE's voice: `isMember` intersects for a set-valued answer, so `in` reads
 * "includes any of" on a multi-select and "is one of" on a single answer. Same operator, two
 * honest readings, one function that knows which.
 *
 * A reference to a question that no longer exists says so rather than vanishing. A summary that
 * hides the breakage is how a dead rule survives unnoticed — and a show rule on a deleted source
 * evaluates false, hiding the item from everyone.
 */
export function describeCondition(
  condition: ConditionalCondition,
  sources: ReadonlyArray<ConditionalSourceQuestion>,
): string {
  const source = condition.source === 'score' ? undefined : sources.find((s) => s.id === condition.questionId);
  const prompt = condition.source === 'score' ? 'Total score' : (source?.prompt ?? '(deleted question)');
  const parts = [prompt, operatorLabel(condition.op, source?.kind)];
  if (operatorNeedsValue(condition.op) && condition.value !== undefined) {
    const value = Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value);
    if (value.length > 0) {
      parts.push(value);
    }
  }
  return parts.join(' ');
}
