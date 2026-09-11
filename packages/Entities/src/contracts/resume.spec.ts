import { describe, it, expect } from 'vitest';

import { RESUME_SNAPSHOT_FIELDS, type ResumeSnapshot } from './resume';

/**
 * The snapshot is a wire shape TWO packages parse — the server writes it into `resumeJSON`, the
 * widget reads it back — so its field set is pinned here the way `SUBMISSION_INPUT_FIELDS` pins the
 * submission input. A field added on one side and never read on the other looks like it works.
 */
describe('ResumeSnapshot', () => {
  const snapshot: ResumeSnapshot = {
    responseId: '9DA322E6-0000-4000-8000-000000000001',
    status: 'Partial',
    formVersionId: '33910B9E-0000-4000-8000-000000000002',
    startedAt: '2026-09-03T10:00:00.000Z',
    answers: [{ QuestionID: 'Q1', TextValue: 'Ada' }],
  };

  it('carries exactly the fields both ends agree on', () => {
    expect(Object.keys(snapshot).sort()).toEqual([...RESUME_SNAPSHOT_FIELDS].sort());
  });

  it('is valid without startedAt — a draft saved before the widget sent one', () => {
    const withoutStart: ResumeSnapshot = { ...snapshot, startedAt: undefined };
    expect(withoutStart.startedAt).toBeUndefined();
    expect(withoutStart.answers).toHaveLength(1);
  });

  it('carries the stored column spelling, not the transport spelling', () => {
    // The answers ARE `StoredAnswerRow`s, so `collapseAnswer` reads them without a translation
    // step. If this ever becomes `{ questionId, textValue }` there are two spellings of an answer
    // in one contract, which is the drift the shared type exists to prevent.
    expect(snapshot.answers[0].QuestionID).toBe('Q1');
    expect(snapshot.answers[0].TextValue).toBe('Ada');
  });
});
