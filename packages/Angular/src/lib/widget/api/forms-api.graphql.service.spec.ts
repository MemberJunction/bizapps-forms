/**
 * The transport's one typed failure: an expired anonymous session.
 *
 * MJ's auth middleware rejects an expired session JWT with HTTP 401 and a GraphQL-shaped body
 * carrying a code — `{"errors":[{"message":"Token expired","extensions":{"code":"JWT_EXPIRED"}}]}`
 * (captured verbatim from a running host for bizapps-forms#123). Until this existed the transport
 * threw before it read that body, so the widget saw `Forms API request failed: HTTP 401` — a
 * message it could neither explain to a respondent nor tell apart from a network blip. An expired
 * session is different in kind: nothing sent with this token will ever succeed again, and the only
 * recovery is a new page. That distinction has to leave the transport as a type, not a string.
 */
import { describe, expect, it } from 'vitest';

import { SessionExpiredError } from './forms-api.interface';
import { isSessionExpired } from './forms-api.graphql.service';

/** The real 401 body, byte for byte. */
const EXPIRED_BODY = JSON.parse(
  '{"errors":[{"message":"Token expired","extensions":{"code":"JWT_EXPIRED"}}]}',
);

describe('isSessionExpired', () => {
  it('recognises the JWT_EXPIRED code MJ sends for a lapsed session', () => {
    expect(isSessionExpired(EXPIRED_BODY)).toBe(true);
  });

  it('is not fooled by other 401 bodies, which are not GraphQL envelopes at all', () => {
    // No token / bad signature: `{"error":"Authentication required"}` / `{"error":"Authentication failed"}`.
    // Those mean something else (a preview embed with no token, a rotated key) and "your session
    // timed out" would be false for them.
    expect(isSessionExpired({ error: 'Authentication required' })).toBe(false);
  });

  it('treats an ordinary GraphQL error as an ordinary failure', () => {
    expect(isSessionExpired({ errors: [{ message: 'Form unavailable (version-mismatch).' }] })).toBe(false);
    expect(isSessionExpired({ errors: [{ message: 'nope', extensions: { code: 'BAD_USER_INPUT' } }] })).toBe(false);
  });

  it('is false for a missing or non-JSON body', () => {
    expect(isSessionExpired(undefined)).toBe(false);
    expect(isSessionExpired({ data: { PublishedForm: null } })).toBe(false);
  });
});

describe('SessionExpiredError', () => {
  it('is an Error the widget can catch by type', () => {
    const err = new SessionExpiredError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SessionExpiredError');
    expect(err.message).toContain('session');
  });
});
