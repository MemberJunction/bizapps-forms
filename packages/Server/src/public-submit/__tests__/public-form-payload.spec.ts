/**
 * The anonymous `PublishedForm` payload, and the one thing it must NOT carry.
 *
 * This exists because the narrowing shipped untested: with the strip deleted, the whole
 * `packages/Server` suite stayed green (806 passed). A contract narrowing nothing asserts is a
 * narrowing that will be removed by someone tidying a spread, and the only symptom would be an
 * anonymous respondent quietly receiving the form's automation wiring again.
 */
import { describe, expect, it } from 'vitest';
import type { PublishedFormDefinition } from '@mj-biz-apps/forms-entities';

import { publicDefinition, publicFormPayload, withDistributionCaptcha } from '../public-form-payload';

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
        questions: [
          { id: 'q1', type: 'ShortText', prompt: 'Name', isRequired: false, displayOrder: 1, options: [] },
        ],
      },
    ],
    endScreens: [{ id: 'end-1', screenType: 'Ending', title: 'Thanks', displayOrder: 1, isDefault: true }],
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

describe('publicDefinition', () => {
  it('empties automations', () => {
    expect(publicDefinition(definitionWithAutomations()).automations).toEqual([]);
  });

  it('empties rather than DELETING the key, because the widget casts without checking', () => {
    // `forms-api.graphql.service.ts` does `JSON.parse(...) as PublishedFormDefinition`, and
    // `automations` is required on that type — a missing key would be a lie the compiler cannot
    // catch, and would break any consumer that round-trips the definition.
    expect(Object.hasOwn(publicDefinition(definitionWithAutomations()), 'automations')).toBe(true);
  });

  it('does not mutate the definition it was given', () => {
    // The server re-resolves automations from its own snapshot at submit time; a projection that
    // emptied the caller's object in place would turn a read into a silent write.
    const definition = definitionWithAutomations();

    publicDefinition(definition);

    expect(definition.automations).toHaveLength(1);
  });

  it('leaves every other key untouched', () => {
    const definition = definitionWithAutomations();
    const projected = publicDefinition(definition);

    for (const key of Object.keys(definition) as Array<keyof PublishedFormDefinition>) {
      if (key === 'automations') continue;
      expect(projected[key]).toEqual(definition[key]);
    }
  });
});

describe('publicFormPayload', () => {
  it('discloses neither the action id nor the agent id anywhere in the serialized payload', () => {
    // The assertion that matters. `automations: []` with the ids leaking through some other key
    // would satisfy a shape check and still hand a respondent the wiring.
    const serialized = JSON.stringify(publicFormPayload(definitionWithAutomations(), false));

    expect(serialized).not.toContain(SENTINEL_ACTION);
    expect(serialized).not.toContain(SENTINEL_AGENT);
  });

  it('does not disclose a trigger condition value', () => {
    const serialized = JSON.stringify(publicFormPayload(definitionWithAutomations(), false));

    expect(serialized).not.toContain('a-secret-knockout-value');
  });

  it('still carries everything the widget needs to render', () => {
    const payload = publicFormPayload(definitionWithAutomations(), false);

    expect(payload.formId).toBe('form-1');
    expect(payload.formVersionId).toBe('ver-1');
    expect(payload.name).toBe('Public payload fixture');
    expect(JSON.parse(payload.settingsJSON).confirmationMessage).toBe('Thanks.');
    expect(JSON.parse(payload.styleTokensJSON).cssVariables['--mjf-accent']).toBe('#123456');
    expect(JSON.parse(payload.definitionJSON).pages).toHaveLength(1);
    expect(JSON.parse(payload.definitionJSON).endScreens).toHaveLength(1);
  });

  it('round-trips definitionJSON back into a shape whose automations are empty', () => {
    const parsed = JSON.parse(publicFormPayload(definitionWithAutomations(), false).definitionJSON) as PublishedFormDefinition;

    expect(parsed.automations).toEqual([]);
  });
});

/**
 * The captcha fact the SUBMIT gate has always acted on, told to the widget that has to satisfy it.
 *
 * `submit-pipeline` stage 4 gates on `captchaRequired(settings.captchaRequired, distribution.CaptchaRequired)`
 * — an OR — while this projection returned the snapshot's half alone. A link with the column on
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
    // The submit pipeline re-resolves this same snapshot; a projection that wrote through would
    // turn a read into a silent write, exactly as `publicDefinition` must not.
    const definition = definitionWithAutomations();

    withDistributionCaptcha(definition, true);

    expect(definition.settings.captchaRequired).toBe(false);
  });

  it('returns the argument itself when there is nothing to change, and says so in its doc', () => {
    // The contract is NON-MUTATION, not a fresh reference — unlike `publicDefinition`, which
    // spreads unconditionally. The doc used to claim parity with it; this pins the real behaviour
    // so the two cannot drift apart again without a test noticing.
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

describe('publicFormPayload and the distribution captcha flag', () => {
  it('carries the flag in definitionJSON, which is the field the widget actually reads', () => {
    // `forms-api.graphql.service.ts` selects `definitionJSON` ALONE and parses it into the whole
    // definition. A fix that wrote only `settingsJSON` would pass a shape check and change nothing
    // the respondent sees, so this is the assertion that corresponds to a challenge appearing.
    const parsed = JSON.parse(publicFormPayload(definitionWithAutomations(), true).definitionJSON) as PublishedFormDefinition;

    expect(parsed.settings.captchaRequired).toBe(true);
  });

  it('carries it in settingsJSON too, so the two fields cannot disagree', () => {
    expect(JSON.parse(publicFormPayload(definitionWithAutomations(), true).settingsJSON).captchaRequired).toBe(true);
  });

  it('leaves both false when neither side asks', () => {
    const payload = publicFormPayload(definitionWithAutomations(), false);

    expect(JSON.parse(payload.definitionJSON).settings.captchaRequired).toBe(false);
    expect(JSON.parse(payload.settingsJSON).captchaRequired).toBe(false);
  });
});
