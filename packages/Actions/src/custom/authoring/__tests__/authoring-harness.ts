/**
 * What the authoring-Action specs share: Action params as MJ builds them, the stub Designer, and
 * a fixed blueprint. The emulated database itself is `forms-world` from the
 * forms-core-entities-server testing subpath (each spec mocks the generated entity bases first;
 * see the spec headers).
 */
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { FormBlueprint } from '@mj-biz-apps/forms-entities';
import type { FormDesignerModel } from '../llm-form-designer';

/** A blueprint touching pages, choice options, settings and an authored on-submit step. */
export const FIXED_BLUEPRINT: FormBlueprint = {
  name: 'Event RSVP',
  description: 'Tell us you are coming',
  renderMode: 'OneQuestion',
  confirmationMessage: 'See you there!',
  automations: [{ actionName: 'Forms: Send Confirmation Email' }],
  pages: [
    {
      title: 'You',
      questions: [
        { type: 'Email', prompt: 'Email', isRequired: true },
        { type: 'Number', prompt: '+1 count', settings: { min: 0, max: 10 } },
      ],
    },
    {
      title: 'Food',
      questions: [{ type: 'MultiChoice', prompt: 'Dietary restrictions', options: [{ label: 'Vegan' }, { label: 'None', value: 'none' }] }],
    },
  ],
};

/** The Designer, stubbed: returns the fixed blueprint, so no LLM is involved. */
export const STUB_DESIGNER: FormDesignerModel = {
  design: async () => JSON.stringify(FIXED_BLUEPRINT),
};

/** Action params as the Action engine hands them over. */
export function actionParams(
  provider: DatabaseProviderBase | undefined,
  user: UserInfo,
  inputs: Record<string, unknown>,
): RunActionParams {
  return Object.assign(new RunActionParams(), {
    ContextUser: user,
    Filters: [],
    Provider: provider,
    Params: Object.entries(inputs).map(([Name, Value]) => Object.assign(new ActionParam(), { Name, Value, Type: 'Input' })),
  });
}

/** An output param's value. */
export function output(params: RunActionParams, name: string): unknown {
  return params.Params.find((p) => p.Name === name && (p.Type === 'Output' || p.Type === 'Both'))?.Value;
}
