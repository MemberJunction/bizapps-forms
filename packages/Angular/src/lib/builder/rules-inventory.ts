/**
 * Every rule on a form, as sentences — the model behind the builder's Rules tab
 * (plans/RULES_SIMPLIFICATION_PLAN.md Phase 3).
 *
 * Rules are authored one item at a time, in a panel attached to the question, page or ending
 * screen they belong to. That is the right place to WRITE one and the wrong place to understand
 * a form: nothing anywhere showed how many rules a form had, what they said together, or which
 * of them had quietly stopped working. An author had to click every item to find out.
 *
 * The failure that makes this more than a convenience: a condition naming a question that was
 * since deleted is NOT_EVALUABLE, which the evaluator reads as `false`, so the item it guarded
 * is hidden from every respondent — permanently, silently, and with the form still looking
 * correct in the builder. {@link collectRuleEntries} surfaces exactly that as `broken`.
 *
 * Pure and Angular-free: the component renders these sentences, it does not compose them.
 */
import type {
  ConditionalCondition,
  ConditionalGroup,
  ConditionalRule,
  JumpTarget,
} from '@mj-biz-apps/forms-entities';

import { SCORE_SOURCE_ID, type ConditionalSourceQuestion } from './condition-sources';
import { describeCondition, groupConditions, type RuleVerb } from './rules-panel-model';

/** Which kind of item a rule hangs off — what the hub needs to route a click back to. */
export type RuleItemKind = 'question' | 'page' | 'ending';

/** One item that may carry a rule, reduced to what the inventory reads. */
export interface RuleInventoryItem {
  id: string;
  /** The item's own name, as it appears in the sentence: a prompt, a page title, a screen title. */
  label: string;
  conditionalRule?: ConditionalRule;
  /** Ending screens only — the flag that turns a show group into a knockout. */
  isDisqualification?: boolean;
}

export interface RuleInventoryPage extends RuleInventoryItem {
  questions: RuleInventoryItem[];
}

/** The whole form, as the inventory reads it. Structural, so specs need no BaseEntity. */
export interface RuleInventoryForm {
  pages: RuleInventoryPage[];
  endings: RuleInventoryItem[];
  /**
   * Every question a rule may reference, for resolving prompts in sentences AND for deciding
   * whether a reference is broken. Must be the WHOLE form's questions, not one item's legal
   * sources: a rule pointing at a question it should not have been able to reach is still a
   * rule that reads, and calling it broken would be a lie.
   */
  sources: ReadonlyArray<ConditionalSourceQuestion>;
}

/** One row of the hub: a rule, said in full, with a way back to where it is edited. */
export interface RuleEntry {
  /** Stable and unique per row — one page can carry both a show rule and a jump. */
  readonly id: string;
  readonly itemKind: RuleItemKind;
  readonly itemId: string;
  /** The page this row groups under; `null` for an ending screen, which belongs to no page. */
  readonly pageId: string | null;
  readonly verb: RuleVerb;
  /** Font Awesome classes, matching the verb's card in the authoring panel. */
  readonly icon: string;
  readonly sentence: string;
  /**
   * What this rule references that no longer exists, in plain words. Empty for a healthy rule.
   *
   * Reported per rule rather than per condition on purpose: the author's next action is to open
   * the rule, and one row saying "this rule is broken" is what gets them there.
   */
  readonly broken: string[];
}

/**
 * Row icons. `screenedOut` is not a verb — it is the ending-screen toggle — but it earns its own
 * icon because a row that records someone as screened out reads nothing like a row that shows a
 * thank-you page, and the eye would say the opposite of what it means.
 */
const ROW_ICONS = {
  show: 'fa-solid fa-eye',
  jump: 'fa-solid fa-arrow-turn-down',
  screenedOut: 'fa-solid fa-ban',
} as const;

const MISSING_QUESTION = 'a question that no longer exists';
const MISSING_PAGE = 'a page that no longer exists';
const MISSING_ENDING = 'an ending screen that no longer exists';

/**
 * Every rule on the form, in reading order: page by page, each page's own rules before its
 * questions', then the ending screens.
 *
 * Reading order rather than "grouped by verb" because that is the order the respondent meets
 * them in, and a rule is only ever understood against the ones that ran before it.
 */
