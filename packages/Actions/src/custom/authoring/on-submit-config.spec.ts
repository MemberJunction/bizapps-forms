import { describe, expect, it } from 'vitest';
import { applyOnSubmitConfig } from './on-submit-config';
import type { FormBlueprint } from './form-blueprint';

const base: FormBlueprint = {
  name: 'Intake',
  pages: [{ title: 'p', questions: [{ type: 'Email', prompt: 'Email' }] }],
};

/**
 * Letting a CALLER — not only the builder UI — say what a form does on submit.
 *
 * This is the issue's ask #1 (bizapps-forms#47). Without it, a form seeded by a consumer app
 * inherits the four legacy hooks, `Forms: Upsert Respondent Person` included, and mints a second
 * `Person` for a consumer that already owns subject identity.
 */
describe('applyOnSubmitConfig', () => {
  it('leaves a blueprint alone when the caller says nothing', () => {
    // Absent must stay absent: a default here would change what every AI- and template-authored
    // form does on submit, all at once.
    const result = applyOnSubmitConfig(base, undefined, undefined);

    expect(result.onSubmitMode).toBeUndefined();
    expect(result.automations).toBeUndefined();
  });

  it('lets a caller opt out of every built-in step', () => {
    const result = applyOnSubmitConfig(base, 'Configured', undefined);

    expect(result.onSubmitMode).toBe('Configured');
  });

  it('accepts steps as a JSON string, which is how an Action param arrives', () => {
    const result = applyOnSubmitConfig(
      base,
      undefined,
      '[{"actionName":"Forms: Send Confirmation Email"},{"actionName":"Forms: Create Followup Task"}]',
    );

    expect(result.automations?.map((a) => a.actionName)).toEqual([
      'Forms: Send Confirmation Email',
      'Forms: Create Followup Task',
    ]);
  });

  it('accepts steps already parsed, which is how a direct caller supplies them', () => {
    const result = applyOnSubmitConfig(base, undefined, [{ actionName: 'Forms: Create Followup Task' }]);

    expect(result.automations).toHaveLength(1);
  });

  it('treats an empty list as "run nothing" and keeps it distinct from silence', () => {
    const result = applyOnSubmitConfig(base, undefined, '[]');

    expect(result.automations).toEqual([]);
  });

  it('rejects a mode it does not recognise instead of ignoring it', () => {
    // Ignoring it is the dangerous direction: the caller believes it opted out, and the legacy four
    // run anyway — exactly the silence this issue is about.
    expect(() => applyOnSubmitConfig(base, 'configured-ish', undefined)).toThrow(/onSubmitMode|OnSubmitMode/i);
  });

  it('rejects steps that are not a list', () => {
    expect(() => applyOnSubmitConfig(base, undefined, '{"actionName":"Forms: Create Followup Task"}')).toThrow();
  });

  it('rejects a step with no Action name rather than writing a nameless row', () => {
    expect(() => applyOnSubmitConfig(base, undefined, '[{"trigger":"OnComplete"}]')).toThrow();
  });

  it('rejects malformed JSON with a message naming the parameter', () => {
    expect(() => applyOnSubmitConfig(base, undefined, 'not json')).toThrow(/Automations/i);
  });

  it('does not mutate the blueprint it was given', () => {
    applyOnSubmitConfig(base, 'Configured', '[]');

    expect(base.onSubmitMode).toBeUndefined();
    expect(base.automations).toBeUndefined();
  });
});
