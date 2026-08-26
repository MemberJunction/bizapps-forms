/**
 * The rule verbs beyond plain show/hide (RULES_AND_BRANCHING_PLAN §2.2): conditional
 * requiredness and forward page jumps. Pure, framework-free, shared by the widget and the
 * server exactly like {@link evaluateConditionalRule} — one implementation, two callers, so
 * the two sides cannot drift on what a rule means.
 */
import {
  MAX_JUMP_RULES,
  evaluateConditionalRule,
  evaluateGroup,
  type AnswerValue,
  type EvalExtras,
  type ConditionalRule,
} from './conditional-rule';
import type { PublishedFormPage, PublishedFormScreen } from './form-definition';

/**
 * Whether a question is required RIGHT NOW, given the answers so far.
 *
 * The static `isRequired` toggle stays the stronger promise: when it is on, the question is
 * always required and any `require` group is ignored. The group only ADDS requiredness to an
 * optional question ("if Other, please explain").
 *
 * Callers must gate on visibility first — a question hidden by its `show` rule is never
 * required, whatever `require` says (invariant 2 of the plan). Both existing required checks
 * already sit behind the visibility check; keep it that way.
 */
export function isRequiredNow(
  question: { isRequired: boolean; conditionalRule?: ConditionalRule },
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): boolean {
  if (question.isRequired) {
    return true;
  }
  const requireGroup = question.conditionalRule?.require;
  return requireGroup !== undefined && evaluateGroup(requireGroup, answers, extras);
}

/**
 * The pages a respondent can currently reach, in display order — the single source of truth
 * for page visibility on both client and server (it replaces the bare show-rule filters that
 * previously lived in each).
 *
 * One forward fold: a page hidden by its `show` rule is dropped, exactly as before; a VISIBLE
 * page whose `jump` fires (first matching rule wins) drops every page strictly between it and
 * the target. The widget has no page cursor to move — one-question mode walks visible
 * questions — so "jump to page T" IS "hide the pages before T": the server's existing
 * hidden-page answer-drop then enforces the jump with no new code path.
 *
 * A backward, self, or unknown `toPageId` is inert (the rule is skipped), never an error:
 * forward-only is what makes jump cycles unrepresentable. The jumped-over pages' own jump
 * rules are never consulted — a skipped page can do nothing. A jump target hidden by its own
 * `show` rule stays hidden; jumping to a page skips the pages before it, it does not force
 * the target visible.
 */
export function resolveVisiblePages(
  pages: readonly PublishedFormPage[],
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): PublishedFormPage[] {
  const ordered = [...pages].sort((a, b) => a.displayOrder - b.displayOrder);
  const visible: PublishedFormPage[] = [];
  let skipUntilId: string | null = null;
  for (let index = 0; index < ordered.length; index++) {
    const page = ordered[index];
    if (skipUntilId !== null) {
      if (page.id !== skipUntilId) {
        continue; // jumped over
      }
      skipUntilId = null; // reached the target; it is evaluated normally below
    }
    if (!evaluateConditionalRule(page.conditionalRule, answers, extras)) {
      continue;
    }
    visible.push(page);
    skipUntilId = firedJumpTarget(page, ordered, index, answers, extras);
  }
  return visible;
}

/** The first jump rule on `page` that fires and points strictly forward, or null. */
function firedJumpTarget(
  page: PublishedFormPage,
  ordered: readonly PublishedFormPage[],
  pageIndex: number,
  answers: ReadonlyMap<string, AnswerValue>,
  extras: EvalExtras | undefined,
): string | null {
  const rules = (page.conditionalRule?.jump ?? []).slice(0, MAX_JUMP_RULES);
  for (const rule of rules) {
    const targetIndex = ordered.findIndex((p) => p.id === rule.toPageId);
    if (targetIndex <= pageIndex) {
      continue; // unknown (-1), self, or backward: inert by design
    }
    if (evaluateGroup(rule.when, answers, extras)) {
      return rule.toPageId;
    }
  }
  return null;
}

/**
 * The disqualification screen these answers have triggered, or undefined (C3).
 *
 * First match in display order — deliberately the same ordering promise as
 * {@link resolveEndingScreen} in form-screens.ts, so the two can never disagree about which
 * screen "comes first". A screen's flag alone never fires: a rule is what arms it, because a
 * disqualification with no condition would disqualify everyone on their first keystroke.
 */
export function resolveDisqualification(
  screens: readonly PublishedFormScreen[],
  answers: ReadonlyMap<string, AnswerValue>,
  extras?: EvalExtras,
): PublishedFormScreen | undefined {
  return [...screens]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .find(
      (s) =>
        s.isDisqualification === true &&
        s.conditionalRule?.show !== undefined &&
        evaluateConditionalRule(s.conditionalRule, answers, extras),
    );
}
