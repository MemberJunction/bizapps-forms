/**
 * The rules panel's model: which rule cards an item shows, which its "+ Add rule" picker still
 * offers, and how a card summarizes its conditions in one line. Pure functions, no Angular
 * (RULES_AND_BRANCHING_PLAN §3).
 *
 * A "verb" is one key of the {@link ConditionalRule} JSON — `show`, `require` (questions) and
 * `jump` (pages) — plus the one pseudo-verb, `disqualify`, which is a COLUMN on the screen
 * rather than a JSON key (see {@link RuleVerb}). A future verb belongs here too, rather than in
 * a parallel scheme of its own.
 */
import type {
  ConditionalCondition,
  ConditionalGroup,
  ConditionalJumpRule,
  ConditionalRule,
} from '@mj-biz-apps/forms-entities';
import { operatorLabel, operatorNeedsValue, type ConditionalSourceQuestion } from './condition-sources';

/**
 * One rule verb. Most are keys of the ConditionalRule JSON; `disqualify` is the exception —
 * it is the screen's `IsDisqualification` flag plus the screen's OWN show group, so the card
 * reads/writes `rule.show` and toggles the flag through a separate output.
 */
export type RuleVerb = keyof ConditionalRule | 'disqualify';

/** Non-JSON state a card may depend on — today just the screen's disqualification flag. */
export interface RuleFlags {
  disqualification?: boolean;
}

/** The verbs whose payload is a plain condition group (jump carries a target as well). */
export type GroupVerb = 'show' | 'require';

export function isGroupVerb(verb: RuleVerb): verb is GroupVerb {
  return verb === 'show' || verb === 'require';
}

/** A page a jump card may target — later pages only; the caller enforces the ordering. */
export interface JumpTargetPage {
  id: string;
  label: string;
}

/** One card the panel can offer: a verb plus the copy that sells it in the picker. */
export interface RuleCardSpec {
  verb: RuleVerb;
  title: string;
  /** Font Awesome classes for the card icon. */
  icon: string;
  /** One-line description shown on the picker card and as the open card's hint. */
  description: string;
  /**
   * Verbs this card cannot coexist with. An ending is EITHER a conditional ending OR a
   * disqualification — both read the same show group, so offering the second while the first
   * is active would silently flip the meaning of the group already authored.
   */
  excludes?: RuleVerb[];
}

/** The cards a QUESTION offers. */
export const QUESTION_RULE_CARDS: ReadonlyArray<RuleCardSpec> = [
  {
    verb: 'show',
    title: 'Show only if',
    icon: 'fa-solid fa-eye',
    description: 'Hide this question unless an earlier answer matches.',
  },
  {
    verb: 'require',
    title: 'Require if',
    icon: 'fa-solid fa-asterisk',
    description:
      'Make this question required when earlier answers match — "if Other, please explain". The Required toggle above always wins when it is on.',
  },
];

/** The cards a PAGE offers. */
export const PAGE_RULE_CARDS: ReadonlyArray<RuleCardSpec> = [
  {
    verb: 'show',
    title: 'Show only if',
    icon: 'fa-solid fa-eye',
    description: 'Skip this whole page unless answers from earlier pages match.',
  },
  {
    verb: 'jump',
    title: 'Jump to page',
    icon: 'fa-solid fa-arrow-turn-down',
    description:
      'After this page, skip ahead to a later page when answers match. The skipped pages are not asked and their answers are dropped.',
  },
];

/** The cards an ENDING SCREEN offers. */
export const ENDING_RULE_CARDS: ReadonlyArray<RuleCardSpec> = [
  {
    verb: 'show',
    title: 'Show only if',
    icon: 'fa-solid fa-flag-checkered',
    description:
      'Endings are checked in order and the first match wins. One with no condition is only reachable as the default.',
    excludes: ['disqualify'],
  },
  {
    verb: 'disqualify',
    title: 'Disqualify if',
    icon: 'fa-solid fa-ban',
    description:
      'End the form immediately when answers match — the respondent sees this screen mid-form and the response is recorded as Disqualified. No automations run.',
    excludes: ['show'],
  },
];

