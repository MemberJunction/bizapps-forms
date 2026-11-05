/**
 * Which Forms actions a browser may run through MJ's `RunAction` mutation.
 *
 * MJ 6.2's `RunAction` fails closed (`MJServer/src/auth/actionAuthorization.ts`): a non-Owner may
 * run an action only when an `MJ: Action Authorizations` row links it to an authorization they
 * hold, or when the class that runs it declares `static AuthorizesCaller = true`. Forms home runs
 * two actions from the browser, and both were refused for every author who is not an Owner (#303
 * click-through, FAIL 1).
 *
 * MJ core's own client-called actions use the marker, and so do these two: each refuses a caller
 * who may not author forms (`prepareAuthoring` → `refuseFormAuthoring`) before doing anything, and
 * writes with the caller's own permissions, so that check stays the ONE authoring decision.
 *
 * No on-submit action carries it. The automation runner runs them through the Action engine; a
 * browser caller must not send a confirmation email or create a task with inputs it chooses.
 *
 * The checks mirror MJ's lookup exactly: the class registered under the action's name, and the
 * marker as that class's OWN property (`declaresAuthorizesCaller` ignores an inherited one).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { LoadFormsActions } from './register';

LoadFormsActions();

const BROWSER_CALLED = ['Forms: Create Form From Template', 'Forms: Generate Form From Brief'];
const RUNNER_ONLY = [
  'Forms: Upsert Respondent Person',
  'Forms: Send Confirmation Email',
  'Forms: Create Followup Task',
  'Forms: Analyze Written Responses',
  'Forms: Bind Response To Entity',
];

const declaresAuthorizesCaller = (actionName: string): boolean => {
  const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseAction, actionName);
  expect(registration, `${actionName} is not registered`).toBeTruthy();
  return Object.getOwnPropertyDescriptor(registration?.SubClass, 'AuthorizesCaller')?.value === true;
};

describe('AuthorizesCaller on the Forms actions', () => {
  it.each(BROWSER_CALLED)('"%s" authorizes its caller itself', (name) => {
    expect(declaresAuthorizesCaller(name)).toBe(true);
  });

  it.each(RUNNER_ONLY)('"%s" does not', (name) => {
    expect(declaresAuthorizesCaller(name)).toBe(false);
  });

  it('ships no Action Authorization metadata, which would override the marker', () => {
    // An action with ANY `MJ: Action Authorizations` row is decided by those rows alone; the marker
    // is read only when there are none.
    const metadata = join(__dirname, '../../../../metadata');
    expect(readdirSync(metadata)).not.toContain('action-authorizations');
  });
});
