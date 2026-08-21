import { describe, it, expect } from 'vitest';
import { THEME_LAYOUT_TOKENS } from './default-theme';
import { buildFormSnapshot, type FormSnapshot } from './form-snapshot';
import { planEdits } from './form-edit';

const IDS = { page: 'p-1', name: 'q-name', email: 'q-email' };

const snapshot = (answerCount = 0): FormSnapshot =>
  buildFormSnapshot({
    formId: 'form-1',
    name: 'Assessment',
    status: 'Draft',
    responseCount: answerCount,
    cssVariables: {},
    pages: [
      {
        id: IDS.page,
        title: 'Details',
        questions: [
          { id: IDS.name, type: 'ShortText', prompt: 'Your name', isRequired: false, answerCount, options: [] },
          { id: IDS.email, type: 'Email', prompt: 'Email', isRequired: true, answerCount: 0, options: [] },
        ],
      },
    ],
    screens: [],
  });

/**
 * The tracer for the edit layer.
 *
 * `planEdits` is where every decision that can go wrong lives — resolving a handle to a row,
 * refusing a destructive change, ordering operations — and it is PURE, so all of it is testable
 * without a database. The applier that follows it only persists what the plan already decided.
 */
describe('planEdits — turning what the model said into what may be done', () => {
  it('resolves a handle to the row it names', () => {
    const plan = planEdits(snapshot(), [
      { op: 'updateQuestion', handle: 'q1', prompt: 'What is your full name?' },
    ]);

    expect(plan.refused).toEqual([]);
    expect(plan.resolved).toHaveLength(1);
    expect(plan.resolved[0]).toMatchObject({
      op: 'updateQuestion',
      id: IDS.name,
      prompt: 'What is your full name?',
    });
  });

  it('refuses a handle it was never shown, and says which', () => {
    // An invented handle is the model naming a row it cannot see. Refusing by NAME matters: the
    // reply has to be able to say what it could not do, not fail the whole turn silently.
    const plan = planEdits(snapshot(), [
      { op: 'updateQuestion', handle: 'q9', prompt: 'nope' },
    ]);

    expect(plan.resolved).toEqual([]);
    expect(plan.refused).toHaveLength(1);
    expect(plan.refused[0].reason).toContain('q9');
  });

  it('keeps the good operations when one of a batch is bad', () => {
    // A turn that adds three questions and mistypes one handle should still add the two it got
    // right. All-or-nothing would make the assistant less useful the more it tries to do at once.
    const plan = planEdits(snapshot(), [
      { op: 'updateQuestion', handle: 'q1', prompt: 'Full name' },
      { op: 'updateQuestion', handle: 'q9', prompt: 'nope' },
      { op: 'updateQuestion', handle: 'q2', prompt: 'Email address' },
    ]);

    expect(plan.resolved.map((r) => r.id)).toEqual([IDS.name, IDS.email]);
    expect(plan.refused).toHaveLength(1);
  });
});

describe('planEdits — deleting only what nobody has answered', () => {
  /**
   * The decision this encodes: a draft nobody has answered may be edited freely, and a question
   * with responses may not be removed, because `FormResponseAnswer.QuestionID` points at it and
   * the answers go with the row. There is no undo in the builder.
   *
   * The count is in the snapshot precisely so the ASSISTANT can decline in its own words before
   * proposing anything. This is the second line, for when it proposes it anyway.
   */
  it('removes a question nobody has answered', () => {
    const plan = planEdits(snapshot(0), [{ op: 'deleteQuestion', handle: 'q1' }]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ op: 'deleteQuestion', id: IDS.name });
  });

  it('refuses one that has answers, and says how many', () => {
    const plan = planEdits(snapshot(32), [{ op: 'deleteQuestion', handle: 'q1' }]);
    expect(plan.resolved).toEqual([]);
    expect(plan.refused[0].reason).toContain('32');
  });

  it('offers the thing that is safe instead', () => {
    // A refusal that names no alternative just stops the author. Hiding a question keeps both the
    // row and its answers while taking it off the form, which is what they almost always mean.
    const plan = planEdits(snapshot(32), [{ op: 'deleteQuestion', handle: 'q1' }]);
    expect(plan.refused[0].reason).toMatch(/hid(e|den)/i);
  });

  it('still deletes an unanswered question on a form that has responses', () => {
    // The gate is PER QUESTION, not per form. A live form gains a question, nobody has reached it
    // yet, and removing it takes nothing with it.
    const withMixedCounts = buildFormSnapshot({
      formId: 'form-1', name: 'A', status: 'Published', responseCount: 40,
      cssVariables: {},
      pages: [{
        id: IDS.page, title: 'D',
        questions: [
          { id: IDS.name, type: 'ShortText', prompt: 'Old', isRequired: false, answerCount: 40, options: [] },
          { id: IDS.email, type: 'Rating', prompt: 'Brand new', isRequired: false, answerCount: 0, options: [] },
        ],
      }],
      screens: [],
    });
    const plan = planEdits(withMixedCounts, [{ op: 'deleteQuestion', handle: 'q2' }]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ id: IDS.email });
  });
});

