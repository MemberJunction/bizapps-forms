/**
 * `fullForm` / `projectionForm` — the two kinds of form the widget holds, and what each renders.
 */
import { describe, expect, it } from 'vitest';
import { rulesMayRead, toRespondentDefinition, type PublishedFormDefinition } from '@mj-biz-apps/forms-entities/contracts';

import { fullForm, projectionForm } from './widget-form';

function draft(): PublishedFormDefinition {
  return {
    formId: 'f',
    formVersionId: 'v',
    name: 'Draft',
    description: 'About',
    renderMode: 'OneQuestion',
    settings: { anonymousAllowed: true, captchaRequired: true, confirmationMessage: 'Ta.', redirectUrl: 'https://x' },
    styleTokens: { cssVariables: { '--mjf-accent': '#123' } },
    automations: [],
    endScreens: [],
    pages: [{ id: 'p', displayOrder: 1, questions: [{ id: 'q', type: 'Number', prompt: 'Q', isRequired: false, displayOrder: 1, options: [] }] }],
  };
}

describe('the two kinds of form', () => {
  it('a full draft renders the fields the projection would lift to the top level', () => {
    const form = fullForm(draft());
    expect(form.kind).toBe('full');
    expect(form.render).toMatchObject({ captchaRequired: true, confirmationMessage: 'Ta.', renderMode: 'OneQuestion', description: 'About' });
    expect(form.render.pages).toBe(form.definition.pages);
  });

  it('a draft and its own projection render the same fields', () => {
    const projected = projectionForm(toRespondentDefinition(draft())).render;
    const full = fullForm(draft()).render;
    for (const key of ['formId', 'formVersionId', 'name', 'description', 'renderMode', 'captchaRequired', 'confirmationMessage'] as const) {
      expect(projected[key], key).toEqual(full[key]);
    }
  });

  it('is the holder rulesMayRead takes: a projection never vouches, a full draft can', () => {
    expect(rulesMayRead(projectionForm(toRespondentDefinition(draft())), ['q'])).toBe(true);
    expect(rulesMayRead(fullForm(draft()), ['q'])).toBe(false);
  });
});
