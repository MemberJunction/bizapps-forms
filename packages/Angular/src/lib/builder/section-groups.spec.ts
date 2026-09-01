/**
 * Grouping both rule pickers by section, so a menu states what the form's structure already says.
 *
 * THE DEFECT, read off the running builder on 2026-08-31 with a two-section form open. The
 * "Then → Go to" picker offered:
 *
 *     Questions ▸ Company Name · Tell us about your business needs · budget · timeline · Rating
 *     Sections  ▸ Project Details
 *
 * — every question on the form in ONE flat list spanning both sections, and then the sections
 * beside them as if the two were unrelated peers. They are not: a section CONTAINS questions,
 * and an author reading that list cannot tell which of those five live where. The condition
 * picker was worse still, a flat list with no headings at all.
 *
 * WHY THIS IS PRESENTATION ONLY, deliberately. `jumpTargetOptions`, `targetValue`,
 * `targetFromValue` and the stored `JumpTarget` shape are all untouched — the option VALUES that
 * a saved rule matches against are byte-for-byte what they were. Only the headings the options
 * are rendered under change. A regrouping cannot alter what a rule means; rewriting the option
 * builder could, and there is no reason to take that risk to fix a menu.
 *
 * THE COUNT IS WHAT THE GROUP ACTUALLY HOLDS, not the section's size. Both pickers are filtered
 * — a question's rule may only read questions BEFORE it, and may only jump FORWARD — so a
 * heading claiming "4 questions" above a list of two would be the same lie in a new place.
 */
import { describe, expect, it } from 'vitest';
import { groupedConditionSources, type FormSection } from './section-groups';
import { groupedJumpTargets, jumpTargetOptions } from './jump-target-options';
import { SCORE_SOURCE, type ConditionalSourceQuestion } from './condition-sources';

const SECTIONS: FormSection[] = [
  { id: 'p1', label: 'Contact Information', questionIds: ['q1', 'q2'] },
  { id: 'p2', label: 'Project Details', questionIds: ['q3', 'q4', 'q5', 'q6'] },
];

const source = (id: string, prompt: string): ConditionalSourceQuestion => ({
  id,
  prompt,
  kind: 'text',
});

describe('groupedConditionSources', () => {
  it('puts each question under the section that owns it, in section order', () => {
    const groups = groupedConditionSources(
      [source('q1', 'Your Contact Information'), source('q3', 'Business needs'), source('q2', 'Company Name')],
      SECTIONS,
    );

    expect(groups.map((g) => g.group)).toEqual([
      'Contact Information (2 questions)',
      'Project Details (1 question)',
    ]);
    expect(groups[0].options.map((o) => o.prompt)).toEqual(['Your Contact Information', 'Company Name']);
    expect(groups[1].options.map((o) => o.prompt)).toEqual(['Business needs']);
  });

  it('counts what the group offers, not how big the section is', () => {
    // 'Project Details' owns four questions; a rule sitting inside it can read one.
    const groups = groupedConditionSources([source('q3', 'Business needs')], SECTIONS);
    expect(groups[0].group).toBe('Project Details (1 question)');
  });

  it('leaves out a section that offers nothing here', () => {
    const groups = groupedConditionSources([source('q1', 'Your Contact Information')], SECTIONS);
    expect(groups.map((g) => g.group)).toEqual(['Contact Information (1 question)']);
  });

  it('gives the running total its own trailing group, since it belongs to no section', () => {
    // `SCORE_SOURCE` is not a question at all — it is the form's running score, offered to
    // endings. Dropping it for having no section would silently remove a real rule source.
    const groups = groupedConditionSources([source('q1', 'Your Contact Information'), SCORE_SOURCE], SECTIONS);
    expect(groups.map((g) => g.group)).toEqual(['Contact Information (1 question)', 'Form']);
    expect(groups[1].options).toEqual([SCORE_SOURCE]);
  });

  it('never drops a source, whatever section it claims', () => {
    // A source the sections cannot place must still be reachable: a picker that silently loses
    // an option leaves an author unable to write a rule the engine would happily run.
    const orphan = source('q99', 'Question from nowhere');
    const groups = groupedConditionSources([source('q1', 'A'), orphan], SECTIONS);
    expect(groups.flatMap((g) => g.options)).toContain(orphan);
  });
});

describe('groupedJumpTargets', () => {
  /** The picker as seen from question 1: everything after it, both sections, one ending. */
  const forwardFromQ1 = () =>
    jumpTargetOptions(
      [
        { id: 'q2', label: 'Company Name' },
        { id: 'q3', label: 'Business needs' },
        { id: 'q4', label: 'Budget range' },
      ],
      [{ id: 'p2', label: 'Project Details' }],
      [{ id: 'e1', label: 'Thank You for Reaching Out!' }],
    );

  it('nests each section’s questions under the section, and drops the separate Sections list', () => {
    const groups = groupedJumpTargets(forwardFromQ1(), SECTIONS);
    expect(groups.map((g) => g.group)).toEqual([
      'Contact Information (1 question)',
      'Project Details (2 questions)',
      'Endings',
      'Finish',
    ]);
    expect(groups.map((g) => g.group)).not.toContain('Sections');
    expect(groups.map((g) => g.group)).not.toContain('Questions');
  });

  it('leads a section’s group with the section itself, renamed to say what jumping there means', () => {
    // Jumping to "Project Details" IS arriving at the top of the questions listed beneath it.
    // Position states that; a row labelled with the bare section name, sitting under a heading
    // of the same name, would just read as a duplicate.
    const groups = groupedJumpTargets(forwardFromQ1(), SECTIONS);
    const projectDetails = groups.find((g) => g.group.startsWith('Project Details'));
    expect(projectDetails?.options.map((o) => o.label)).toEqual([
      'Start of Project Details',
      'Business needs',
      'Budget range',
    ]);
  });

  it('keeps the option value a saved rule matches on when it renames the lead row', () => {
    // The label is display; the value is identity. A rule already pointing at this page must
    // still find its option selected.
    const groups = groupedJumpTargets(forwardFromQ1(), SECTIONS);
    const lead = groups.find((g) => g.group.startsWith('Project Details'))?.options[0];
    expect(lead?.value).toBe('page:p2');
    expect(lead?.target).toEqual({ kind: 'page', id: 'p2' });
  });

  it('shows a section that can only be entered at its top', () => {
    // Forward-only can offer the section while offering none of its questions — a rule on the
    // last question of the previous section, say. The group is the lead row alone.
    const options = jumpTargetOptions([], [{ id: 'p2', label: 'Project Details' }], []);
    const groups = groupedJumpTargets(options, SECTIONS);
    expect(groups.map((g) => g.group)).toEqual(['Project Details (0 questions)', 'Finish']);
  });

  it('keeps Endings and Finish as trailing groups, in that order', () => {
    const groups = groupedJumpTargets(forwardFromQ1(), SECTIONS);
    expect(groups.slice(-2).map((g) => g.group)).toEqual(['Endings', 'Finish']);
  });

  it('never drops a target, whatever section it claims', () => {
    const options = jumpTargetOptions([{ id: 'q99', label: 'Question from nowhere' }], [], []);
    const groups = groupedJumpTargets(options, SECTIONS);
    expect(groups.flatMap((g) => g.options).map((o) => o.label)).toContain('Question from nowhere');
  });
});
