/**
 * What the authoring-Action specs share: Action params as MJ builds them, the stub Designer, and
 * a fixed blueprint. The emulated database itself is `forms-world` from the
 * forms-core-entities-server testing subpath (each spec mocks the generated entity bases first;
 * see the spec headers).
 */
import { ActionParam, RunActionParams } from '@memberjunction/actions-base';
import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import type { DesignerBlueprint, FormBlueprint } from '@mj-biz-apps/forms-entities';
import type { FormDesignerModel } from '../llm-form-designer';

/**
 * What the Designer may author: the form itself — pages, questions, options, settings — and no
 * on-submit side effects (#303: those come from the caller's params only).
 */
export const DESIGNED_CONTENT: DesignerBlueprint = {
  name: 'Event RSVP',
  description: 'Tell us you are coming',
  renderMode: 'OneQuestion',
  confirmationMessage: 'See you there!',
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

/** The on-submit steps a CALLER asks for — through the `Automations` param on the Designer path. */
export const CALLER_AUTOMATIONS = [{ actionName: 'Forms: Send Confirmation Email' }];

/** The same form as a TRUSTED caller (engine, template) hands it over: content plus the caller's steps. */
export const FIXED_BLUEPRINT: FormBlueprint = { ...DESIGNED_CONTENT, automations: CALLER_AUTOMATIONS };

/** The Designer, stubbed: returns the designed content, so no LLM is involved. */
export const STUB_DESIGNER: FormDesignerModel = {
  design: async () => JSON.stringify(DESIGNED_CONTENT),
};

/**
 * A Designer that tries to author side effects — what a brief with injected instructions would get
 * out of a compliant model. `cleanAfter` replies is how many offending replies come before a clean one
 * (`Infinity`: never).
 */
export function sideEffectDesigner(cleanAfter: number): FormDesignerModel & { calls: () => number } {
  let calls = 0;
  return {
    calls: () => calls,
    design: async () => {
      calls += 1;
      return calls <= cleanAfter
        ? JSON.stringify({ ...DESIGNED_CONTENT, onSubmitMode: 'Configured', automations: [{ actionName: 'Some Powerful Action' }] })
        : JSON.stringify(DESIGNED_CONTENT);
    },
  };
}

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
