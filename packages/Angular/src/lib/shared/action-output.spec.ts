/**
 * Reading an action's outputs back on the client.
 *
 * This module existed with no spec of its own, which is how the `Params` fallback below kept a
 * shape its own file header calls impossible: the header states plainly that `result.Params` is
 * the caller's INPUTS and "never contains an output", and the fallback then read an output out of
 * it anyway. The one test that encoded the distinction lived on a dead function and went with it.
 */
import { describe, expect, it } from 'vitest';
import { readActionOutput, readActionOutputString } from './action-output';

/** The shape `GraphQLActionClient.processActionResult` actually returns: outputs keyed by index. */
const outputs = (params: Array<Record<string, unknown>>) =>
  Object.fromEntries(params.map((p, i) => [String(i), p]));

describe('readActionOutput', () => {
  it('reads an output param out of the index-keyed Result object', () => {
    const result = { Result: outputs([{ Name: 'FormID', Value: 'NEW-FORM' }]) };
    expect(readActionOutput(result, 'FormID')).toBe('NEW-FORM');
  });

  it('reads an output param when a caller hands over a real array', () => {
    const result = { Result: [{ Name: 'FormID', Value: 'NEW-FORM' }] };
    expect(readActionOutput(result, 'FormID')).toBe('NEW-FORM');
  });

  it('IGNORES a same-named INPUT in Params', () => {
    // The live case, and the reason this file exists. The chat sends the open form's id as an
    // input named `FormID` on every turn, and reads `FormID` back to learn whether a form was
    // CREATED. A restyle sets no such output — so a fallback that accepts an input hands the
    // client the id of the form it is already on, and the builder navigates to itself on every
    // colour change.
    const result = {
      Result: outputs([{ Name: 'Reply', Value: 'Made it warmer.' }]),
      Params: [{ Name: 'FormID', Value: 'OPEN-FORM', Type: 'Input' as const }],
    };
    expect(readActionOutput(result, 'FormID')).toBeUndefined();
    expect(readActionOutputString(result, 'FormID')).toBeNull();
  });

  it('still accepts a genuine OUTPUT param that arrives in Params', () => {
    // The fallback's actual purpose: a direct server-side run whose params carry the outputs.
    const result = { Params: [{ Name: 'FormID', Value: 'NEW-FORM', Type: 'Output' as const }] };
    expect(readActionOutput(result, 'FormID')).toBe('NEW-FORM');
  });

  it('accepts a Both-typed param, which is an output as well as an input', () => {
    const result = { Params: [{ Name: 'FormID', Value: 'NEW-FORM', Type: 'Both' as const }] };
    expect(readActionOutput(result, 'FormID')).toBe('NEW-FORM');
  });

  it('prefers the Result over anything in Params', () => {
    const result = {
      Result: outputs([{ Name: 'FormID', Value: 'FROM-OUTPUT' }]),
      Params: [{ Name: 'FormID', Value: 'FROM-PARAMS', Type: 'Output' as const }],
    };
    expect(readActionOutput(result, 'FormID')).toBe('FROM-OUTPUT');
  });

  it('is undefined for a missing name and for a missing result', () => {
    expect(readActionOutput({ Result: outputs([]) }, 'FormID')).toBeUndefined();
    expect(readActionOutput(undefined, 'FormID')).toBeUndefined();
  });
});

describe('readActionOutputString', () => {
  it('rejects an empty string, which is not an id', () => {
    expect(readActionOutputString({ Result: outputs([{ Name: 'FormID', Value: '' }]) }, 'FormID')).toBeNull();
  });

  it('rejects a non-string value rather than coercing it', () => {
    expect(readActionOutputString({ Result: outputs([{ Name: 'FormID', Value: 42 }]) }, 'FormID')).toBeNull();
  });
});
