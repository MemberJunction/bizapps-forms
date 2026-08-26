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
import type { ConditionalCondition, ConditionalGroup, ConditionalRule } from '@mj-biz-apps/forms-entities';

import { SCORE_SOURCE_ID, type ConditionalSourceQuestion } from './condition-sources';
import { describeCondition, groupConditions, jumpRule, type RuleVerb } from './rules-panel-model';

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

const VERB_ICONS: Record<'show' | 'jump' | 'disqualify', string> = {
  show: 'fa-solid fa-eye',
  jump: 'fa-solid fa-arrow-turn-down',
  disqualify: 'fa-solid fa-ban',
};

const MISSING_QUESTION = 'a question that no longer exists';
const MISSING_PAGE = 'a page that no longer exists';

/**
 * Every rule on the form, in reading order: page by page, each page's own rules before its
 * questions', then the ending screens.
 *
 * Reading order rather than "grouped by verb" because that is the order the respondent meets
 * them in, and a rule is only ever understood against the ones that ran before it.
 */
export function collectRuleEntries(form: RuleInventoryForm): RuleEntry[] {
  const entries: RuleEntry[] = [];
  const pageIds = new Set(form.pages.map((page) => page.id));

  for (const page of form.pages) {
    entries.push(...pageEntries(page, form, pageIds));
    for (const question of page.questions) {
      const show = question.conditionalRule?.show;
      if (show) {
        entries.push({
          id: `question:${question.id}:show`,
          itemKind: 'question',
          itemId: question.id,
          pageId: page.id,
          verb: 'show',
          icon: VERB_ICONS.show,
          sentence: `Show ${quoted(question.label)} ${whenClause(show, form.sources)}`,
          broken: brokenIn(show, form.sources),
        });
      }
    }
  }

  for (const ending of form.endings) {
    const entry = endingEntry(ending, form);
    if (entry) {
      entries.push(entry);
    }
  }
  return entries;
}

/** A page's own rules: its show gate, then its forward jump. */
function pageEntries(
  page: RuleInventoryPage,
  form: RuleInventoryForm,
  pageIds: ReadonlySet<string>,
): RuleEntry[] {
  const out: RuleEntry[] = [];
  const show = page.conditionalRule?.show;
  if (show) {
    out.push({
      id: `page:${page.id}:show`,
      itemKind: 'page',
      itemId: page.id,
      pageId: page.id,
      verb: 'show',
      icon: VERB_ICONS.show,
      sentence: `Show ${quoted(page.label)} ${whenClause(show, form.sources)}`,
      broken: brokenIn(show, form.sources),
    });
  }

  const jump = jumpRule(page.conditionalRule);
  if (jump) {
    const target = form.pages.find((p) => p.id === jump.toPageId);
    out.push({
      id: `page:${page.id}:jump`,
      itemKind: 'page',
      itemId: page.id,
      pageId: page.id,
      verb: 'jump',
      icon: VERB_ICONS.jump,
      sentence:
        `After ${quoted(page.label)}, skip to ${quoted(target?.label ?? '(deleted page)')} ` +
        `${whenClause(jump.when, form.sources)}`,
      broken: [
        ...brokenIn(jump.when, form.sources),
        ...(pageIds.has(jump.toPageId) ? [] : [MISSING_PAGE]),
      ],
    });
  }
  return out;
}

/**
 * An ending's rule, read through its disqualification flag.
 *
 * The flag decides which verb the SAME show group means — a disqualification screens the
 * respondent out mid-form, a plain conditional ending is chosen at the end. Reading the group
 * without the flag would describe a knockout as a thank-you page.
 */
function endingEntry(ending: RuleInventoryItem, form: RuleInventoryForm): RuleEntry | undefined {
  const show = ending.conditionalRule?.show;
  if (!show) {
    return undefined;
  }
  const knockout = ending.isDisqualification === true;
  const clause = whenClause(show, form.sources);
  return {
    id: `ending:${ending.id}:${knockout ? 'disqualify' : 'show'}`,
    itemKind: 'ending',
    itemId: ending.id,
    pageId: null,
    verb: knockout ? 'disqualify' : 'show',
    icon: knockout ? VERB_ICONS.disqualify : VERB_ICONS.show,
    sentence: knockout
      ? `Disqualify — show ${quoted(ending.label)} — ${clause}`
      : `Show ${quoted(ending.label)} ${clause}`,
    broken: brokenIn(show, form.sources),
  };
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
