import { describe, it, expect } from 'vitest';
import { formBlueprintSchema, formQuestionTypeSchema, CHOICE_QUESTION_TYPES } from './form-blueprint';
import { FORM_QUESTION_TYPES, questionTypeBehavior } from './question-types';

describe('taxonomy', () => {
  // Both assertions now check that the blueprint DERIVES from the contract rather than pinning
  // the numbers it derived to. Pinning is what let the enum sit at 15 while the contract moved
  // to 25: the test kept passing and the AI Designer quietly could not author the new types.
  it('offers exactly the contract\'s question types', () => {
    expect([...formQuestionTypeSchema.options].sort()).toEqual([...FORM_QUESTION_TYPES].sort());
  });

  it('treats every option-carrying type as a choice type, not just the original three', () => {
    const expected = FORM_QUESTION_TYPES.filter((t) => questionTypeBehavior(t).optionMode !== 'none');
    expect([...CHOICE_QUESTION_TYPES].sort()).toEqual([...expected].sort());
    // The ones the hand-written set missed, named explicitly so a regression is legible.
    for (const type of ['Ranking', 'Matrix', 'PictureChoice'] as const) {
      expect(CHOICE_QUESTION_TYPES.has(type), type).toBe(true);
    }
  });
});

/**
 * The one combination that cannot mean anything: `Legacy` says the built-in steps run, and
 * `automations` names steps that then never would. Rejecting it in `applyOnSubmitConfig` covers
 * both shipping actions, but `FormAuthoringEngine.BuildFromBlueprint` is public and the schema is the
 * boundary LLM output crosses — so the invariant belongs on the schema, where nothing can route
 * around it.
 */
describe('formBlueprintSchema — Legacy with authored steps', () => {
  const base = {
    name: 'Intake',
    pages: [{ title: 'p', questions: [{ type: 'Email', prompt: 'Email' }] }],
  };

  it('rejects an explicit Legacy mode alongside authored steps', () => {
    expect(() =>
      formBlueprintSchema.parse({
        ...base,
        onSubmitMode: 'Legacy',
        automations: [{ actionName: 'Forms: Send Confirmation Email' }],
      }),
    ).toThrow();
  });

  it('accepts Legacy when no steps are authored', () => {
    expect(formBlueprintSchema.parse({ ...base, onSubmitMode: 'Legacy' }).onSubmitMode).toBe('Legacy');
    expect(formBlueprintSchema.parse({ ...base, onSubmitMode: 'Legacy', automations: [] }).automations).toEqual([]);
  });

  it('accepts steps with Configured, and with no mode at all', () => {
    const steps = [{ actionName: 'Forms: Send Confirmation Email' }];
    expect(formBlueprintSchema.parse({ ...base, onSubmitMode: 'Configured', automations: steps }).automations).toHaveLength(1);
    expect(formBlueprintSchema.parse({ ...base, automations: steps }).automations).toHaveLength(1);
  });
});
