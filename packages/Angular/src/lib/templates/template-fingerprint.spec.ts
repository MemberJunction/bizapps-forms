import { describe, it, expect } from 'vitest';
import { templateFingerprint, templateControlState } from './template-fingerprint';

const def = (over: Record<string, unknown> = {}) => ({
  formId: 'f1',
  formVersionId: 'v1',
  name: 'A form',
  description: 'about it',
  renderMode: 'Scroll',
  settings: {},
  styleTokens: { cssVariables: {} },
  automations: [],
  endScreens: [],
  pages: [{ id: 'p1', title: 'Page', displayOrder: 0, questions: [] }],
  ...over,
});

describe('templateFingerprint', () => {
  it('ignores the identity and naming a template legitimately differs on', () => {
    const form = def({ formId: 'form-1', name: 'Client intake', description: 'the real one' });
    const template = def({ formId: 'tpl-1', name: 'Intake template', description: 'reusable' });
    expect(templateFingerprint(template)).toBe(templateFingerprint(form));
  });
});

describe('templateFingerprint — real differences', () => {
  it('reports drift when a question is added', () => {
    const before = def();
    const after = def({
      pages: [{ id: 'p1', title: 'Page', displayOrder: 0, questions: [{ id: 'q1', type: 'ShortText', prompt: 'Name' }] }],
    });
    expect(templateFingerprint(after)).not.toBe(templateFingerprint(before));
  });

  it('reports drift when branching logic changes', () => {
    const base = def({ pages: [{ id: 'p1', displayOrder: 0, questions: [{ id: 'q1', type: 'YesNo', prompt: 'Ok?' }] }] });
    const branched = def({
      pages: [{ id: 'p1', displayOrder: 0, questions: [{ id: 'q1', type: 'YesNo', prompt: 'Ok?', conditionalRule: { show: { all: [] } } }] }],
    });
    expect(templateFingerprint(branched)).not.toBe(templateFingerprint(base));
  });

  it('does not report drift merely because keys serialize in a different order', () => {
    const a = def();
    const b = def();
    const reordered = JSON.parse(JSON.stringify({ pages: b.pages, settings: b.settings, ...b }));
    expect(templateFingerprint(reordered)).toBe(templateFingerprint(a));
  });
});

describe('templateControlState', () => {
  it('offers a save when no template was ever made from this form', () => {
    expect(templateControlState({ savedFingerprint: null, draftFingerprint: 'abc' })).toBe('none');
  });

  it('confirms when the saved template still matches the form', () => {
    expect(templateControlState({ savedFingerprint: 'abc', draftFingerprint: 'abc' })).toBe('current');
  });

  it('offers a save again once the form has moved on from its template', () => {
    expect(templateControlState({ savedFingerprint: 'abc', draftFingerprint: 'xyz' })).toBe('drifted');
  });

  it('falls back to offering a save while the draft is still unknown', () => {
    // Better to offer a save we did not need than to claim "Saved" on no evidence.
    expect(templateControlState({ savedFingerprint: 'abc', draftFingerprint: null })).toBe('none');
  });
});

describe('templateFingerprint — a copy has different ids by construction', () => {
  const shaped = (ids: { page: string; q1: string; q2: string }) => ({
    formId: 'x',
    name: 'n',
    renderMode: 'Scroll',
    settings: {},
    styleTokens: { cssVariables: {} },
    endScreens: [],
    pages: [
      {
        id: ids.page,
        title: 'Page',
        displayOrder: 0,
        questions: [
          { id: ids.q1, type: 'YesNo', prompt: 'Attending?', options: [] },
          {
            id: ids.q2,
            type: 'Number',
            prompt: 'Guests',
            options: [],
            conditionalRule: { show: { all: [{ questionId: ids.q1, op: 'equals', value: 'yes' }] } },
          },
        ],
      },
    ],
  });

  it('treats a freshly cloned form as identical to its source', () => {
    const source = shaped({ page: 'p-old', q1: 'q-old-1', q2: 'q-old-2' });
    const clone = shaped({ page: 'p-new', q1: 'q-new-1', q2: 'q-new-2' });
    expect(templateFingerprint(clone)).toBe(templateFingerprint(source));
  });

  it('still sees a real change through the id noise', () => {
    const source = shaped({ page: 'p-old', q1: 'q-old-1', q2: 'q-old-2' });
    const changed = shaped({ page: 'p-new', q1: 'q-new-1', q2: 'q-new-2' });
    changed.pages[0].questions.push({ id: 'q-new-3', type: 'ShortText', prompt: 'Extra', options: [] });
    expect(templateFingerprint(changed)).not.toBe(templateFingerprint(source));
  });

  it('sees branching that was repointed at a different question', () => {
    const a = shaped({ page: 'p', q1: 'q1', q2: 'q2' });
    const b = shaped({ page: 'p', q1: 'q1', q2: 'q2' });
    b.pages[0].questions[1].conditionalRule = { show: { all: [{ questionId: 'q2', op: 'equals', value: 'yes' }] } };
    expect(templateFingerprint(b)).not.toBe(templateFingerprint(a));
  });
});
