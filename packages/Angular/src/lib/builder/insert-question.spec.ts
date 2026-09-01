/**
 * That inserting a question between two others cannot break a rule.
 *
 * THE CLAIM THIS FILE EXISTS TO STOP BEING AN ARGUMENT. `form-builder.component.ts` says, beside
 * the drag path:
 *
 *   > The only write path that hooks this, because it is the only one that can INVERT a pair:
 *   > every other path appends or removes, and neither reverses the order of two surviving
 *   > questions. If insert-at-index, duplicate-below or move-to-another-section ever ships, that
 *   > proof lapses and the diff has to wrap the new write too.
 *
 * Insert-at-index has now shipped. The proof does NOT lapse — an insert preserves the relative
 * order of every existing pair, and the new question is born with no rule and is referenced by
 * none — but "does not lapse" is a sentence, and the drag path already learned that reasoning
 * about rule damage in prose is how a rail and a badge come to disagree. So the insert runs the
 * same `newlyBrokenRules` diff the drag runs, and this asserts the diff comes back empty.
 *
 * WHY THE ORDERING ARGUMENT HOLDS. Rules key on question IDs — `condition.questionId`, and
 * `{ kind: 'question', id }` for a jump — never on `DisplayOrder`. What an insert changes is
 * every later question's ORDER NUMBER, which no rule reads. What it does not change is which
 * questions precede which, and that is the only thing the read horizon and the forward-only
 * jump check care about.
 *
 * The case worth being nervous about, and the reason the fixture is shaped this way, is inserting
 * BETWEEN a rule and the question it reads. That is where an off-by-one in the splice would show
 * up as a rule that suddenly reads a question answered after it runs.
 */
import { describe, expect, it } from 'vitest';
import type { ConditionalRule } from '@mj-biz-apps/forms-entities';
import { collectRuleEntries, type RuleInventoryForm } from './rules-inventory';
import { newlyBrokenRules } from './reorder';
import type { ConditionalSourceQuestion } from './condition-sources';

const showsWhenVip: ConditionalRule = {
  show: { all: [{ questionId: 'q1', op: 'equals', value: 'vip' }] },
};

/**
 * The verb is `jump`, singular, and it holds an ARRAY — see `ConditionalRule` in forms-entities.
 * An earlier draft wrote `jumps` behind an `as ConditionalRule` cast, and hung it on a fixture
 * key called `rule` when the interface calls it `conditionalRule`. Both typechecked or were
 * never typechecked, both produced questions carrying no rule at all, and every assertion below
 * passed against a form nothing could break. The last test in this file is what caught that, and
 * it is why it is here.
 */
const jumpsToLast: ConditionalRule = {
  jump: [{ target: { kind: 'question', id: 'q4' }, when: { all: [{ questionId: 'q1', op: 'isAnswered' }] } }],
};

const source = (id: string, prompt: string): ConditionalSourceQuestion => ({ id, prompt, kind: 'text' });

/**
 * A two-section form whose rules span the gap: q3 shows only for a VIP (read from q1, a section
 * earlier), and q2 jumps forward to q4. Any insert that disturbed relative order would break one
 * of the two.
 */
function formWith(pageOneQuestions: Array<{ id: string; label: string; conditionalRule?: ConditionalRule }>): RuleInventoryForm {
  return {
    sources: [
      { id: 'q1', prompt: 'Ticket type', kind: 'singleChoice', options: [{ label: 'VIP', value: 'vip' }] },
      source('q2', 'Name'),
      source('q3', 'VIP lounge preference'),
      source('q4', 'Anything else?'),
      ...pageOneQuestions
        .filter((q) => !['q1', 'q2', 'q3', 'q4'].includes(q.id))
        .map((q) => source(q.id, q.label)),
    ],
    pages: [
      { id: 'p1', label: 'About you', questions: pageOneQuestions },
      {
        id: 'p2',
        label: 'Details',
        questions: [
          { id: 'q3', label: 'VIP lounge preference', conditionalRule: showsWhenVip },
          { id: 'q4', label: 'Anything else?' },
        ],
      },
    ],
    endings: [],
  };
}

const readsTicketType: ConditionalRule = {
  show: { all: [{ questionId: 'q1', op: 'isAnswered' }] },
  ...jumpsToLast,
};

/**
 * q2 both READS q1 and JUMPS forward to q4, so the fixture exercises the source horizon and the
 * forward-only destination check at once — the two things an ordering change can invalidate.
 */
const BEFORE_INSERT = [
  { id: 'q1', label: 'Ticket type' },
  { id: 'q2', label: 'Name', conditionalRule: readsTicketType },
];

/** The array operation the builder performs: splice the new question in at `index`. */
function withInsertAt(index: number) {
  const questions = [...BEFORE_INSERT];
  questions.splice(index, 0, { id: 'new', label: 'Untitled question' });
  return formWith(questions);
}

describe('inserting a question between two others', () => {
  it.each([0, 1, 2])('breaks no rule when inserted at index %i', (index) => {
    const before = collectRuleEntries(formWith(BEFORE_INSERT));
    const after = collectRuleEntries(withInsertAt(index));

    expect(newlyBrokenRules(before, after)).toEqual([]);
  });

  it('leaves a rule readable when the insert lands between it and the answer it reads', () => {
    // Index 1 puts the new question between q1 (the answer q3's show rule reads, and q2's jump
    // condition reads) and q2. Relative order survives, so both rules still resolve.
    const after = collectRuleEntries(withInsertAt(1));
    expect(after.filter((entry) => entry.broken.length > 0)).toEqual([]);
  });

  it('adds no rule of its own', () => {
    // The inserted question is born with no ConditionalRule, so it contributes no entry at all —
    // which is the other half of why an insert is safe: nothing new can be broken either.
    const before = collectRuleEntries(formWith(BEFORE_INSERT));
    const after = collectRuleEntries(withInsertAt(1));
    expect(after).toHaveLength(before.length);
  });

  it('still reports damage when the order genuinely does invert', () => {
    // The guard's own guard. If `newlyBrokenRules` could not see a real inversion through this
    // fixture, the four assertions above would pass for a form nothing can break, and would be
    // worth nothing. Putting q2's jump BEFORE the q1 it reads is a real break.
    const before = collectRuleEntries(formWith(BEFORE_INSERT));
    const inverted = collectRuleEntries(
      formWith([
        { id: 'q2', label: 'Name', conditionalRule: readsTicketType },
        { id: 'q1', label: 'Ticket type' },
      ]),
    );
    expect(newlyBrokenRules(before, inverted).length).toBeGreaterThan(0);
  });
});
