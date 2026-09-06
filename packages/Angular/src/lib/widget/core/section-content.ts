/**
 * What a section puts on screen, including a word about what it is NOT putting there.
 *
 * Section-at-a-time scroll removed most of the retroactive-removal problem: a jump to another
 * section moves the respondent rather than deleting things in front of them. One case survives —
 * a `Go to` pointing at a question in the SAME section makes the questions between it disappear
 * from the screen they are looking at, instantly and with no explanation. That reads as a glitch
 * rather than as logic.
 *
 * WHICH ABSENCES ARE WORTH MENTIONING is the whole content of this module, and it is not "every
 * question that is missing". A question hidden by its own `show` rule is ordinary progressive
 * disclosure: it was never on screen, nothing was taken away, and announcing it would narrate
 * the form's structure at the respondent every time a follow-up did not apply — while also
 * telling them how many questions they are being spared, which is nobody's business. A question
 * a JUMP passed over is different in kind: it was visible a moment ago, and it went away because
 * of something they just typed.
 *
 * Pure and framework-free; the component renders these entries, it does not decide them.
 */
import {
  evaluateConditionalRule,
  type AnswerValue,
  type PublishedFormPage,
  type PublishedFormQuestion,
} from '@mj-biz-apps/forms-entities';

/** One thing a section renders: a question, or a note about questions a jump passed over. */
export type SectionEntry =
  | { kind: 'question'; question: PublishedFormQuestion }
  | {
      kind: 'skipped';
      /** How many questions this run passed over. */
      count: number;
      /**
       * The prompt of the question whose rule caused it, when that can be said honestly.
       *
       * Absent when the run opens the section, or when the question before it carries no jump —
       * see the note in {@link sectionEntries} on why guessing here is worse than saying less.
       */
      afterPrompt?: string;
    };

/**
 * The section's questions in order, with each run of jump-skipped questions collapsed into one
 * entry where it sat.
 *
 * ATTRIBUTION IS DELIBERATELY TIMID. A run is attributed to the question immediately before it,
 * because a jump fires at its own stop and the skipping starts directly after — so for a
 * within-section jump that question IS the cause. But a jump from an earlier section can land
 * mid-page, leaving a run whose predecessor carries no rule at all and had nothing to do with
 * it. Naming that question would tell the respondent an answer they never gave caused this, so
 * the attribution is dropped unless the question actually carries a `jump`.
 *
 * @param page the section being rendered
 * @param rendered every question the flow renders, form-wide (`FormRuntime.renderedQuestions`)
 * @param answers the settled answers those rules were evaluated against
 */
export function sectionEntries(
  page: PublishedFormPage,
  rendered: readonly PublishedFormQuestion[],
  answers: ReadonlyMap<string, AnswerValue>,
): SectionEntry[] {
  const renderedIds = new Set(rendered.map((question) => question.id));
  const entries: SectionEntry[] = [];
  let run = 0;
  let cause: PublishedFormQuestion | undefined;
  let previous: PublishedFormQuestion | undefined;

  const flush = (): void => {
    if (run > 0) {
      entries.push({ kind: 'skipped', count: run, ...(cause ? { afterPrompt: cause.prompt } : {}) });
      run = 0;
    }
  };

  for (const question of [...page.questions].sort((a, b) => a.displayOrder - b.displayOrder)) {
    if (renderedIds.has(question.id)) {
      flush();
      entries.push({ kind: 'question', question });
      previous = question;
      continue;
    }
    // Not rendered. Its own `show` rule failing means it was never on screen — nothing was taken
    // away, so there is nothing to say about it.
    if (!evaluateConditionalRule(question.conditionalRule, answers)) {
      continue;
    }
    if (run === 0) {
      cause = previous?.conditionalRule?.jump !== undefined ? previous : undefined;
    }
    run += 1;
  }
  flush();
  return entries;
}

/**
 * The line a respondent reads where the questions were.
 *
 * Written from their side of the screen: they did not trigger a conditional branch, they
 * answered a question and the form stopped asking things that no longer apply. It names the
 * cause wherever it honestly can, because the cause is also the fix — if the skip was not what
 * they meant, the answer above it is the thing to change.
 */
/**
 * Stable identity for a rendered entry, for `@for (... ; track ...)`.
 *
 * A question is its id. A skipped run has no identity of its own, so it takes one from the run
 * it stands for — prefixed so it can never collide with a question id.
 *
 * This exists because tracking on `$index` let Angular recycle one question component across two
 * different questions that happened to occupy the same position in different sections.
 */
export function entryKey(entry: SectionEntry): string {
  return entry.kind === 'question'
    ? entry.question.id
    : `skipped:${entry.afterPrompt ?? ''}:${entry.count}`;
}

export function skippedMessage(entry: Extract<SectionEntry, { kind: 'skipped' }>): string {
  const questions = entry.count === 1 ? '1 question' : `${entry.count} questions`;
  const prompt = entry.afterPrompt?.trim();
  // A blank prompt would render as 'your answer to “”', which reads as a bug rather than as an
  // untitled question.
  return prompt
    ? `${questions} skipped based on your answer to “${prompt}”`
    : `${questions} skipped based on your answers`;
}