export function collectRuleEntries(form: RuleInventoryForm): RuleEntry[] {
  const entries: RuleEntry[] = [];

  for (const page of form.pages) {
    entries.push(...pageEntries(page, form));
    for (const question of page.questions) {
      entries.push(...itemEntries('question', question, page.id, form));
    }
  }

  const targeted = targetedEndings(form);
  for (const ending of form.endings) {
    const entry = endingEntry(ending, form, targeted);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/** A page's own rules: its show gate, then its forward jump. */
function pageEntries(page: RuleInventoryPage, form: RuleInventoryForm): RuleEntry[] {
  return itemEntries('page', page, page.id, form);
}

/**
 * Every rule ONE item carries: its show gate, then each of its `Go to` rules in order.
 *
 * One row per rule rather than one per item, because an item can now carry several jumps and
 * first-match-wins makes their ORDER meaning. A hub that collapsed them would hide the very
 * thing an author most needs to check.
 */
function itemEntries(
  kind: RuleItemKind,
  item: RuleInventoryItem,
  pageId: string,
  form: RuleInventoryForm,
): RuleEntry[] {
  const out: RuleEntry[] = [];
  const show = item.conditionalRule?.show;
  if (show) {
    out.push({
      id: `${kind}:${item.id}:show`,
      itemKind: kind,
      itemId: item.id,
      pageId,
      verb: 'show',
      icon: ROW_ICONS.show,
      sentence: `Show ${quoted(item.label)} ${whenClause(show, form.sources)}`,
      broken: brokenIn(show, form.sources),
    });
  }

  const jumps = item.conditionalRule?.jump ?? [];
  jumps.forEach((jump, index) => {
    const destination = describeTarget(jump.target, form);
    // Numbered only when there is more than one, so the common case reads as a sentence rather
    // than as an entry in a list.
    const ordinal = jumps.length > 1 ? `Rule ${index + 1}: ` : '';
    out.push({
      id: `${kind}:${item.id}:jump:${index}`,
      itemKind: kind,
      itemId: item.id,
      pageId,
      verb: 'jump',
      icon: ROW_ICONS.jump,
      sentence:
        `${ordinal}After ${quoted(item.label)}, ${destination.phrase} ` +
        `${whenClause(jump.when, form.sources)}`,
      broken: [...brokenIn(jump.when, form.sources), ...destination.broken],
    });
  });
  return out;
}

/**
 * An ending screen's row, which is about two separate facts that used to be one.
 *
 * Its `show` group decides which thank-you page a respondent who FINISHES the form lands on.
 * Its `isDisqualification` flag decides what arriving there means. Those were entangled — the
 * same group meant "which ending" or "who is screened out" depending on the flag — and pulling
 * them apart is what let the disqualify rule verb be deleted.
 *
 * Two consequences the author needs told, because both are silent otherwise:
 *
 *  - `resolveEndingScreen` EXCLUDES flagged screens, so a show rule on one is never consulted.
 *    A screened-out screen is a destination you are sent to, not one anybody reaches by
 *    finishing, and a condition written on it does nothing at all.
 *  - A flagged screen that no `Go to` rule targets is unreachable. Nothing sends anyone there,
 *    so the screening the author thought they had configured does not happen.
 */
function endingEntry(
  ending: RuleInventoryItem,
  form: RuleInventoryForm,
  targetedEndingIds: ReadonlySet<string>,
): RuleEntry | undefined {
  const show = ending.conditionalRule?.show;
  const knockout = ending.isDisqualification === true;
  if (!show && !knockout) {
    return undefined; // an ordinary unconditional ending is the default, not a rule
  }

  const broken: string[] = [];
  if (knockout && !targetedEndingIds.has(ending.id)) {
    broken.push('nothing — no rule sends anyone to this screen');
  }
  if (knockout && show) {
    broken.push('a condition that is never read, because screened-out screens are not chosen by finishing');
  }
  if (show) {
    broken.push(...brokenIn(show, form.sources));
  }

  const sentence = knockout
    ? `Record ${quoted(ending.label)} as screened out` +
      (show ? ` (its own condition is ignored)` : '')
    : `Show ${quoted(ending.label)} ${whenClause(show, form.sources)}`;

  return {
    id: `ending:${ending.id}:${knockout ? 'screened-out' : 'show'}`,
    itemKind: 'ending',
    itemId: ending.id,
    pageId: null,
    verb: 'show',
    icon: knockout ? ROW_ICONS.screenedOut : ROW_ICONS.show,
    sentence,
    broken,
  };
}

/** Every ending screen a `Go to` rule anywhere on the form points at. */
function targetedEndings(form: RuleInventoryForm): Set<string> {
  const ids = new Set<string>();
  const collect = (rule: RuleInventoryItem['conditionalRule']): void => {
    for (const jump of rule?.jump ?? []) {
      if (jump.target.kind === 'ending') {
        ids.add(jump.target.id);
      }
    }
  };
  for (const page of form.pages) {
    collect(page.conditionalRule);
    for (const question of page.questions) {
      collect(question.conditionalRule);
    }
  }
  return ids;
}

/**
 * Where a jump sends the respondent, said in words, plus whatever about it is broken.
 *
 * Every kind is resolvable HERE and only here: the inventory is handed the whole form, where the
 * per-item rail is handed only the pages a jump may target. That asymmetry is why the rail says
 * "a later question" and this says the question's actual prompt — and it is the reason the hub
 * is the screen worth opening when a rule stops making sense.
 */
function describeTarget(
  target: JumpTarget,
  form: RuleInventoryForm,
): { phrase: string; broken: string[] } {
  switch (target.kind) {
    case 'submit':
      // No id, nothing to break: `resolveEndingScreen` picks the screen at submit time.
      return { phrase: 'submit the form', broken: [] };
    case 'page': {
      const page = form.pages.find((p) => p.id === target.id);
      return {
        phrase: `skip to ${quoted(page?.label ?? '(deleted page)')}`,
        broken: page ? [] : [MISSING_PAGE],
      };
    }
    case 'question': {
      const question = form.sources.find((q) => q.id === target.id);
      return {
        phrase: `skip to ${quoted(question?.prompt ?? '(deleted question)')}`,
        broken: question ? [] : [MISSING_QUESTION],
      };
    }
    case 'ending': {
      const ending = form.endings.find((e) => e.id === target.id);
      return {
        phrase: `finish on ${quoted(ending?.label ?? '(deleted ending screen)')}`,
        broken: ending ? [] : [MISSING_ENDING],
      };
    }
  }
}

/**
 * The trailing clause of a sentence: when this rule applies.
 *
 * Returns the whole clause, "when …" included, rather than just the conditions, because the
 * unconditional case is not a "when" at all. `evaluateGroup({})` is vacuously TRUE, so a rule
 * with no conditions fires for EVERY respondent — a jump like that silently skips pages for
 * everyone. The builder's Done button refuses to author one, but mj-sync metadata and the AI
 * builder both can, so it is a rule an author can inherit and never have written. Saying
 * "when always" would read as a rendering bug and bury the fact.
 *
 * Every condition is spelled out. `summarizeGroup` truncates to "+2 more" because it is one line
 * in a 300px rail; this does not, because the hub is the one screen where a rule can be read in
 * full and truncating here would leave nowhere in the product that shows the whole thing.
 */
function whenClause(
  group: ConditionalGroup | undefined,
  sources: ReadonlyArray<ConditionalSourceQuestion>,
): string {
  const conditions = groupConditions(group);
  if (conditions.length === 0) {
    return 'always — this rule has no conditions, so it applies to everyone';
  }
  const joiner = group?.any ? ' or ' : ' and ';
  return `when ${conditions.map((condition) => describeCondition(condition, sources)).join(joiner)}`;
}

/** The references in a group that no longer resolve, deduplicated. */
function brokenIn(
  group: ConditionalGroup | undefined,
  sources: ReadonlyArray<ConditionalSourceQuestion>,
): string[] {
  const missing = groupConditions(group).some((condition) => !resolves(condition, sources));
  return missing ? [MISSING_QUESTION] : [];
}

/**
 * Whether a condition's source still exists. A `source: 'score'` condition references no
 * question at all and is always resolvable.
 *
 * The `SCORE_SOURCE_ID` exclusion is for a caller that hands us the ENDING screens' source list,
 * which appends the score pseudo-source. A malformed condition naming that id as a `questionId`
 * would otherwise resolve against it and be reported healthy, when no answer map will ever
 * carry an entry under it.
 */
function resolves(
  condition: ConditionalCondition,
  sources: ReadonlyArray<ConditionalSourceQuestion>,
): boolean {
  if (condition.source === 'score') {
    return true;
  }
  return sources.some((s) => s.id === condition.questionId && s.id !== SCORE_SOURCE_ID);
}

/** Item names are quoted in sentences so a prompt containing "when" cannot fuse with the clause. */
function quoted(label: string): string {
  return `"${label}"`;
}

/** A page's worth of rules, ready to render as one titled block. */
export interface RuleEntryGroup {
  /** `null` for the ending-screens group, which belongs to no page. */
  readonly pageId: string | null;
  readonly label: string;
  readonly entries: RuleEntry[];
}

/** The page identity the grouping reads — id and the title shown above its rules. */
export interface RuleGroupPage {
  id: string;
  label: string;
}

/**
 * Rules grouped into one block per page, in page order, with the ending screens last.
 *
 * A flat list of every rule on a long form is a wall of sentences. Grouped by the page the
 * respondent meets them on, each block stays small enough to take in at once — and the order
 * matches the order the rules actually run in, which is the only order they can be reasoned
 * about together.
 *
 * A page with no rules is omitted rather than shown empty: an empty block says "look here" about
 * a place with nothing to look at, and on a twelve-page form that is eleven of them.
 */
export function groupEntriesByPage(
  entries: ReadonlyArray<RuleEntry>,
  pages: ReadonlyArray<RuleGroupPage>,
): RuleEntryGroup[] {
  const groups: RuleEntryGroup[] = [];
  for (const page of pages) {
    const forPage = entries.filter((entry) => entry.pageId === page.id);
    if (forPage.length > 0) {
      groups.push({ pageId: page.id, label: page.label, entries: forPage });
    }
  }
  const endings = entries.filter((entry) => entry.pageId === null);
  if (endings.length > 0) {
    groups.push({ pageId: null, label: 'Ending screens', entries: endings });
  }
  return groups;
}

/**
 * How many rules are broken — the number the tab badge carries.
 *
 * RULES, not references: a rule whose source question AND jump target are both gone is still
 * one thing for the author to open and one decision for them to make. Counting references would
 * inflate the badge and misdescribe the work.
 */
export function brokenRuleCount(entries: ReadonlyArray<RuleEntry>): number {
  return entries.filter((entry) => entry.broken.length > 0).length;
}
