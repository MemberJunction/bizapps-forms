import type { ActionParam } from '@memberjunction/actions-base';

/**
 * Reading an action's OUTPUT parameters back on the client, which is not where they are.
 *
 * ── THE TRAP, ONCE, HERE. ────────────────────────────────────────────────────────────────────
 * `GraphQLActionClient.processActionResult` builds its return value as
 * `{ Success, Message, Result: <parsed ResultData>, Params: originalParams }`. So:
 *
 *   - `result.Params` is the caller's INPUTS. It never contains an output, no matter how
 *     reasonable `result.Params.find(p => p.Name === 'FormID')` looks.
 *   - `result.Result` is the outputs, parsed from a JSON string the server produced by
 *     stringifying an ARRAY — which arrives as an object keyed by array index
 *     (`{"0": {...}, "1": {...}}`), not as an array.
 *   - `result.ResultCode` does not exist. The mutation selects it and the client discards it, so
 *     a caller that needs to distinguish outcomes has to do it from the outputs.
 *
 * The first of those shipped as a real bug: "Author with AI" created a form and then dumped the
 * author back on the list, because the lookup for the new form's id could never succeed. Both
 * authoring paths were affected and neither errored.
 *
 * Lifted out of `home-aggregations.ts` when the builder needed the same reads. One copy of a trap
 * this shaped is already one more than anybody wants.
 */

/** What an action result looks like once `GraphQLActionClient` has finished with it. */
export interface ClientActionResult {
  Success?: boolean;
  Message?: string;
  /** The OUTPUT params: an index-keyed object (or an array, if a caller hands one over). */
  Result?: unknown;
  /** The caller's INPUTS. Consulted only as a fallback — see the file header. */
  Params?: readonly ActionParam[];
}

/**
 * One output parameter's value, or `undefined`.
 *
 * Checks `Result` first and `Params` second: the fallback exists so a caller that genuinely has an
 * output-bearing param list — a direct server-side run, or a future client that returns them —
 * keeps working rather than being punished for holding the better data.
 */
export function readActionOutput(result: ClientActionResult | undefined, name: string): unknown {
  if (!result) {
    return undefined;
  }
  const fromOutputs = findNamed(result.Result, name);
  return fromOutputs !== undefined ? fromOutputs : findNamed(result.Params, name);
}

/** An output parameter's value when it is a non-empty string, else `null`. */
export function readActionOutputString(
  result: ClientActionResult | undefined,
  name: string,
): string | null {
  const value = readActionOutput(result, name);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** An output parameter's value when it is an array of strings, else `undefined`. */
export function readActionOutputStrings(
  result: ClientActionResult | undefined,
  name: string,
): readonly string[] | undefined {
  const value = readActionOutput(result, name);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;
}

/**
 * Find a named entry in either shape a param collection arrives in.
 *
 * `Object.values` rather than an array assumption, because the index-keyed object is the NORMAL
 * case here and treating it as an array yields nothing while looking perfectly correct.
 */
function findNamed(collection: unknown, name: string): unknown {
  if (typeof collection !== 'object' || collection === null) {
    return undefined;
  }
  const entries = Array.isArray(collection) ? collection : Object.values(collection);
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const param = entry as { Name?: unknown; Value?: unknown };
    if (param.Name === name) {
      return param.Value;
    }
  }
  return undefined;
}
