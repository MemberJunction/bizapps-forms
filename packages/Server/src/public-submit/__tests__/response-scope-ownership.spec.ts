import { describe, it, expect } from 'vitest';

import { responseIsOurs } from '../persistence.service';

/**
 * THE ownership rule, with the clause #138 adds: a caller may also act on the ONE response their
 * JWT is scoped to.
 *
 * The two credentials in `ResponseCaller` are not equals, and the whole issue turns on the
 * difference. `sessionId` is the `x-session-id` header — a value the caller chooses and can replay,
 * which is why naming a response id under a replayed header used to overwrite somebody else's
 * answers. `scopedResponseId` comes off the verified magic-link session (`UserInfo.MagicLinkScope`),
 * so it names exactly one row and cannot be forged by the browser.
 */
describe('responseIsOurs with a response-scoped caller', () => {
  const ROW_ID = '9DA322E6-0000-4000-8000-000000000001';
  const OTHER_ID = '33910B9E-0000-4000-8000-000000000002';
  const OWNED = { ID: ROW_ID, AnonymousSessionID: 's1' };
  const UNOWNED = { ID: ROW_ID, AnonymousSessionID: null };

  it('admits the session that owns the row, exactly as before', () => {
    expect(responseIsOurs(OWNED, { sessionId: 's1' })).toBe(true);
  });

  it('admits any caller when the row has no owner, exactly as before', () => {
    expect(responseIsOurs(UNOWNED, { sessionId: 'anyone' })).toBe(true);
    expect(responseIsOurs(UNOWNED, { sessionId: '' })).toBe(true);
  });

  it('admits a caller whose JWT scope names this row, whatever header they sent', () => {
    // This is the resume case: the second sitting mints a NEW x-session-id, and the row still
    // records the first sitting's. Without this clause the resumed save is refused as a takeover.
    expect(responseIsOurs(OWNED, { sessionId: 's2', scopedResponseId: ROW_ID })).toBe(true);
    expect(responseIsOurs(OWNED, { sessionId: '', scopedResponseId: ROW_ID })).toBe(true);
  });

  it('compares the scope case-insensitively, because the two sides spell a GUID differently', () => {
    // MJ mints the primary key client-side (lowercase) and SQL Server returns it uppercased. A
    // case-sensitive comparison here would refuse every resumed save — the same skew that once
    // rejected every anonymous submission with `version-mismatch`.
    expect(responseIsOurs(OWNED, { sessionId: '', scopedResponseId: ROW_ID.toLowerCase() })).toBe(true);
    expect(responseIsOurs({ ...OWNED, ID: ROW_ID.toLowerCase() }, { sessionId: '', scopedResponseId: ROW_ID })).toBe(true);
  });

  it('refuses a scope that names a DIFFERENT row', () => {
    expect(responseIsOurs(OWNED, { sessionId: 's2', scopedResponseId: OTHER_ID })).toBe(false);
  });

  it('refuses an absent scope exactly as it refuses a wrong header', () => {
    // An absent credential must never be more permissive than a wrong one (issue #78).
    expect(responseIsOurs(OWNED, { sessionId: 's2' })).toBe(false);
    expect(responseIsOurs(OWNED, { sessionId: '' })).toBe(false);
    expect(responseIsOurs(OWNED, { sessionId: '', scopedResponseId: '' })).toBe(false);
    expect(responseIsOurs(OWNED, { sessionId: '', scopedResponseId: '   ' })).toBe(false);
  });

  it('does not let a blank scope match a row whose id is somehow blank', () => {
    // Defensive: `foldSessionId('')` is `''` on both sides, so a naive equality would admit
    // everyone to a row with no id. Rows always have one, which is exactly why nobody would
    // notice this until something upstream handed us a partial row.
    expect(responseIsOurs({ ID: '', AnonymousSessionID: 'someone' }, { sessionId: 'other', scopedResponseId: '' })).toBe(false);
  });
});