/**
 * The spec for one verb among the ones THIS item offers, or undefined when it offers no such
 * card. Undefined rather than a fallback: the dialog titles itself from this, and titling a
 * require group "Show only if" because that happened to be first would mislabel the thing being
 * edited.
 */
export function cardSpec(
  verb: RuleVerb,
  specs: ReadonlyArray<RuleCardSpec>,
): RuleCardSpec | undefined {
  return specs.find((spec) => spec.verb === verb);
}

/** The group a rule holds for one group verb, or undefined when the verb is not present. */
export function verbGroup(rule: ConditionalRule | undefined, verb: GroupVerb): ConditionalGroup | undefined {
  return rule?.[verb];
}

/** Whether the rule (plus flags) carries anything for this verb. */
export function hasVerb(rule: ConditionalRule | undefined, verb: RuleVerb, flags?: RuleFlags): boolean {
  if (verb === 'disqualify') {
    return flags?.disqualification === true;
  }
  if (verb === 'jump') {
    return (rule?.jump?.length ?? 0) > 0;
  }
  // On a disqualification screen the show group BELONGS to the disqualify card.
  if (verb === 'show' && flags?.disqualification === true) {
    return false;
  }
  return verbGroup(rule, verb) !== undefined;
}

/**
 * The jump the UI edits — the FIRST rule in the list. The schema keeps a first-match-wins
 * list for forward compatibility; the panel authors a single jump per page, which covers the
 * business cases (role tracks, ticket tracks) without a rule-ordering UI.
 */
export function jumpRule(rule: ConditionalRule | undefined): ConditionalJumpRule | undefined {
  return rule?.jump?.[0];
}

