/**
 * What `Forms.GetRespondentForm` hands an anonymous respondent (#302, #303 Task 8): the contracts'
 * ALLOWLIST projection, with the link's captcha demand folded in.
 *
 * The payload used to be a denylist (`{ ...definition, automations: [] }`), so the scoring table,
 * every ending screen with its redirect and the knockout conditions all reached the browser. This
 * pins the server boundary: the serialized payload carries none of them, and still carries what the
 * widget needs to render. The projection's own field-by-field spec, including the key-decision table
 * a new snapshot key fails, is `contracts/respondent-definition.spec.ts` in forms-entities.
 */
import { describe, expect, it } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

import { respondentDefinitionFor, withDistributionCaptcha } from '../respondent-payload.js';

const SENTINEL_ACTION = '11111111-2222-4333-8444-555555555555';
const SENTINEL_AGENT = '66666666-7777-4888-8999-000000000000';

function definitionWithAutomations(): PublishedFormDefinition {
  return {
    formId: 'form-1',
    formVersionId: 'ver-1',
    name: 'Public payload fixture',
    description: 'a description',
    renderMode: 'Scroll',
    settings: { anonymousAllowed: true, captchaRequired: false, confirmationMessage: 'Thanks.' },
    styleTokens: { cssVariables: { '--mjf-accent': '#123456' } },
    pages: [
      {
        id: 'page-1',
        displayOrder: 1,
        conditionalRule: {
          jump: [{ when: { all: [{ questionId: 'q1', op: 'equals', value: 'a-knockout-answer' }] }, target: { kind: 'ending', id: 'end-ko' } }],
        },
        questions: [
          {
            id: 'q1',
            type: 'ShortText',
            prompt: 'Name',
            isRequired: false,
            displayOrder: 1,
            options: [],
            scoring: { points: 42 },
          },
        ],
      },
    ],
    endScreens: [
      { id: 'end-1', screenType: 'Ending', title: 'Thanks', displayOrder: 1, isDefault: true, redirectURL: 'https://secret.example/qualified' },
      { id: 'end-ko', screenType: 'Ending', title: 'Not eligible', displayOrder: 2, isDisqualification: true },
    ],
    automations: [
      {
        id: 'auto-1',
        name: 'Upsert the person',
        trigger: 'OnComplete',
        actionId: SENTINEL_ACTION,
        agentId: SENTINEL_AGENT,
        conditionalRule: { all: [{ questionId: 'q1', op: 'equals', value: 'a-secret-knockout-value' }] },
        displayOrder: 1,
      },
    ],
  } as unknown as PublishedFormDefinition;
}

describe('respondentDefinitionFor — the allowlist at the server boundary (#302)', () => {
  it('serializes no automation wiring: neither the action id, the agent id nor a trigger value', () => {
    const json = JSON.stringify(respondentDefinitionFor(definitionWithAutomations(), false));

    expect(json).not.toContain(SENTINEL_ACTION);
    expect(json).not.toContain(SENTINEL_AGENT);
    expect(json).not.toContain('a-secret-knockout-value');
    expect(json).not.toContain('automations');
  });

  it('serializes no ending screen, no redirect, no knockout condition and no scoring', () => {
    const json = JSON.stringify(respondentDefinitionFor(definitionWithAutomations(), false));

    expect(json).not.toContain('endScreens');
    expect(json).not.toContain('Not eligible');
    expect(json).not.toContain('secret.example');
    expect(json).not.toContain('a-knockout-answer');
    expect(json).not.toContain('scoring');
  });

  it('still carries everything the widget needs to render', () => {
    const projected = respondentDefinitionFor(definitionWithAutomations(), false);

    expect(projected).toMatchObject({
      formId: 'form-1',
      formVersionId: 'ver-1',
      name: 'Public payload fixture',
      description: 'a description',
      renderMode: 'Scroll',
      confirmationMessage: 'Thanks.',
      styleTokens: { cssVariables: { '--mjf-accent': '#123456' } },
    });
    expect(projected.pages[0].questions.map((q) => q.id)).toEqual(['q1']);
  });

  it('does not mutate the definition it was given', () => {
    const definition = definitionWithAutomations();
    const before = JSON.stringify(definition);

    respondentDefinitionFor(definition, true);

    expect(JSON.stringify(definition)).toBe(before);
  });
});

/**
 * The captcha fact the SUBMIT gate has always acted on, told to the widget that has to satisfy it.
 *
 * The submit gate (`FormSubmissionEngine`) gates on `captchaRequired(settings.captchaRequired,
 * distribution.CaptchaRequired)` — an OR — while the read projection once returned the snapshot's half
 * alone. A link with the column on
 * therefore rendered no challenge, collected no token, and had every completed submission refused
 * with `missing-token`, which is a form nobody can submit (#151).
 */
describe('withDistributionCaptcha', () => {
  it('turns the flag on when the distribution demands a captcha', () => {
    expect(withDistributionCaptcha(definitionWithAutomations(), true).settings.captchaRequired).toBe(true);
  });

  it('leaves a form that already asks for one alone', () => {
    const definition = definitionWithAutomations();
    definition.settings.captchaRequired = true;

    expect(withDistributionCaptcha(definition, false).settings.captchaRequired).toBe(true);
  });

  it('is false only when neither side asks', () => {
    expect(withDistributionCaptcha(definitionWithAutomations(), false).settings.captchaRequired).toBe(false);
  });

  it('does not mutate the definition it was given', () => {
    // The submit path re-resolves this same snapshot; a projection that wrote through would turn a
    // read into a silent write.
    const definition = definitionWithAutomations();

    withDistributionCaptcha(definition, true);

    expect(definition.settings.captchaRequired).toBe(false);
  });

  it('returns the argument itself when there is nothing to change, and says so in its doc', () => {
    // The contract is NON-MUTATION, not a fresh reference; this pins the real behaviour so the doc
    // cannot drift from it again without a test noticing.
    const unchanged = definitionWithAutomations();

    expect(withDistributionCaptcha(unchanged, false)).toBe(unchanged);
  });

  it('returns a NEW object on the path that does change the flag', () => {
    const widened = definitionWithAutomations();

    const out = withDistributionCaptcha(widened, true);

    expect(out).not.toBe(widened);
    expect(out.settings).not.toBe(widened.settings);
  });

  it('leaves every other setting untouched', () => {
    const projected = withDistributionCaptcha(definitionWithAutomations(), true);

    expect(projected.settings.confirmationMessage).toBe('Thanks.');
    expect(projected.settings.anonymousAllowed).toBe(true);
  });
});

describe('respondentDefinitionFor and the distribution captcha flag', () => {
  it('carries the flag the LINK demands, which is the field the widget reads', () => {
    expect(respondentDefinitionFor(definitionWithAutomations(), true).captchaRequired).toBe(true);
  });

  it('is false only when neither side asks', () => {
    expect(respondentDefinitionFor(definitionWithAutomations(), false).captchaRequired).toBe(false);
  });
});