describe('planEdits — adding a question', () => {
  it('puts it on the page it names', () => {
    const plan = planEdits(snapshot(), [
      { op: 'addQuestion', handle: 'p1', type: 'Rating', prompt: 'How likely to recommend?' },
    ]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ op: 'addQuestion', id: IDS.page, type: 'Rating' });
  });

  it('can place it after an existing question', () => {
    const plan = planEdits(snapshot(), [
      { op: 'addQuestion', handle: 'p1', type: 'Phone', prompt: 'Phone', after: 'q1' },
    ]);
    expect(plan.refused).toEqual([]);
    // The second reference is resolved too — the applier needs a row id, not a handle.
    expect(plan.resolved[0]).toMatchObject({ afterId: IDS.name });
  });

  it('refuses a position that names something that is not a question', () => {
    const plan = planEdits(snapshot(), [
      { op: 'addQuestion', handle: 'p1', type: 'Phone', prompt: 'Phone', after: 'p1' },
    ]);
    expect(plan.resolved).toEqual([]);
    expect(plan.refused[0].reason).toMatch(/page/i);
  });

  it('refuses a page handle that names a question', () => {
    // `addQuestion q1` is the mistake a model makes when it means "next to q1". Caught by kind,
    // not by hoping the model gets it right.
    const plan = planEdits(snapshot(), [
      { op: 'addQuestion', handle: 'q1', type: 'Phone', prompt: 'Phone' },
    ]);
    expect(plan.resolved).toEqual([]);
    expect(plan.refused[0].reason).toMatch(/question/i);
  });

  it('refuses a type the form engine does not have', () => {
    // The question-type vocabulary is closed and shared with the widget. An invented type would
    // persist and then render as nothing.
    const plan = planEdits(snapshot(), [
      { op: 'addQuestion', handle: 'p1', type: 'StarRating', prompt: 'Rate' },
    ]);
    expect(plan.resolved).toEqual([]);
    expect(plan.refused[0].reason).toMatch(/StarRating/);
  });
});

describe('planEdits — changing a question type', () => {
  it('retypes one nobody has answered', () => {
    const plan = planEdits(snapshot(0), [
      { op: 'updateQuestion', handle: 'q1', type: 'LongText' },
    ]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ type: 'LongText' });
  });

  it('refuses to retype one that already holds answers', () => {
    // ShortText answers live in `TextValue`; a Rating's live in `NumericValue`. Retyping does not
    // move them, so the existing answers stop being readable by the question that owns them —
    // silently, and with no undo. Rewording is fine; changing what the answers MEAN is not.
    const plan = planEdits(snapshot(32), [
      { op: 'updateQuestion', handle: 'q1', type: 'Rating' },
    ]);
    expect(plan.resolved).toEqual([]);
    expect(plan.refused[0].reason).toContain('32');
  });

  it('still rewords a question that has answers', () => {
    // The gate is on the TYPE, not on touching an answered question at all. Fixing a typo in a
    // live form's wording is both safe and the most common thing anyone wants.
    const plan = planEdits(snapshot(32), [
      { op: 'updateQuestion', handle: 'q1', prompt: 'What is your full name?' },
    ]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ prompt: 'What is your full name?' });
  });

  it('refuses a type it does not have, answered or not', () => {
    const plan = planEdits(snapshot(0), [
      { op: 'updateQuestion', handle: 'q1', type: 'StarRating' },
    ]);
    expect(plan.refused[0].reason).toMatch(/StarRating/);
  });
});