/** The rule with its jump list replaced by the single given jump (or removed). */
export function withJumpRule(
  rule: ConditionalRule | undefined,
  jump: ConditionalJumpRule | undefined,
): ConditionalRule | undefined {
  const next: ConditionalRule = { ...rule };
  if (jump === undefined) {
    delete next.jump;
  } else {
    next.jump = [jump];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * The rule with one verb's group replaced. Setting a verb's only group to `undefined` collapses
 * the whole rule to `undefined` rather than leaving `{}` behind — an empty rule object would
 * serialize as a phantom "has a rule" marker every consumer then has to see through.
 */
export function withVerbGroup(
  rule: ConditionalRule | undefined,
  verb: GroupVerb,
  group: ConditionalGroup | undefined,
): ConditionalRule | undefined {
  const next: ConditionalRule = { ...rule };
  if (group === undefined) {
    delete next[verb];
  } else {
    next[verb] = group;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/* --------------------------------------------------------------- authoring a rule as a draft */

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

/** Whether the author has actually said something. The test for "is this rule worth keeping". */
export function isAuthoredGroup(group: ConditionalGroup | undefined): boolean {
  return groupConditions(group).length > 0;
}

/** Which combinator a group uses — the part `groupConditions` deliberately drops. */
function combinatorOf(group: ConditionalGroup | undefined): 'all' | 'any' | 'none' {
  if (group?.all !== undefined) {
    return 'all';
  }
  return group?.any !== undefined ? 'any' : 'none';
}

/** Value equality for a comparand, which is a scalar or a list of them. */
function sameValue(a: ConditionalCondition['value'], b: ConditionalCondition['value']): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((entry, i) => entry === b[i]);
  }
  return a === b;
}

function sameCondition(a: ConditionalCondition, b: ConditionalCondition): boolean {
  return (
    a.source === b.source &&
    a.questionId === b.questionId &&
    a.op === b.op &&
    sameValue(a.value, b.value)
  );
}

/**
 * Value equality between two groups — what decides whether closing the dialog needs to ask.
 *
 * Field by field rather than `JSON.stringify`, because the two sides are built by different
 * code: the baseline is parsed out of a stored JSON column, the draft is assembled by the
 * condition editor, and neither promises the other's key order. Stringifying would report an
 * edit the author never made, and a discard warning that fires on an untouched rule is the kind
 * of dialog people learn to click through.
 */
export function sameGroup(a: ConditionalGroup | undefined, b: ConditionalGroup | undefined): boolean {
  if (combinatorOf(a) !== combinatorOf(b)) {
    return false;
  }
  const left = groupConditions(a);
  const right = groupConditions(b);
  return left.length === right.length && left.every((cond, i) => sameCondition(cond, right[i]));
}

/**
 * A rule mid-authoring, before it is committed to the item.
 *
 * The dialog edits THIS and nothing else, so closing it can genuinely discard: the item's own
 * rule is not touched until {@link isDraftCommittable} passes and the author presses Done. It
 * replaces the `drafts: Set<RuleVerb>` marker the panel used to carry — that existed only
 * because edits were persisted as they were typed, which is what let a card be added empty.
 */
export interface RuleDraft {
  readonly verb: RuleVerb;
  readonly group: ConditionalGroup | undefined;
  /** A jump's target page; null for every other verb. */
  readonly jumpTargetId: string | null;
}

/**
 * Whether this draft would persist anything. A jump needs BOTH halves — a target with no
 * conditions describes when to jump as "never", which `withJumpRule` correctly stores as
 * nothing at all, so committing it would close the dialog over an empty result.
 */
export function isDraftCommittable(draft: RuleDraft): boolean {
  if (!isAuthoredGroup(draft.group)) {
    return false;
  }
  return draft.verb !== 'jump' || (draft.jumpTargetId ?? '').length > 0;
}

/** Whether this draft differs from what the item already had — the reason to warn on close. */
export function isDraftDirty(draft: RuleDraft, baseline: RuleDraft): boolean {
  return (
    !sameGroup(draft.group, baseline.group) ||
    (draft.jumpTargetId ?? '') !== (baseline.jumpTargetId ?? '')
  );
}

/** The specs whose verb the rule actually carries, in spec order. */
export function activeCards(
  rule: ConditionalRule | undefined,
  specs: ReadonlyArray<RuleCardSpec>,
  flags?: RuleFlags,
): RuleCardSpec[] {
  return specs.filter((spec) => hasVerb(rule, spec.verb, flags));
}

/**
 * One line of human-readable truth about a group, for the collapsed card header:
 * "Ticket type equals VIP", "Ticket type equals VIP · +2 more". A reference to a question that
 * no longer exists says so instead of vanishing — a summary that hides the breakage is how a
 * dead rule survives unnoticed.
 */
export function summarizeGroup(
  group: ConditionalGroup | undefined,
  sources: ReadonlyArray<ConditionalSourceQuestion>,
): string {
  const conditions = group?.any ?? group?.all ?? [];
  if (conditions.length === 0) {
    return 'No conditions yet';
  }
  const first = conditions[0];
  const prompt =
    first.source === 'score'
      ? 'Total score'
      : (sources.find((s) => s.id === first.questionId)?.prompt ?? '(deleted question)');
  const parts = [prompt, operatorLabel(first.op)];
  if (operatorNeedsValue(first.op) && first.value !== undefined) {
    const value = Array.isArray(first.value) ? first.value.join(', ') : String(first.value);
    if (value.length > 0) {
      parts.push(value);
    }
  }
  const head = parts.join(' ');
  const rest = conditions.length - 1;
  return rest > 0 ? `${head} · +${rest} more` : head;
}

/**
 * One line of truth for a jump card: where it goes and on what. A target that no longer
 * exists is said out loud for the same reason a deleted question is.
 */
export function summarizeJump(
  rule: ConditionalRule | undefined,
  sources: ReadonlyArray<ConditionalSourceQuestion>,
  targets: ReadonlyArray<JumpTargetPage>,
): string {
  const jump = jumpRule(rule);
  if (!jump) {
    return 'No conditions yet';
  }
  const label = targets.find((t) => t.id === jump.toPageId)?.label ?? '(deleted page)';
  return `Go to ${label} · ${summarizeGroup(jump.when, sources)}`;
}
