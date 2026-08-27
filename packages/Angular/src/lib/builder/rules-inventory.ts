/**
 * Every rule on a form, as sentences — the model behind the badges the canvas puts on the items
 * that carry them (plans/RULES_SIMPLIFICATION_PLAN.md Phase 3).
 *
 * Rules are authored one item at a time, in a panel attached to the question, page or ending
 * screen they belong to. That is the right place to WRITE one and the wrong place to understand
 * a form: nothing anywhere showed which items had rules, what they said, or which of them had
 * quietly stopped working. An author had to click every item to find out.
 *
 * This was a whole workspace tab for a while — a hub listing every rule in reading order. The
 * hub read well and was in the wrong place: it said things about a question that belonged
 * BESIDE that question, and it was a second surface an author had to know existed. What it
 * produced is now read by {@link ruleBadgesFor}, so the same sentences appear on the canvas
 * against the item they are about.
 *
 * The failure that makes this more than a convenience: a condition whose question is not in the
 * answer map — DELETED, or answered LATER than the rule runs — reads a plain `undefined`. Not the
 * `NOT_EVALUABLE` sentinel, which is reserved for a condition naming nothing at all; a deleted
 * question's id is still a perfectly good string. `undefined` is `false` for the equality family
 * and TRUE for `isNotAnswered` / `notEquals`, so the guarded item is pinned shut for everyone or
 * pinned OPEN for everyone, depending on the operator — silently, with the form still looking
 * correct in the builder. {@link collectRuleEntries} surfaces exactly that as `broken`.
 *
 * It also answers the one question next to those sentences that is not itself a rule: how a
 * respondent REACHES an ending screen ({@link endingReachFor}). That lives here because the
 * answer depends on which endings the form's `Go to` rules point at, which this module already
 * has to walk.
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
import { jumpReach, reachNote, readHorizon, type ReachSource } from './jump-reach';
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
  /** Ending screens only — the one a respondent lands on when no condition picks another. */
  isDefault?: boolean;
  /** Questions only — counted when a `Go to` reports what it passes over. */
  isRequired?: boolean;
}

export interface RuleInventoryPage extends RuleInventoryItem {
  questions: RuleInventoryItem[];
}