describe('planEdits — moving a question', () => {
  it('moves it after another question', () => {
    const plan = planEdits(snapshot(), [{ op: 'moveQuestion', handle: 'q2', after: 'q1' }]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ id: IDS.email, afterId: IDS.name });
  });

  it('moves it to the top of a page when no position is given', () => {
    const plan = planEdits(snapshot(), [{ op: 'moveQuestion', handle: 'q2', toPage: 'p1' }]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ toPageId: IDS.page });
  });

  it('refuses to move a question after itself', () => {
    // Resolves fine and means nothing — the applier would compute a position from a row it is
    // about to move. Caught here rather than producing a silent no-op the reply calls a success.
    const plan = planEdits(snapshot(), [{ op: 'moveQuestion', handle: 'q1', after: 'q1' }]);
    expect(plan.resolved).toEqual([]);
    expect(plan.refused[0].reason).toMatch(/itself/i);
  });
});

describe('planEdits — pages', () => {
  it('adds a page', () => {
    const plan = planEdits(snapshot(), [{ op: 'addPage', title: 'Availability' }]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ op: 'addPage', title: 'Availability' });
  });

  it('retitles one', () => {
    const plan = planEdits(snapshot(), [{ op: 'updatePage', handle: 'p1', title: 'About you' }]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ id: IDS.page, title: 'About you' });
  });

  it('deletes an empty-of-answers page', () => {
    const plan = planEdits(snapshot(0), [{ op: 'deletePage', handle: 'p1' }]);
    expect(plan.refused).toEqual([]);
  });

  it('refuses to delete a page holding an answered question', () => {
    // Deleting a page takes its questions with it, so the per-question gate has to reach through
    // the page or it is trivially bypassed by deleting the container instead.
    const plan = planEdits(snapshot(32), [{ op: 'deletePage', handle: 'p1' }]);
    expect(plan.resolved).toEqual([]);
    expect(plan.refused[0].reason).toContain('32');
  });
});

describe('planEdits — screens and layout', () => {
  const withScreen = buildFormSnapshot({
    formId: 'form-1', name: 'A', status: 'Draft', responseCount: 0,
    cssVariables: {},
    pages: [{ id: IDS.page, title: 'D', questions: [] }],
    screens: [{ id: 'sc-1', role: 'welcome', title: 'Hello', isDefault: false }],
  });

  it('rewords a screen', () => {
    const plan = planEdits(withScreen, [
      { op: 'updateScreen', handle: 's1', title: 'Become a Volunteer' },
    ]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ id: 'sc-1', title: 'Become a Volunteer' });
  });

  it('sets a layout token the author asked for by name', () => {
    const plan = planEdits(withScreen, [
      { op: 'setLayout', tokens: { '--mjf-question-size': '0.9375rem' } },
    ]);
    expect(plan.refused).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({ tokens: { '--mjf-question-size': '0.9375rem' } });
  });

  it('refuses a colour dressed up as a layout change', () => {
    // `setLayout` exists so sizing can be asked for explicitly. Letting a palette token through it
    // would route around the contrast gate that every colour is supposed to pass.
    const plan = planEdits(withScreen, [
      { op: 'setLayout', tokens: { '--mjf-page-bg': '#000000' } },
    ]);
    expect(plan.resolved).toEqual([]);
    expect(plan.refused[0].reason).toContain('--mjf-page-bg');
  });
});

describe('setLayout accepts exactly the tokens the theme merge protects', () => {
  /**
   * Third copy of this five-name list — `default-theme` protects them, `form-snapshot` describes
   * them, `form-edit` permits them. Three files, three jobs, one list, and no compiler linking
   * them. A token added to the merge guard but not here becomes silently un-settable; added here
   * but not to the guard, silently wiped by the next restyle.
   */
  it('permits every protected token', () => {
    for (const token of THEME_LAYOUT_TOKENS) {
      const plan = planEdits(snapshot(), [{ op: 'setLayout', tokens: { [token]: 'x' } }]);
      expect(plan.refused, `${token} must be settable`).toEqual([]);
    }
  });

  it('permits nothing else', () => {
    const plan = planEdits(snapshot(), [{ op: 'setLayout', tokens: { '--mjf-accent': '#000' } }]);
    expect(plan.resolved).toEqual([]);
  });
});
