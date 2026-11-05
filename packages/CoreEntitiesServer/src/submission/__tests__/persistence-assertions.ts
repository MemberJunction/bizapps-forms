/**
 * Branch assertions for the public-submit persistence layer's result type.
 *
 * Kept in `forms-server` when the provider fake moved to `forms-core-entities-server/testing`:
 * `PersistenceResult` is this package's type, and the shared fake must not depend on it.
 */
import type { PersistenceResult } from '../persistence.js';

/**
 * Narrow a {@link PersistenceResult} to one branch, failing the test with the OTHER branch's words
 * if it went the other way.
 *
 * `PersistenceResult` is a discriminated union: a failure carries a `message`, a success carries a
 * `responseId` and a `status`, and neither carries the other's fields. Before that, every field was
 * optional and a spec could read `result.message` off a success and quietly assert `undefined`
 * against `undefined`. These make the branch an explicit assertion, and a wrong branch reports what
 * actually happened instead of a bare "expected undefined".
 */
export function expectPersistFailure(result: PersistenceResult): Extract<PersistenceResult, { outcome: 'failed' }> {
  if (result.outcome === 'saved') {
    throw new Error(`expected the save to FAIL, but it succeeded with response ${result.responseId}`);
  }
  return result;
}

export function expectPersistSuccess(result: PersistenceResult): Extract<PersistenceResult, { outcome: 'saved' }> {
  if (result.outcome === 'failed') {
    throw new Error(`expected the save to SUCCEED, but it failed: ${result.message}`);
  }
  return result;
}