/** The whole form, as the inventory reads it. Structural, so specs need no BaseEntity. */
export interface RuleInventoryForm {
  pages: RuleInventoryPage[];
  endings: RuleInventoryItem[];
  /**
   * Every question a CONDITION may reference — the whole form's answerable questions, not one
   * item's legal sources: a rule reading a question it should not have been able to reach is
   * still a rule that reads, and calling it broken would be a lie.
   *
   * ANSWERABLE, which is narrower than "every question", and the difference is a `Statement`.
   * One collects no answer, so it never reaches the answer map and every operator on it is a
   * constant — `toConditionalSource` drops it, and a condition naming one is genuinely broken.
   * That makes this the wrong list for a jump DESTINATION, which may legally be any question on
   * the form; those resolve through {@link RuleInventoryForm.pages}, where a Statement is
   * present. Reading destinations from here had the badge calling a paragraph on the canvas
   * "deleted", and reporting a healthy rule broken for it.
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
  /**
   * What a `Go to` costs, in one line — "Skips 3 questions, 1 of them required" — or `''` when
   * there is nothing to say. Empty on a `show` rule, which goes nowhere.
   *
   * Separate from {@link sentence} because they answer different questions: the sentence says
   * what the rule DOES, and this says what it takes away. Folding it in would also have churned
   * every existing sentence for a reason unrelated to any of them.
   */
  readonly note: string;
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
 * A destination the picker would never have offered, arrived at by REORDERING.
 *
 * The resolver treats a backward, self or unknown target as inert by design — that is what makes
 * jump cycles unrepresentable — so nothing fails, nothing logs, and the rule reads correctly in
 * the dialog while never running.
 */
const UNREACHED_DESTINATION = 'a destination that is no longer ahead of it, so the rule never runs';
/** Refused by the resolver — see `hasCondition` in rule-verbs.ts for why ignoring is the safe way. */
const NO_CONDITIONS = 'no conditions, so it never runs';
/**
 * A source that EXISTS but sits after the rule in the walk — arrived at by REORDERING (issue #73).
 *
 * Not a deleted question, and saying so would be worse than saying nothing: the question is two
 * rows down the canvas, visibly present, and a badge caught lying once is a badge nobody reads on
 * the day it is right. What actually happens is that the rule runs before anything has been put in
 * the answer map under that id, decides the same way for every respondent, and then CHANGES ITS
 * MIND once the source is answered — the widget re-derives visibility on every keystroke.
 */
const UNREADABLE_SOURCE =
  'a question that is answered later than this rule runs, so the rule reads a blank';

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
  // An ENDING is not a stop in the walk — it is evaluated after the whole form — so neither what
  // a jump passes over nor what a rule may read is asked of one.
  const reachSource: ReachSource | undefined = kind === 'ending' ? undefined : { kind, id: item.id };
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
      broken: brokenIn(show, form, reachSource, 'show'),
      note: '',
    });
  }

  const jumps = item.conditionalRule?.jump ?? [];
  jumps.forEach((jump, index) => {
    const destination = describeTarget(jump.target, form);
    // What the jump passes over, and whether it can fire at all — see `jump-reach.ts`. An
    // ENDING screen is not a stop in the walk, so reach is asked only of an item that is: a
    // question or a section.
    const reach = reachSource ? jumpReach(form.pages, reachSource, jump.target) : undefined;
    // The resolver refuses a conditionless jump outright, so everything else this row would say
    // about it — where it goes, what it skips — is about a rule that never runs.
    const fires = groupConditions(jump.when).length > 0;
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
        `${whenClause(jump.when, form.sources, 'jump')}`,
      broken: [
        ...brokenIn(jump.when, form, reachSource, 'jump'),
        ...destination.broken,
        ...(fires ? [] : [NO_CONDITIONS]),
        // Only when the destination RESOLVES and the rule can run at all: a deleted target is
        // already reported above, and saying "it is not ahead of the rule" about a question that
        // no longer exists — or about a rule that never runs anyway — sends the author looking
        // for an ordering problem they do not have.
        ...(fires && reach?.inert && destination.broken.length === 0
          ? [UNREACHED_DESTINATION]
          : []),
      ],
      // A count of what a dead rule "would skip" describes behaviour no respondent meets, and
      // reads as though the rule is working.
      note: fires && reach ? reachNote(reach) : '',
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
    broken.push(...brokenIn(show, form, undefined, 'show'));
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
    note: '',
  };
}

/**
 * How a respondent reaches one ending screen, in the words the endings list shows above its
 * title.
 *
 * There are exactly three routes to an ending and the list has to tell them apart: it is the
 * DEFAULT, a condition on the screen picks it when someone finishes, or a `Go to` rule sends
 * them there. Only the first two existed when this line was first written, so it was derived
 * from the screen alone — and a screen wired up as a rule's destination read "Never shown — add
 * a condition", which is wrong about the screen and wrong about the fix.
 */
export interface EndingReach {
  /** The short line above the title: how a respondent gets here. */
  readonly label: string;
  /** True when nothing can send anyone here — something for the author to fix. */
  readonly unreachable: boolean;
}

/**
 * Every ending screen's reach, keyed by id.
 *
 * Read off the same {@link targetedEndings} walk the broken-rule badges use. A second
 * implementation of "which endings does a rule point at" is a second answer that can disagree
 * with the first, and these two are shown side by side on the same row.
 */
export function endingReachFor(form: RuleInventoryForm): Map<string, EndingReach> {
  const targeted = targetedEndings(form);
  return new Map(form.endings.map((ending) => [ending.id, reachOf(ending, targeted.has(ending.id))]));
}

