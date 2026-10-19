import { describe, it, expect } from 'vitest';
import {
  CHOICE_QUESTION_TYPES,
  DESIGNER_SIDE_EFFECT_KEYS,
  designerBlueprintSchema,
  formBlueprintSchema,
  formQuestionTypeSchema,
} from './form-blueprint';
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

/**
 * #303 security: the Designer (an LLM reading a user's brief) authors QUESTIONS, never on-submit
 * side effects. Its output is parsed with `designerBlueprintSchema`, which has no `automations` or
 * `onSubmitMode` — and REFUSES a reply that carries either, rather than stripping it, because a
 * model emitting side effects (a brief with injected instructions, say) is worth surfacing.
 */
describe('designerBlueprintSchema — the LLM\'s output, without side effects', () => {
  const content = { name: 'RSVP', pages: [{ questions: [{ type: 'Email', prompt: 'Email' }] }] };

  it('accepts a blueprint that only describes the form', () => {
    expect(designerBlueprintSchema.parse(content)).toEqual(content);
  });

  it.each([
    ['automations', { automations: [{ actionName: 'Some Powerful Action' }] }],
    ['an empty automations list (it still declines the built-in steps)', { automations: [] }],
    ['onSubmitMode', { onSubmitMode: 'Configured' }],
    ['a null onSubmitMode', { onSubmitMode: null }],
  ])('refuses %s', (_label, extra) => {
    const parsed = designerBlueprintSchema.safeParse({ ...content, ...extra });
    expect(parsed.success).toBe(false);
    expect(!parsed.success && parsed.error.issues[0].message).toMatch(/side effects/);
  });

  it('names exactly the two side-effect keys', () => {
    expect([...DESIGNER_SIDE_EFFECT_KEYS].sort()).toEqual(['automations', 'onSubmitMode']);
  });

  it('cannot yield a side effect even from a value the full schema accepts', () => {
    const trusted = formBlueprintSchema.parse({ ...content, onSubmitMode: 'Configured', automations: [{ actionName: 'X' }] });
    expect(designerBlueprintSchema.safeParse(trusted).success).toBe(false);
  });
});