function reachOf(ending: RuleInventoryItem, targeted: boolean): EndingReach {
  if (ending.isDefault) {
    return { label: 'Default ending', unreachable: false };
  }
  if (ending.isDisqualification === true) {
    // Asked BEFORE the condition, because a screened-out screen's condition is never read:
    // `resolveEndingScreen` excludes these screens entirely, so a rule is the only way in and
    // "add a condition" would be advice to configure a control that does nothing.
    return targeted
      ? { label: 'Screened out', unreachable: false }
      : { label: 'Never shown — no rule sends anyone here', unreachable: true };
  }
  if (ending.conditionalRule?.show) {
    return { label: 'Conditional ending', unreachable: false };
  }
  if (targeted) {
    return { label: 'Reached by a rule', unreachable: false };
  }
  // Endings are checked in order and the first match wins, so one with no condition is only ever
  // reachable as the default — and there already is one.
  return { label: 'Never shown — add a condition', unreachable: true };
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
      // Resolved from the PAGES, not from `form.sources`. Those two lists answer different
      // questions and only one of them is about destinations: `sources` is what a CONDITION may
      // read, so it holds the answerable questions only, and a `Statement` — which collects no
      // answer — is absent from it while sitting on the canvas as a perfectly good place to jump
      // to. `jumpReach` walks every question, so the runtime lands there quite happily; resolving
      // the name through `sources` was the badge calling a paragraph the author is looking at
      // "deleted", and then reporting a healthy rule broken for it.
      const question = form.pages.flatMap((p) => p.questions).find((q) => q.id === target.id);
      return {
        phrase: `skip to ${quoted(question?.label ?? '(deleted question)')}`,
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
  verb: RuleVerb = 'show',
): string {
  const conditions = groupConditions(group);
  if (conditions.length === 0) {
    // The same empty group means opposite things to the two verbs. An item with no show
    // condition is always visible; a `Go to` with none is REFUSED by the resolver rather than
    // fired for everyone (`hasCondition` in rule-verbs.ts), because "send everybody past this,
    // always" is never what anyone meant to write.
    return verb === 'jump'
      ? 'never — this rule has no conditions, so it never runs'
      : 'always — this rule has no conditions, so it applies to everyone';
  }
  const joiner = group?.any ? ' or ' : ' and ';
  return `when ${conditions.map((condition) => describeCondition(condition, sources)).join(joiner)}`;
}

/**
 * What a group references that the author needs told about, deduplicated.
 *
 * TWO failures, and they are not the same failure. A source that no longer EXISTS is a rule about
 * a question that is gone. A source that exists but is answered LATER than this rule runs is a
 * rule about a question that is right there — see {@link UNREADABLE_SOURCE}.
 *
 * Collected PER CONDITION, so a rule naming one deleted question and one moved-below question
 * reports both: that is the rule with the most to fix, and one reason per rule would hide half of
 * it. A condition that does not resolve is not then also tested for readability — there is no
 * index to compare, and two reasons about one condition sends the author looking twice.
 *
 * `source` is `undefined` for an ENDING screen, which is evaluated after the whole form is
 * answered and may legally read anything. That is the same answer `endingConditionalSources`
 * gives the picker, from the same fact.
 */
function brokenIn(
  group: ConditionalGroup | undefined,
  form: RuleInventoryForm,
  source: ReachSource | undefined,
  verb: RuleVerb,
): string[] {
  const readable = source ? readableSources(form, source, verb) : undefined;
  const reasons = new Set<string>();
  for (const condition of groupConditions(group)) {
    if (!resolves(condition, form.sources)) {
      reasons.add(MISSING_QUESTION);
      continue;
    }
    if (readable && condition.source !== 'score' && !readable.has(condition.questionId ?? '')) {
      reasons.add(UNREADABLE_SOURCE);
    }
  }
  return [...reasons];
}

/**
 * The question ids a rule on `source` may read, per `readHorizon`.
 *
 * The SAME arithmetic the source pickers slice with, which is the point: the picker and the badge
 * answer "can this rule read that question?" from one function, so they cannot disagree. Sliced
 * from the full ordered list — `form.sources` is the filtered one, and mixing them shifts every
 * horizon on a form containing a `Statement`.
 */
function readableSources(
  form: RuleInventoryForm,
  source: ReachSource,
  verb: RuleVerb,
): ReadonlySet<string> {
  const horizon = readHorizon(form.pages, source, verb);
  const questions = form.pages.flatMap((page) => page.questions);
  return new Set(questions.slice(0, horizon + 1).map((question) => question.id));
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

/**
 * One line the canvas puts on an item that carries rules.
 *
 * The Rules tab used to be where a form's logic was legible — every rule, in reading order,
 * with the broken ones called out. A whole workspace tab is a lot of room to say something that
 * belongs beside the thing it is about, and it was a second place to look that an author had to
 * remember existed. The badges say it where the rules live.
 *
 * What must NOT be lost with the tab is the warning: a condition whose question is not in the
 * answer map reads `undefined`, which is `false` for the equality family and TRUE for
 * `isNotAnswered` / `notEquals` — so the guarded item is pinned shut for everyone, or pinned
 * open for everyone, with the form still looking correct in the builder. That is what
 * {@link RuleBadge.broken} carries, and it is why a broken badge says so INSTEAD of saying what
 * the rule does: what the rule was meant to do stopped being the useful fact about it.
 */
export interface RuleBadge {
  /** Font Awesome classes — the same icon the rule carries everywhere else. */
  readonly icon: string;
  /** Two or three words on the canvas: what this item does. */
  readonly label: string;
  /** Every rule the badge stands for, one per line — the tooltip. */
  readonly detail: string;
  /** Whether any rule behind this badge references something that no longer exists. */
  readonly broken: boolean;
}

/** What a healthy badge is called, per verb. */
const BADGE_LABELS: Record<RuleVerb, string> = {
  show: 'Conditional',
  jump: 'Branches',
};

/** What any badge is called once one of its rules has stopped working. */
const BROKEN_LABEL = 'Rule is broken';

/**
 * The badges each item should wear, keyed by item id — questions, pages and ending screens
 * alike, because the id space is shared and every one of them can carry a rule.
 *
 * ONE badge per verb, not per rule. An item may carry several `Go to` rules and three badges
 * reading "Branches" say nothing three times; the tooltip carries them in order, which is where
 * order belongs, first-match-wins being what makes it matter.
 *
 * An item with no rules gets no entry rather than an empty array — "nothing to say" and "an
 * empty list of things to say" read the same on screen and differently in code, and every caller
 * would have to remember which this was.
 */
export function ruleBadgesFor(entries: ReadonlyArray<RuleEntry>): Map<string, RuleBadge[]> {
  const byItem = new Map<string, RuleBadge[]>();
  for (const entry of entries) {
    const badges = byItem.get(entry.itemId) ?? [];
    const existing = badges.find((badge) => badge.icon === entry.icon);
    byItem.set(entry.itemId, existing ? merged(badges, existing, entry) : [...badges, badgeFor(entry)]);
  }
  return byItem;
}

/** A badge standing for one rule. */
function badgeFor(entry: RuleEntry): RuleBadge {
  const broken = entry.broken.length > 0;
  return {
    icon: entry.icon,
    label: broken ? BROKEN_LABEL : BADGE_LABELS[entry.verb],
    detail: detailFor(entry),
    broken,
  };
}

/** The badge list with one more rule folded into the badge that already speaks for its verb. */
function merged(badges: RuleBadge[], existing: RuleBadge, entry: RuleEntry): RuleBadge[] {
  const broken = existing.broken || entry.broken.length > 0;
  const next: RuleBadge = {
    icon: existing.icon,
    // Breakage wins the label outright. An item with a working jump and a dead one is an item
    // whose author has something to fix, and "Branches" is a reassuring word for that state.
    label: broken ? BROKEN_LABEL : existing.label,
    detail: `${existing.detail}\n${detailFor(entry)}`,
    broken,
  };
  return badges.map((badge) => (badge === existing ? next : badge));
}

/** One rule as a line of the tooltip: what it says, and what it can no longer reach. */
function detailFor(entry: RuleEntry): string {
  if (entry.broken.length > 0) {
    // What it costs is beside the point on a rule that is not working; lead with the breakage.
    return `${entry.sentence} — references ${entry.broken.join(', ')}`;
  }
  return entry.note.length > 0 ? `${entry.sentence} — ${lowerFirst(entry.note)}` : entry.sentence;
}

/** "Skips 3 questions" reads as a sentence on its own and as a clause after an em dash. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}
